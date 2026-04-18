import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailService } from 'src/mail/mail.service';
import { JOB_EXPIRATION_NOTIFICATION_QUEUE } from '../queues.constants';
import { JobExpiredNotificationPayload } from '../services/job-expiration-queue.service';

@Processor(JOB_EXPIRATION_NOTIFICATION_QUEUE)
export class JobExpirationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(JobExpirationQueueProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<JobExpiredNotificationPayload>): Promise<void> {
    this.logger.log(`Processing job ${job.id} (${job.name})`);

    try {
      switch (job.name) {
        case 'send-job-expired-notification':
          await this.handleExpiredNotification(job.data);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async handleExpiredNotification(data: JobExpiredNotificationPayload): Promise<void> {
    await this.mailService.sendJobExpiredNotification({
      hrEmail: data.hrEmail,
      jobName: data.jobName,
      companyName: data.companyName,
      jobId: data.jobId,
    });
    this.logger.log(`Job expiration notification sent to ${data.hrEmail} for job ${data.jobId}`);
  }
}
