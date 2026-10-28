import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EExternalJobCloseReason } from './enums/external-job-close-reason.enum';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { computeContentHash } from './ingestion-filters';
import { IUpsertCounts } from './interfaces/crawl-run-stats.interface';
import { IJobClosure, IKnownJobState } from './interfaces/job-lifecycle.interface';
import { INormalizedExternalJob } from './interfaces/normalized-external-job.interface';
import { VISIBLE_EXTERNAL_JOB_STATUSES } from './job-ingestion.constants';
import { ExternalJob, ExternalJobDocument } from './schemas/external-job.schema';

const KNOWN_STATE_FIELDS =
  'externalId status lastFetchedAt expiresAt staleSince closeReason contentHash';
const VISIBLE = { $in: VISIBLE_EXTERNAL_JOB_STATUSES };

const closeUpdate = (reason: EExternalJobCloseReason, now: Date) => ({
  $set: { status: EExternalJobStatus.CLOSED, closedAt: now, closeReason: reason },
  $unset: { staleSince: 1 },
});

@Injectable()
export class ExternalJobRepository {
  constructor(
    @InjectModel(ExternalJob.name)
    private readonly externalJobModel: Model<ExternalJobDocument>,
  ) {}

  async loadKnownStates(sourceKey: string): Promise<Map<string, IKnownJobState>> {
    const states = await this.externalJobModel
      .find({ sourceKey })
      .select(KNOWN_STATE_FIELDS)
      .lean<IKnownJobState[]>();

    return new Map(states.map(state => [state.externalId, state]));
  }

  async upsertFetched(
    jobs: INormalizedExternalJob[],
    known: ReadonlyMap<string, IKnownJobState>,
    now: Date,
  ): Promise<IUpsertCounts> {
    const counts: IUpsertCounts = { created: 0, updated: 0, unchanged: 0, reactivated: 0 };

    if (jobs.length === 0) {
      return counts;
    }

    const lifecycle = { status: EExternalJobStatus.ACTIVE, lastFetchedAt: now, lastSeenAt: now };
    const operations = jobs.map(job => {
      const contentHash = computeContentHash(job);
      const previous = known.get(job.externalId);
      const isUnchanged = previous?.contentHash === contentHash;

      if (!previous) {
        counts.created++;
      } else if (isUnchanged) {
        counts.unchanged++;
      } else {
        counts.updated++;
      }

      if (previous?.status === EExternalJobStatus.CLOSED) {
        counts.reactivated++;
      }

      return {
        updateOne: {
          filter: { sourceKey: job.sourceKey, externalId: job.externalId },
          update: {
            $set: isUnchanged
              ? lifecycle
              : { ...job, ...lifecycle, contentHash, lastContentUpdatedAt: now },
            $unset: { staleSince: 1, closedAt: 1, closeReason: 1 },
          },
          upsert: true,
        },
      };
    });

    await this.externalJobModel.bulkWrite(operations, { ordered: false });
    return counts;
  }

  async markSeen(sourceKey: string, ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.externalJobModel.updateMany(
      { sourceKey, externalId: { $in: ids }, status: VISIBLE },
      { $set: { lastSeenAt: now, status: EExternalJobStatus.ACTIVE }, $unset: { staleSince: 1 } },
    );
  }

  async markStale(sourceKey: string, ids: string[], now: Date): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.externalJobModel.updateMany(
      { sourceKey, externalId: { $in: ids }, status: EExternalJobStatus.ACTIVE },
      { $set: { status: EExternalJobStatus.STALE, staleSince: now } },
    );
    return result.modifiedCount;
  }

  async close(sourceKey: string, closures: IJobClosure[], now: Date): Promise<number> {
    if (closures.length === 0) {
      return 0;
    }

    const idsByReason = new Map<EExternalJobCloseReason, string[]>();

    for (const { externalId, reason } of closures) {
      idsByReason.set(reason, [...(idsByReason.get(reason) ?? []), externalId]);
    }

    const result = await this.externalJobModel.bulkWrite(
      [...idsByReason].map(([reason, ids]) => ({
        updateMany: {
          filter: { sourceKey, externalId: { $in: ids }, status: VISIBLE },
          update: closeUpdate(reason, now),
        },
      })),
    );
    return result.modifiedCount;
  }

  async closeExpired(sourceKey: string, now: Date): Promise<number> {
    const result = await this.externalJobModel.updateMany(
      { sourceKey, status: VISIBLE, expiresAt: { $lt: now } },
      closeUpdate(EExternalJobCloseReason.EXPIRED, now),
    );
    return result.modifiedCount;
  }

  countVisible(sourceKey: string): Promise<number> {
    return this.externalJobModel.countDocuments({ sourceKey, status: VISIBLE });
  }

  async clearDescriptions(sourceKey: string): Promise<void> {
    await this.externalJobModel.updateMany(
      { sourceKey, descriptionHtml: { $ne: '' } },
      { $set: { descriptionHtml: '' } },
    );
  }

  // Makes the fetch plan refresh every visible job of the source over the next runs.
  async resetFetchedAt(sourceKey: string): Promise<void> {
    await this.externalJobModel.updateMany(
      { sourceKey, status: VISIBLE },
      { $unset: { lastFetchedAt: 1 } },
    );
  }
}
