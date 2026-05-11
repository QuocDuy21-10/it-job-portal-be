import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RESUME_QUEUE } from '../queues.constants';

const DEFAULT_GEMINI_QUOTA_RETRY_JITTER_MS = 1000;

export interface ParseResumeJobData {
  resumeId: string;
  filePath: string;
  jobId: string; // <-- THÊM DÒNG NÀY
}

export interface AnalyzeResumeJobData {
  resumeId: string;
  jobId: string;
}

@Injectable()
export class ResumeQueueService {
  private readonly logger = new Logger(ResumeQueueService.name);
  private readonly quotaRetryJitterMs: number;

  constructor(
    @InjectQueue(RESUME_QUEUE)
    private resumeQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.quotaRetryJitterMs = this.readNonNegativeIntConfig(
      'GEMINI_QUOTA_RETRY_JITTER_MS',
      DEFAULT_GEMINI_QUOTA_RETRY_JITTER_MS,
    );
  }

  /**
   * Add CV parsing job to queue
   */
  async addParseResumeJob(data: ParseResumeJobData) {
    try {
      const job = await this.resumeQueue.add(
        'parse-resume',
        data,
        this.buildParseResumeJobOptions(),
      );

      this.logger.log(`Parse resume job added: ${job.id} for resume ${data.resumeId}`);
      return job;
    } catch (error) {
      this.logger.error('Failed to add parse resume job:', error);
      throw error;
    }
  }

  async scheduleParseResumeRetry(data: ParseResumeJobData, baseDelayMs: number) {
    const delayMs = this.applyRetryJitter(baseDelayMs);

    try {
      const job = await this.resumeQueue.add(
        'parse-resume',
        data,
        this.buildParseResumeJobOptions(delayMs),
      );

      this.logger.warn(
        `Parse resume job rescheduled: ${job.id} for resume ${data.resumeId} in ${delayMs}ms`,
      );

      return {
        job,
        delayMs,
      };
    } catch (error) {
      this.logger.error('Failed to reschedule parse resume job:', error);
      throw error;
    }
  }

  /**
   * Add AI analysis job to queue
   */
  async addAnalyzeResumeJob(data: AnalyzeResumeJobData) {
    try {
      const job = await this.resumeQueue.add(
        'analyze-resume',
        data,
        this.buildAnalyzeResumeJobOptions(),
      );

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

  private buildParseResumeJobOptions(delay?: number) {
    return {
      priority: 1,
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
      ...(delay !== undefined ? { delay } : {}),
    };
  }

  private buildAnalyzeResumeJobOptions() {
    return {
      priority: 2,
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
    };
  }

  private applyRetryJitter(baseDelayMs: number): number {
    return Math.max(1000, baseDelayMs) + Math.floor(Math.random() * this.quotaRetryJitterMs);
  }

  private readNonNegativeIntConfig(key: string, defaultValue: number): number {
    const value = this.configService.get<string>(key);
    if (value === undefined || value === null || value.trim() === '') {
      return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }

    return parsed;
  }
}
