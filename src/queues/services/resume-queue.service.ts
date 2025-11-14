import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RESUME_QUEUE } from '../queues.constants';

export interface ParseResumeJobData {
  resumeId: string;
  filePath: string;
}

export interface AnalyzeResumeJobData {
  resumeId: string;
  jobId: string;
}

@Injectable()
export class ResumeQueueService {
  private readonly logger = new Logger(ResumeQueueService.name);

  constructor(
    @InjectQueue(RESUME_QUEUE)
    private resumeQueue: Queue,
  ) {}

  /**
   * Add CV parsing job to queue
   */
  async addParseResumeJob(data: ParseResumeJobData) {
    try {
      const job = await this.resumeQueue.add('parse-resume', data, {
        priority: 1,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(`Parse resume job added: ${job.id} for resume ${data.resumeId}`);
      return job;
    } catch (error) {
      this.logger.error('Failed to add parse resume job:', error);
      throw error;
    }
  }

  /**
   * Add AI analysis job to queue
   */
  async addAnalyzeResumeJob(data: AnalyzeResumeJobData) {
    try {
      const job = await this.resumeQueue.add('analyze-resume', data, {
        priority: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      this.logger.log(`Analyze resume job added: ${job.id} for resume ${data.resumeId}`);
      return job;
    } catch (error) {
      this.logger.error('Failed to add analyze resume job:', error);
      throw error;
    }
  }

  /**
   * Get queue stats
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.resumeQueue.getWaitingCount(),
      this.resumeQueue.getActiveCount(),
      this.resumeQueue.getCompletedCount(),
      this.resumeQueue.getFailedCount(),
      this.resumeQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string) {
    return this.resumeQueue.getJob(jobId);
  }

  /**
   * Remove job by ID
   */
  async removeJob(jobId: string) {
    const job = await this.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Job ${jobId} removed`);
    }
  }

  /**
   * Clean old jobs
   */
  async cleanOldJobs(grace: number = 86400000) {
    // grace = 24 hours in milliseconds
    await this.resumeQueue.clean(grace, 1000, 'completed');
    await this.resumeQueue.clean(grace * 7, 1000, 'failed'); // Keep failed jobs for 7 days
    this.logger.log('Old jobs cleaned');
  }
}
