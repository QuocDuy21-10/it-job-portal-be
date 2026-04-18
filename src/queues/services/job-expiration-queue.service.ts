import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_EXPIRATION_NOTIFICATION_QUEUE } from '../queues.constants';

export interface JobExpiredNotificationPayload {
  jobId: string;
  jobName: string;
  companyName: string;
  hrEmail: string;
}

@Injectable()
export class JobExpirationQueueService {
  private readonly logger = new Logger(JobExpirationQueueService.name);

  constructor(
    @InjectQueue(JOB_EXPIRATION_NOTIFICATION_QUEUE)
    private readonly jobExpirationQueue: Queue,
  ) {}

  async addExpiredJobNotification(payload: JobExpiredNotificationPayload): Promise<void> {
    try {
      await this.jobExpirationQueue.add('send-job-expired-notification', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(`Queued expiration notification for job: ${payload.jobId}`);
    } catch (error) {
      this.logger.error(`Failed to queue expiration notification: ${error.message}`, error.stack);
    }
  }
}
