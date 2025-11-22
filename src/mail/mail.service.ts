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

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send new job notification to company follower
   */
  async sendNewJobNotificationToFollower(
    data: NewJobNotificationData,
  ): Promise<void> {
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
}
