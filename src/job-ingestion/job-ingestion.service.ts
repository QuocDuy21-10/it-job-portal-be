import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { JobIngestionQueueService } from 'src/queues/services/job-ingestion-queue.service';
import { ListCrawlRunsQueryDto } from './dto/list-crawl-runs-query.dto';
import { UpdateJobSourceDto } from './dto/update-job-source.dto';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { ExternalJobRepository } from './external-job.repository';
import { CRAWL_RUNS_DEFAULT_LIMIT, CRAWL_RUNS_MAX_LIMIT } from './job-ingestion.constants';
import { CrawlRun, CrawlRunDocument } from './schemas/crawl-run.schema';
import { JobSource, JobSourceDocument } from './schemas/job-source.schema';
import { SourceSyncCoordinator } from './source-sync-coordinator';

@Injectable()
export class JobIngestionService {
  constructor(
    @InjectModel(JobSource.name)
    private readonly jobSourceModel: Model<JobSourceDocument>,
    @InjectModel(CrawlRun.name)
    private readonly crawlRunModel: Model<CrawlRunDocument>,
    private readonly externalJobRepository: ExternalJobRepository,
    private readonly jobIngestionQueueService: JobIngestionQueueService,
    private readonly sourceSyncCoordinator: SourceSyncCoordinator,
  ) {}

  @Cron('0 */6 * * *', {
    name: 'sync-external-job-sources',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async enqueueEnabledSources(): Promise<void> {
    const sources = await this.jobSourceModel.find({ enabled: true }).select('key').lean();
    await Promise.all(sources.map(source => this.jobIngestionQueueService.enqueueSync(source.key)));
  }

  async findAllSources(): Promise<JobSource[]> {
    return this.jobSourceModel.find().select('-rejections').sort({ key: 1 }).lean<JobSource[]>();
  }

  async requestSync(key: string): Promise<{ key: string; queued: true }> {
    const exists = await this.jobSourceModel.exists({ key });

    if (!exists) {
      throw new NotFoundException(`Job source '${key}' not found`);
    }

    await this.jobIngestionQueueService.enqueueSync(key);
    return { key, queued: true };
  }

  syncSource(sourceKey: string): Promise<void> {
    return this.sourceSyncCoordinator.run(sourceKey);
  }

  async updateSource(key: string, dto: UpdateJobSourceDto): Promise<JobSource> {
    const previous = await this.jobSourceModel
      .findOneAndUpdate({ key }, { $set: dto }, { new: false })
      .lean<JobSource>();

    if (!previous) {
      throw new NotFoundException(`Job source '${key}' not found`);
    }

    const { displayPolicy } = dto;

    if (displayPolicy && displayPolicy !== previous.displayPolicy) {
      if (displayPolicy === EJobSourceDisplayPolicy.LINK_ONLY) {
        await this.externalJobRepository.clearDescriptions(key);
      } else if (displayPolicy === EJobSourceDisplayPolicy.FULL) {
        await this.externalJobRepository.resetFetchedAt(key);
      }
    }

    return { ...previous, ...dto };
  }

  async findRuns(key: string, query: ListCrawlRunsQueryDto): Promise<CrawlRun[]> {
    const exists = await this.jobSourceModel.exists({ key });

    if (!exists) {
      throw new NotFoundException(`Job source '${key}' not found`);
    }

    // ValidationPipe does not transform, so limit may still be a string here.
    const limit = Math.min(Number(query.limit) || CRAWL_RUNS_DEFAULT_LIMIT, CRAWL_RUNS_MAX_LIMIT);

    return this.crawlRunModel
      .find({ sourceKey: key })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean<CrawlRun[]>();
  }
}
