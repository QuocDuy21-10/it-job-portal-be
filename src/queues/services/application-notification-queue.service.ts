import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { APPLICATION_NOTIFICATION_QUEUE } from '../queues.constants';

export interface ApplicationStatusEmailPayload {
  userName: string;
  userEmail: string;
  jobName: string;
  companyName: string;
  newStatus: string;
  resumeId: string;
}

export interface NewApplicationEmailPayload {
  hrEmail: string;
  hrName: string;
  candidateName: string;
  candidateEmail: string;
  jobName: string;
  companyName: string;
  resumeId: string;
}

@Injectable()
export class ApplicationNotificationQueueService {
  private readonly logger = new Logger(ApplicationNotificationQueueService.name);

  constructor(
    @InjectQueue(APPLICATION_NOTIFICATION_QUEUE)
    private readonly applicationNotificationQueue: Queue,
  ) {}

  /**
   * Queue email notification for application status update (to candidate)
   */
  async addStatusUpdateEmail(payload: ApplicationStatusEmailPayload): Promise<void> {
    try {
      await this.applicationNotificationQueue.add('send-status-update-email', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(
        `Queued status update email for ${payload.userEmail} (status: ${payload.newStatus})`,
      );
    } catch (error) {
      this.logger.error(`Failed to queue status update email: ${error.message}`, error.stack);
    }
  }

  /**
   * Queue email notification for new application (to HR)
   */
  async addNewApplicationEmail(payload: NewApplicationEmailPayload): Promise<void> {
    try {
      await this.applicationNotificationQueue.add('send-new-application-email', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(
        `Queued new application email for HR ${payload.hrEmail} (resume: ${payload.resumeId})`,
      );
    } catch (error) {
      this.logger.error(`Failed to queue new application email: ${error.message}`, error.stack);
    }
  }
}
