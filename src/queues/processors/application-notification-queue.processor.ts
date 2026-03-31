import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailService } from 'src/mail/mail.service';
import { APPLICATION_NOTIFICATION_QUEUE } from '../queues.constants';
import {
  ApplicationStatusEmailPayload,
  NewApplicationEmailPayload,
} from '../services/application-notification-queue.service';

@Processor(APPLICATION_NOTIFICATION_QUEUE)
export class ApplicationNotificationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(ApplicationNotificationQueueProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(
    job: Job<ApplicationStatusEmailPayload | NewApplicationEmailPayload>,
  ): Promise<void> {
    this.logger.log(`Processing job ${job.id} (${job.name})`);

    try {
      switch (job.name) {
        case 'send-status-update-email':
          await this.handleStatusUpdateEmail(job.data as ApplicationStatusEmailPayload);
          break;
        case 'send-new-application-email':
          await this.handleNewApplicationEmail(job.data as NewApplicationEmailPayload);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}: ${error.message}`, error.stack);
      throw error; // Re-throw to trigger retry
    }
  }

  private async handleStatusUpdateEmail(data: ApplicationStatusEmailPayload): Promise<void> {
    await this.mailService.sendApplicationStatusUpdate({
      userName: data.userName,
      userEmail: data.userEmail,
      jobName: data.jobName,
      companyName: data.companyName,
      newStatus: data.newStatus,
      resumeId: data.resumeId,
    });
    this.logger.log(`Status update email sent to ${data.userEmail}`);
  }

  private async handleNewApplicationEmail(data: NewApplicationEmailPayload): Promise<void> {
    // Send a simple notification email to HR about new application
    // Reuses the mailer service directly
    await this.mailService.sendNewJobNotificationToFollower({
      userName: data.hrName,
      userEmail: data.hrEmail,
      jobName: `New application from ${data.candidateName} for ${data.jobName}`,
      companyName: data.companyName,
      jobId: data.resumeId,
    });
    this.logger.log(`New application email sent to HR ${data.hrEmail}`);
  }
}
