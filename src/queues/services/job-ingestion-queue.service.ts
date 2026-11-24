import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_INGESTION_QUEUE } from '../queues.constants';

export const JOB_SOURCE_SYNC_JOB_NAME = 'sync-source';

export type JobSourceSyncPayload = {
  sourceKey: string;
};

const syncJobId = (sourceKey: string) => `sync-${sourceKey}`;

@Injectable()
export class JobIngestionQueueService {
  private readonly logger = new Logger(JobIngestionQueueService.name);

  constructor(
    @InjectQueue(JOB_INGESTION_QUEUE)
    private readonly jobIngestionQueue: Queue,
  ) {}

  async enqueueSync(sourceKey: string): Promise<void> {
    const payload: JobSourceSyncPayload = { sourceKey };

    // Same jobId dedupes cron and manual triggers. BullMQ ignores add() for an existing
    // jobId in ANY state, so failed jobs must be removed or they block future syncs.
    await this.jobIngestionQueue.add(JOB_SOURCE_SYNC_JOB_NAME, payload, {
      jobId: syncJobId(sourceKey),
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log(`Queued sync for job source: ${sourceKey}`);
  }

  /** Drops a waiting sync. False while one is running: BullMQ cannot stop it. */
  async cancelSync(sourceKey: string): Promise<boolean> {
    const job = await this.jobIngestionQueue.getJob(syncJobId(sourceKey));

    if (!job) {
      return true;
    }

    if (await job.isActive()) {
      return false;
    }

    try {
      await job.remove();
      return true;
    } catch (error) {
      // A worker may have picked it up between the check and the removal.
      if (await job.isActive()) {
        return false;
      }

      throw error;
    }
  }
}
