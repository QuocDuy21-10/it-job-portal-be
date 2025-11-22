import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { MailService } from 'src/mail/mail.service';
import { COMPANY_FOLLOWER_NOTIFICATION_QUEUE } from '../queues.constants';
import { NewJobNotificationPayload } from '../services/company-follower-queue.service';

@Processor(COMPANY_FOLLOWER_NOTIFICATION_QUEUE)
export class CompanyFollowerQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(CompanyFollowerQueueProcessor.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: SoftDeleteModel<UserDocument>,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<NewJobNotificationPayload>): Promise<void> {
    this.logger.log(`Processing job ${job.id} with data:`, job.data);

    try {
      const { jobId, companyId, jobName, companyName } = job.data;

      // Find all users following this company
      const followers = await this.userModel
        .find({
          companyFollowed: companyId,
          isDeleted: false,
          isActive: true, // Only send to active users
        })
        .select('email name')
        .exec();

      if (!followers || followers.length === 0) {
        this.logger.log(`No followers found for company ${companyId}`);
        return;
      }

      this.logger.log(
        `Found ${followers.length} followers for company ${companyId}`,
      );

      // Send email to each follower
      // For production: consider batch sending or using a dedicated email service
      const emailPromises = followers.map((follower) =>
        this.mailService
          .sendNewJobNotificationToFollower({
            userName: follower.name,
            userEmail: follower.email,
            jobName,
            companyName,
            jobId,
          })
          .catch((error) => {
            this.logger.error(
              `Failed to send email to ${follower.email}: ${error.message}`,
            );
            // Don't throw - continue sending to other users
          }),
      );

      // Wait for all emails to be sent
      await Promise.allSettled(emailPromises);

      this.logger.log(
        `Successfully processed new job notification for job ${jobId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry
    }
  }
}
