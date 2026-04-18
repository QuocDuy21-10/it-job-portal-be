import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export interface NewJobNotificationData {
  userName: string;
  userEmail: string;
  jobName: string;
  companyName: string;
  jobId: string;
}

export interface ApplicationStatusUpdateData {
  userName: string;
  userEmail: string;
  jobName: string;
  companyName: string;
  newStatus: string;
  resumeId: string;
}

export interface JobExpiredNotificationData {
  hrEmail: string;
  jobName: string;
  companyName: string;
  jobId: string;
}

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send new job notification to company follower
   */
  async sendNewJobNotificationToFollower(data: NewJobNotificationData): Promise<void> {
    const { userName, userEmail, jobName, companyName, jobId } = data;

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const jobDetailUrl = `${frontendUrl}/jobs/${jobId}`;

    await this.mailerService.sendMail({
      to: userEmail,
      subject: `New Job Opening at ${companyName}! 🎉`,
      template: 'new-job-notification',
      context: {
        userName,
        jobName,
        companyName,
        jobDetailUrl,
        currentYear: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send application status update email to candidate
   */
  async sendApplicationStatusUpdate(data: ApplicationStatusUpdateData): Promise<void> {
    const { userName, userEmail, jobName, companyName, newStatus, resumeId } = data;

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const applicationUrl = `${frontendUrl}/my-applications/${resumeId}`;

    const statusMessages: Record<string, string> = {
      REVIEWING:
        'Your application is currently being reviewed by the hiring team. Please be patient.',
      INTERVIEWING:
        'Congratulations! You have been shortlisted for an interview. The company will reach out to you with further details soon.',
      APPROVED:
        'Congratulations! Your application has been accepted. The company will contact you with the next steps.',
      REJECTED:
        "We regret to inform you that your application was not selected for this position. Don't give up — keep exploring other opportunities!",
    };

    await this.mailerService.sendMail({
      to: userEmail,
      subject: `Application Update: ${jobName} at ${companyName}`,
      template: 'application-status-update',
      context: {
        userName,
        jobName,
        companyName,
        newStatus,
        statusMessage: statusMessages[newStatus] || '',
        applicationUrl,
        currentYear: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send job expiration notification to HR who created the job
   */
  async sendJobExpiredNotification(data: JobExpiredNotificationData): Promise<void> {
    const { hrEmail, jobName, companyName, jobId } = data;

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const jobManageUrl = `${frontendUrl}/hr/jobs/${jobId}`;

    await this.mailerService.sendMail({
      to: hrEmail,
      subject: `Job Posting Expired: ${jobName}`,
      template: 'job-expired-notification',
      context: {
        jobName,
        companyName,
        jobManageUrl,
        currentYear: new Date().getFullYear(),
      },
    });
  }
}
