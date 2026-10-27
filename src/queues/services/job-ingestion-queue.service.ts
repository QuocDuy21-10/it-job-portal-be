import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_INGESTION_QUEUE } from '../queues.constants';

export const JOB_SOURCE_SYNC_JOB_NAME = 'sync-source';

export type JobSourceSyncPayload = {
  sourceKey: string;
};

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
      jobId: `sync-${sourceKey}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log(`Queued sync for job source: ${sourceKey}`);
  }
}
