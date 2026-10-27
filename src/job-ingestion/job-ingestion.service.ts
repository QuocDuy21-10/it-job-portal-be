import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { UnrecoverableError } from 'bullmq';
import { Model } from 'mongoose';
import { JobIngestionQueueService } from 'src/queues/services/job-ingestion-queue.service';
import { SkillsService } from 'src/skills/skills.service';
import { IAtsAdapter, IRawAtsJob } from './adapters/ats-adapter.interface';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter';
import { LeverAdapter } from './adapters/lever.adapter';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { EJobSourceProvider } from './enums/job-source-provider.enum';
import { ESyncStatus } from './enums/sync-status.enum';
import {
  extractSkills,
  hasRequiredFields,
  htmlToText,
  inferLevel,
  isItJob,
  isRemote,
  isVnOrRemote,
  resolveLocationCode,
  sanitizeDescription,
} from './ingestion-filters';
import { ExternalJob, ExternalJobDocument } from './schemas/external-job.schema';
import { JobSource, JobSourceDocument } from './schemas/job-source.schema';

const EMPTY_BOARD_ERROR = 'empty board response';

@Injectable()
export class JobIngestionService {
  private readonly logger = new Logger(JobIngestionService.name);
  private readonly adapters: Map<EJobSourceProvider, IAtsAdapter>;

  constructor(
    @InjectModel(JobSource.name)
    private readonly jobSourceModel: Model<JobSourceDocument>,
    @InjectModel(ExternalJob.name)
    private readonly externalJobModel: Model<ExternalJobDocument>,
    private readonly skillsService: SkillsService,
    private readonly jobIngestionQueueService: JobIngestionQueueService,
    greenhouseAdapter: GreenhouseAdapter,
    leverAdapter: LeverAdapter,
  ) {
    this.adapters = new Map<EJobSourceProvider, IAtsAdapter>(
      [greenhouseAdapter, leverAdapter].map(adapter => [adapter.provider, adapter]),
    );
  }

  @Cron('0 */6 * * *', {
    name: 'sync-external-job-sources',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async enqueueEnabledSources(): Promise<void> {
    const sources = await this.jobSourceModel.find({ enabled: true }).select('key').lean();
    await Promise.all(sources.map(source => this.jobIngestionQueueService.enqueueSync(source.key)));
  }

  async findAllSources(): Promise<JobSource[]> {
    return this.jobSourceModel.find().sort({ key: 1 }).lean<JobSource[]>();
  }

  async requestSync(key: string): Promise<{ key: string; queued: true }> {
    const exists = await this.jobSourceModel.exists({ key });

    if (!exists) {
      throw new NotFoundException(`Job source '${key}' not found`);
    }

    await this.jobIngestionQueueService.enqueueSync(key);
    return { key, queued: true };
  }

  async syncSource(sourceKey: string): Promise<void> {
    const source = await this.jobSourceModel.findOne({ key: sourceKey }).lean();

    if (!source || !source.enabled) {
      this.logger.warn(`Skipping sync for missing or disabled job source: ${sourceKey}`);
      return;
    }

    try {
      const adapter = this.adapters.get(source.provider);

      if (!adapter) {
        throw new UnrecoverableError(`No adapter for provider ${source.provider}`);
      }

      const raws = await adapter.fetchJobs(source.boardToken);

      if (raws.length === 0) {
        const activeCount = await this.externalJobModel.countDocuments({
          sourceKey,
          status: EExternalJobStatus.ACTIVE,
        });

        // A full board never empties out at once in practice; treat it as a bad response.
        if (activeCount > 0) {
          await this.markSyncFailed(sourceKey, EMPTY_BOARD_ERROR);
          return;
        }
      }

      const validRaws = raws.filter(hasRequiredFields);
      const keptRaws = validRaws.filter(raw => isItJob(raw.title) && isVnOrRemote(raw));
      const aliasMap = await this.skillsService.getAliasMap();
      const now = new Date();

      let upserted = 0;

      if (keptRaws.length > 0) {
        const writeResult = await this.externalJobModel.bulkWrite(
          keptRaws.map(raw => ({
            updateOne: {
              filter: { sourceKey, externalId: raw.externalId },
              update: {
                $set: this.toExternalJob(raw, sourceKey, source.companyName, aliasMap, now),
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
        upserted = writeResult.upsertedCount;
      }

      const closeResult = await this.externalJobModel.updateMany(
        {
          sourceKey,
          status: EExternalJobStatus.ACTIVE,
          externalId: { $nin: keptRaws.map(raw => raw.externalId) },
        },
        { $set: { status: EExternalJobStatus.CLOSED } },
      );

      await this.jobSourceModel.updateOne(
        { key: sourceKey },
        {
          $set: {
            lastSyncedAt: now,
            lastSyncStatus: ESyncStatus.SUCCESS,
            lastSyncStats: {
              fetched: raws.length,
              kept: keptRaws.length,
              skipped: raws.length - validRaws.length,
              upserted,
              closed: closeResult.modifiedCount,
            },
          },
          $unset: { lastSyncError: 1 },
        },
      );
      this.logger.log(`Synced job source ${sourceKey}: ${keptRaws.length} kept of ${raws.length}`);
    } catch (error) {
      await this.markSyncFailed(sourceKey, error.message);
      throw error;
    }
  }

  private toExternalJob(
    raw: IRawAtsJob,
    sourceKey: string,
    companyName: string,
    aliasMap: Record<string, string>,
    now: Date,
  ) {
    const descriptionHtml = sanitizeDescription(raw.descriptionHtml);

    return {
      sourceKey,
      externalId: raw.externalId,
      sourceUrl: raw.sourceUrl,
      applyUrl: raw.applyUrl ?? raw.sourceUrl,
      title: raw.title,
      companyName,
      location: raw.location,
      locationCode: resolveLocationCode(raw.location),
      isRemote: isRemote(raw),
      skills: extractSkills(`${raw.title} ${htmlToText(descriptionHtml)}`, aliasMap),
      level: inferLevel(raw.title),
      descriptionHtml,
      publishedAt: raw.publishedAt,
      status: EExternalJobStatus.ACTIVE,
      lastSeenAt: now,
    };
  }

  private async markSyncFailed(sourceKey: string, message: string): Promise<void> {
    await this.jobSourceModel.updateOne(
      { key: sourceKey },
      {
        $set: {
          lastSyncedAt: new Date(),
          lastSyncStatus: ESyncStatus.FAILED,
          lastSyncError: message,
        },
      },
    );
  }
}
