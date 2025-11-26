import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOB_RECOMMENDATION_QUEUE } from '../queues.constants';

export interface JobRecommendationPayload {
  subscriberId: string;
}

@Injectable()
export class JobRecommendationQueueService {
  private readonly logger = new Logger(JobRecommendationQueueService.name);

  constructor(
    @InjectQueue(JOB_RECOMMENDATION_QUEUE)
    private readonly jobRecommendationQueue: Queue<JobRecommendationPayload>,
  ) {}

  /**
   * Add a single subscriber to the job recommendation queue
   */
  async addSubscriberToQueue(subscriberId: string): Promise<void> {
    try {
      await this.jobRecommendationQueue.add(
        'send-job-recommendations',
        { subscriberId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 10s, 20s
          },
          removeOnComplete: {
            age: 86400, // Keep completed jobs for 24 hours
            count: 1000,
          },
          removeOnFail: {
            age: 604800, // Keep failed jobs for 7 days
          },
        },
      );
      this.logger.debug(`Added subscriber ${subscriberId} to queue`);
    } catch (error) {
      this.logger.error(
        `Failed to add subscriber ${subscriberId} to queue: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Batch add multiple subscribers to the queue
   * @param subscriberIds Array of subscriber IDs
   * @param batchSize Number of jobs to add in parallel (default: 100)
   */
  async addSubscribersToQueueBatch(
    subscriberIds: string[],
    batchSize: number = 100,
  ): Promise<void> {
    this.logger.log(
      `Adding ${subscriberIds.length} subscribers to queue in batches of ${batchSize}`,
    );

    const jobs = subscriberIds.map((subscriberId) => ({
      name: 'send-job-recommendations',
      data: { subscriberId },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential' as const,
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400,
          count: 1000,
        },
        removeOnFail: {
          age: 604800,
        },
      },
    }));

    // Process in batches to avoid memory issues
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      try {
        await this.jobRecommendationQueue.addBulk(batch);
        this.logger.debug(
          `Added batch ${i / batchSize + 1}/${Math.ceil(jobs.length / batchSize)}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to add batch ${i / batchSize + 1}: ${error.message}`,
        );
        // Continue with next batch instead of failing completely
      }
    }

    this.logger.log(
      `Successfully queued ${subscriberIds.length} job recommendation tasks`,
    );
  }

  /**
   * Get queue metrics for monitoring
   */
  async getQueueMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.jobRecommendationQueue.getWaitingCount(),
      this.jobRecommendationQueue.getActiveCount(),
      this.jobRecommendationQueue.getCompletedCount(),
      this.jobRecommendationQueue.getFailedCount(),
      this.jobRecommendationQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }
}
