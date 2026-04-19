import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ACCOUNT_DELETION_QUEUE } from '../queues.constants';

export interface AccountDeletionJobData {
  userId: string;
}

@Injectable()
export class AccountDeletionQueueService {
  private readonly logger = new Logger(AccountDeletionQueueService.name);

  constructor(
    @InjectQueue(ACCOUNT_DELETION_QUEUE)
    private accountDeletionQueue: Queue,
  ) {}

  async addDeletionJob(userId: string, delayMs: number): Promise<void> {
    try {
      const jobId = `delete-account-${userId}`;
      await this.accountDeletionQueue.add('delete-account', { userId } as AccountDeletionJobData, {
        jobId,
        delay: delayMs,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(`Account deletion job enqueued for user ${userId} with delay ${delayMs}ms`);
    } catch (error) {
      this.logger.error(`Failed to enqueue account deletion job for user ${userId}:`, error);
      throw error;
    }
  }

  async cancelDeletionJob(userId: string): Promise<void> {
    try {
      const jobId = `delete-account-${userId}`;
      await this.accountDeletionQueue.remove(jobId);
      this.logger.log(`Account deletion job cancelled for user ${userId}`);
    } catch (error) {
      // Non-fatal — job may have already fired or been removed; log and continue
      this.logger.warn(`Could not cancel deletion job for user ${userId}: ${error.message}`);
    }
  }
}
