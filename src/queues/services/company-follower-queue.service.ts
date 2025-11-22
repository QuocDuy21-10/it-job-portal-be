import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMPANY_FOLLOWER_NOTIFICATION_QUEUE } from '../queues.constants';

export interface NewJobNotificationPayload {
  jobId: string;
  companyId: string;
  jobName: string;
  companyName: string;
}

@Injectable()
export class CompanyFollowerQueueService {
  private readonly logger = new Logger(CompanyFollowerQueueService.name);

  constructor(
    @InjectQueue(COMPANY_FOLLOWER_NOTIFICATION_QUEUE)
    private readonly companyFollowerQueue: Queue,
  ) {}

  /**
   * Add new job notification to queue
   * This is called when HR creates a new job
   */
  async addNewJobNotification(payload: NewJobNotificationPayload): Promise<void> {
    try {
      await this.companyFollowerQueue.add(
        'send-new-job-notification',
        payload,
        {
          attempts: 3, // Retry 3 times if failed
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 seconds delay
          },
          removeOnComplete: true, // Clean up completed jobs
          removeOnFail: false, // Keep failed jobs for debugging
        },
      );

      this.logger.log(
        `Added new job notification to queue for job: ${payload.jobId}, company: ${payload.companyId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add new job notification to queue: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
