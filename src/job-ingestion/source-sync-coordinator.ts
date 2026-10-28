import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { UnrecoverableError } from 'bullmq';
import { Model } from 'mongoose';
import { SkillsService } from 'src/skills/skills.service';
import { IAtsAdapter, IRejectedAtsJob } from './adapters/ats-adapter.interface';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter';
import { ItviecAdapter } from './adapters/itviec.adapter';
import { LeverAdapter } from './adapters/lever.adapter';
import { TopDevAdapter } from './adapters/topdev.adapter';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { EJobSourceProvider } from './enums/job-source-provider.enum';
import { ERejectionReason } from './enums/rejection-reason.enum';
import { ESyncStatus } from './enums/sync-status.enum';
import { ExternalJobRepository } from './external-job.repository';
import {
  hasRequiredFields,
  isItJob,
  isVnOrRemote,
  normalizeExternalJob,
} from './ingestion-filters';
import { ICrawlRunStats } from './interfaces/crawl-run-stats.interface';
import { ISourceRejection } from './interfaces/job-lifecycle.interface';
import { INormalizedExternalJob } from './interfaces/normalized-external-job.interface';
import { ALERT_AFTER_FAILURES, DEFAULT_DISPLAY_POLICY } from './job-ingestion.constants';
import { JobLifecycleService } from './job-lifecycle.service';
import { CrawlRun, CrawlRunDocument } from './schemas/crawl-run.schema';
import { JobSource, JobSourceDocument } from './schemas/job-source.schema';

type SyncOutcome = {
  status: ESyncStatus;
  message?: string;
  stoppedReason?: string;
  stats?: ICrawlRunStats;
  rejections?: ISourceRejection[];
  listedCount?: number;
};

const FAILED_STATUSES = new Set([ESyncStatus.FAILED, ESyncStatus.SUSPECT]);

/** Runs one sync of one source: fetch, normalize, persist, apply lifecycle, record the run. */
@Injectable()
export class SourceSyncCoordinator {
  private readonly logger = new Logger(SourceSyncCoordinator.name);
  private readonly adapters: Map<EJobSourceProvider, IAtsAdapter>;

  constructor(
    @InjectModel(JobSource.name)
    private readonly jobSourceModel: Model<JobSourceDocument>,
    @InjectModel(CrawlRun.name)
    private readonly crawlRunModel: Model<CrawlRunDocument>,
    private readonly repository: ExternalJobRepository,
    private readonly lifecycle: JobLifecycleService,
    private readonly skillsService: SkillsService,
    greenhouseAdapter: GreenhouseAdapter,
    leverAdapter: LeverAdapter,
    topDevAdapter: TopDevAdapter,
    itviecAdapter: ItviecAdapter,
  ) {
    this.adapters = new Map<EJobSourceProvider, IAtsAdapter>(
      [greenhouseAdapter, leverAdapter, topDevAdapter, itviecAdapter].map(adapter => [
        adapter.provider,
        adapter,
      ]),
    );
  }

  async run(sourceKey: string): Promise<void> {
    const source = await this.jobSourceModel.findOne({ key: sourceKey }).lean<JobSource>();

    if (!source || !source.enabled) {
      this.logger.warn(`Skipping sync for missing or disabled job source: ${sourceKey}`);
      return;
    }

    const now = new Date();
    const crawlRun = await this.crawlRunModel.create({
      sourceKey,
      startedAt: now,
      status: ESyncStatus.RUNNING,
    });

    try {
      await this.finish(source, crawlRun._id, await this.sync(source, now));
    } catch (error) {
      await this.finish(source, crawlRun._id, {
        status: ESyncStatus.FAILED,
        message: error.message,
      });
      throw error;
    }
  }

  private async sync(source: JobSource, now: Date): Promise<SyncOutcome> {
    const sourceKey = source.key;
    const adapter = this.adapters.get(source.provider);

    if (!adapter) {
      throw new UnrecoverableError(`No adapter for provider ${source.provider}`);
    }

    const displayPolicy = source.displayPolicy ?? DEFAULT_DISPLAY_POLICY;
    const keepDescription = displayPolicy !== EJobSourceDisplayPolicy.LINK_ONLY;

    if (!keepDescription) {
      await this.repository.clearDescriptions(sourceKey);
    }

    const known = await this.repository.loadKnownStates(sourceKey);
    const previousRejections = source.rejections ?? [];
    let planned: number | undefined;
    const {
      jobs: raws,
      listedIds,
      rejected: adapterRejected = [],
      stoppedEarly,
    } = await adapter.fetchJobs(source.boardToken, {
      selectForFetch: ids => {
        const plan = this.lifecycle.planFetch(ids, known, previousRejections, now);
        planned = plan.length;
        return plan;
      },
    });

    const baseline =
      source.lastSuccessfulListedCount ?? (await this.repository.countVisible(sourceKey));
    const suspect = this.lifecycle.isSuspectListing(listedIds.length, baseline);
    const aliasMap = await this.skillsService.getAliasMap();
    const rejected: IRejectedAtsJob[] = [...adapterRejected];
    const kept: INormalizedExternalJob[] = [];

    for (const raw of raws) {
      if (!hasRequiredFields(raw)) {
        if (raw.externalId) {
          rejected.push({ externalId: raw.externalId, reason: ERejectionReason.MISSING_FIELDS });
        }
      } else if (!isItJob(raw.title) || !isVnOrRemote(raw)) {
        rejected.push({ externalId: raw.externalId, reason: ERejectionReason.NOT_IT });
      } else {
        kept.push(
          normalizeExternalJob(raw, {
            sourceKey,
            companyName: source.companyName,
            aliasMap,
            keepDescription,
          }),
        );
      }
    }

    const keptIds = kept.map(job => job.externalId);
    const upserted = await this.repository.upsertFetched(kept, known, now);
    const transitions = this.lifecycle.computeTransitions(known, {
      listedIds,
      fetchedIds: keptIds,
      rejected,
      listingComplete: !suspect,
      now,
    });

    await this.repository.markSeen(sourceKey, transitions.seenIds, now);
    const staled = await this.repository.markStale(sourceKey, transitions.staleIds, now);
    const closed =
      (await this.repository.close(sourceKey, transitions.closures, now)) +
      (await this.repository.closeExpired(sourceKey, now));

    this.logger.log(`Synced job source ${sourceKey}: ${kept.length} kept of ${raws.length}`);

    return {
      status: suspect
        ? ESyncStatus.SUSPECT
        : stoppedEarly
          ? ESyncStatus.PARTIAL
          : ESyncStatus.SUCCESS,
      message: suspect
        ? `listing shrank: ${listedIds.length} of ${baseline}`
        : stoppedEarly && `stopped early: ${stoppedEarly}`,
      stoppedReason: stoppedEarly,
      stats: {
        listed: listedIds.length,
        planned: planned ?? listedIds.length,
        fetched: raws.length,
        kept: kept.length,
        rejected: rejected.length,
        ...upserted,
        staled,
        closed,
      },
      rejections: this.lifecycle.mergeRejections(
        previousRejections,
        rejected,
        keptIds,
        listedIds,
        now,
      ),
      listedCount: listedIds.length,
    };
  }

  private async finish(source: JobSource, runId: unknown, outcome: SyncOutcome): Promise<void> {
    const { status, message, stoppedReason, stats, rejections, listedCount } = outcome;
    const failed = FAILED_STATUSES.has(status);
    const consecutiveFailures = failed ? (source.consecutiveFailures ?? 0) + 1 : 0;
    const finishedAt = new Date();

    await this.crawlRunModel.updateOne(
      { _id: runId },
      {
        $set: {
          status,
          finishedAt,
          ...(stats && { stats }),
          ...(stoppedReason && { stoppedReason }),
          ...(message && { error: message }),
        },
      },
    );
    await this.jobSourceModel.updateOne(
      { key: source.key },
      {
        $set: {
          lastSyncedAt: finishedAt,
          lastSyncStatus: status,
          consecutiveFailures,
          ...(stats && { lastSyncStats: stats }),
          ...(rejections && { rejections }),
          ...(!failed && listedCount !== undefined && { lastSuccessfulListedCount: listedCount }),
          ...(message && { lastSyncError: message }),
        },
        $unset: { rejectedExternalIds: 1, ...(!message && { lastSyncError: 1 }) },
      },
    );

    if (status === ESyncStatus.SUSPECT || consecutiveFailures >= ALERT_AFTER_FAILURES) {
      // shortcut: alerting is a log line only, wire Slack/email once alert infra exists
      this.logger.error(
        `[ingestion-alert] ${source.key}: ${status}, ${consecutiveFailures} consecutive failures` +
          (message ? `: ${message}` : ''),
      );
    }
  }
}
