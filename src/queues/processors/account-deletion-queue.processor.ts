import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User as UserModel, UserDocument } from 'src/users/schemas/user.schema';
import { Resume, ResumeDocument } from 'src/resumes/schemas/resume.schema';
import { CvProfile, CvProfileDocument } from 'src/cv-profiles/schemas/cv-profile.schema';
import { Conversation, ConversationDocument } from 'src/chat/schemas/conversation.schema';
import { Subscriber, SubscriberDocument } from 'src/subscribers/schemas/subscriber.schema';
import { Session } from 'src/sessions/schemas/session.schema';
import { SessionDocument } from 'src/sessions/schemas/session.schema';
import { MailService } from 'src/mail/mail.service';
import { ACCOUNT_DELETION_QUEUE } from '../queues.constants';
import { AccountDeletionJobData } from '../services/account-deletion-queue.service';

@Processor(ACCOUNT_DELETION_QUEUE)
export class AccountDeletionQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountDeletionQueueProcessor.name);

  constructor(
    @InjectModel(UserModel.name) private readonly userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Resume.name) private readonly resumeModel: SoftDeleteModel<ResumeDocument>,
    @InjectModel(CvProfile.name) private readonly cvProfileModel: Model<CvProfileDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: SoftDeleteModel<SubscriberDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly mailService: MailService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super();
  }

  async process(job: Job<AccountDeletionJobData>): Promise<void> {
    this.logger.log(`Processing account deletion job ${job.id} for user ${job.data.userId}`);

    try {
      switch (job.name) {
        case 'delete-account':
          await this.handleDeleteAccount(job.data);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing account deletion job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async handleDeleteAccount(data: AccountDeletionJobData): Promise<void> {
    const { userId } = data;

    // Load the user fresh — confirm deletion is still scheduled (race-condition guard)
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      this.logger.warn(`User ${userId} not found; skipping deletion.`);
      return;
    }
    if (!user.scheduledDeletionAt) {
      this.logger.warn(
        `User ${userId} has no scheduledDeletionAt; deletion was likely cancelled. Skipping.`,
      );
      return;
    }

    const originalEmail = user.email;
    const originalName = user.name;
    const anonymisedEmail = `deleted_${userId}@deleted.invalid`;

    this.logger.log(`Starting cascade deletion for user ${userId} (${originalEmail})`);

    // Step 1: Revoke all sessions immediately
    await this.sessionModel.deleteMany({ userId });

    // Step 1b: Clean up magic-link cancel token from Redis
    const cancelToken = await this.cacheManager.get<string>(`cancel_deletion_user:${userId}`);
    if (cancelToken) {
      await this.cacheManager.del(`cancel_deletion:${cancelToken}`);
    }
    await this.cacheManager.del(`cancel_deletion_user:${userId}`);

    // Step 2: Anonymise resumes — preserve the document for HR audit trail
    await this.resumeModel.updateMany({ userId }, { $set: { email: anonymisedEmail } });

    // Step 3: GDPR hard-delete CV profile
    await this.cvProfileModel.deleteOne({ userId });

    // Step 4: GDPR hard-delete AI conversations
    await this.conversationModel.deleteMany({ userId });

    // Step 5: Soft-delete job subscriptions (consistent with project convention)
    await this.subscriberModel.softDelete({ email: originalEmail });

    // Step 6: Anonymise and deactivate the user record
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          name: 'Deleted User',
          email: anonymisedEmail,
          isActive: false,
        },
        $unset: {
          password: 1,
          googleId: 1,
          avatar: 1,
          company: 1,
          scheduledDeletionAt: 1,
          savedJobs: 1,
          companyFollowed: 1,
          lockReason: 1,
          lockedBy: 1,
          lockedAt: 1,
          codeExpired: 1,
          verificationExpires: 1,
        },
      },
    );

    // Step 7: Soft-delete the user record (maintains isDeleted/deletedAt audit trail)
    await this.userModel.softDelete({ _id: userId });

    // Step 8: Send final confirmation email to the original address
    try {
      await this.mailService.sendAccountDeleted({
        userName: originalName,
        userEmail: originalEmail,
      });
    } catch (mailError) {
      // Non-fatal: deletion succeeded; email failure should not trigger a retry
      this.logger.error(
        `Failed to send account deletion confirmation to ${originalEmail}: ${mailError.message}`,
      );
    }

    this.logger.log(`Account deletion completed for user ${userId} (was: ${originalEmail})`);
  }
}
