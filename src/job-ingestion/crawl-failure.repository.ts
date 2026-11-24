import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ERejectionReason } from './enums/rejection-reason.enum';
import {
  ICrawlFailureInput,
  ICrawlFailureObservation,
  ISourceRejection,
} from './interfaces/job-lifecycle.interface';
import { DAY_MS, FAILURE_DETAIL_MAX_LENGTH, REJECTION_RETRY_DAYS } from './job-ingestion.constants';
import { CrawlFailure, CrawlFailureDocument } from './schemas/crawl-failure.schema';

// NOT_IT means the crawler worked and filtered the job out.
export const ERROR_REASONS = Object.values(ERejectionReason).filter(
  reason => reason !== ERejectionReason.NOT_IT,
);

@Injectable()
export class CrawlFailureRepository {
  constructor(
    @InjectModel(CrawlFailure.name)
    private readonly crawlFailureModel: Model<CrawlFailureDocument>,
  ) {}

  async findWaiting(sourceKey: string, now: Date): Promise<ISourceRejection[]> {
    return this.crawlFailureModel
      .find({ sourceKey, retryAt: { $gt: now } })
      .select('-_id externalId reason retryAt')
      .lean<ISourceRejection[]>();
  }

  async record(
    sourceKey: string,
    { failures, keptIds, listedIds, listingComplete, now }: ICrawlFailureObservation,
  ): Promise<void> {
    // Keyed by id: two upserts of one new job in an unordered batch would collide.
    const byId = new Map(failures.map(failure => [failure.externalId, failure]));

    if (byId.size > 0) {
      await this.crawlFailureModel.bulkWrite(
        [...byId.values()].map(failure => ({
          updateOne: {
            filter: { sourceKey, externalId: failure.externalId },
            update: this.buildUpdate(failure, now),
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    await this.crawlFailureModel.deleteMany({ sourceKey, externalId: { $in: keptIds } });

    if (listingComplete) {
      await this.crawlFailureModel.deleteMany({ sourceKey, externalId: { $nin: listedIds } });
    }
  }

  private buildUpdate({ reason, url, title, detail }: ICrawlFailureInput, now: Date) {
    return {
      $set: {
        reason,
        failedAt: now,
        retryAt: new Date(now.getTime() + REJECTION_RETRY_DAYS[reason] * DAY_MS),
        ...(url && { url }),
        ...(title && { title }),
        ...(detail && { detail: detail.slice(0, FAILURE_DETAIL_MAX_LENGTH) }),
      },
      ...(!detail && { $unset: { detail: 1 } }),
    };
  }
}
