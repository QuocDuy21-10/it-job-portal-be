import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JobIngestionService } from 'src/job-ingestion/job-ingestion.service';
import { JOB_INGESTION_QUEUE } from '../queues.constants';
import {
  JOB_SOURCE_SYNC_JOB_NAME,
  JobSourceSyncPayload,
} from '../services/job-ingestion-queue.service';

@Processor(JOB_INGESTION_QUEUE)
export class JobIngestionQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(JobIngestionQueueProcessor.name);

  constructor(private readonly jobIngestionService: JobIngestionService) {
    super();
  }

  async process(job: Job<JobSourceSyncPayload>): Promise<void> {
    this.logger.log(`Processing job ${job.id} (${job.name})`);

    if (job.name !== JOB_SOURCE_SYNC_JOB_NAME) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    await this.jobIngestionService.syncSource(job.data.sourceKey);
  }
}
