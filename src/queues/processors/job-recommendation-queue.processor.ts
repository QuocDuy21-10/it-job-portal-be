import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import {
  Subscriber,
  SubscriberDocument,
} from 'src/subscribers/schemas/subscriber.schema';
import {
  Job as JobEntity,
  JobDocument,
} from 'src/jobs/schemas/job.schema';
import { JOB_RECOMMENDATION_QUEUE } from '../queues.constants';
import { JobRecommendationPayload } from '../services/job-recommendation-queue.service';

interface JobRecommendationData {
  name: string;
  company: string;
  salary: string;
  skills: string[];
  location: string;
  jobUrl: string;
}

@Processor(JOB_RECOMMENDATION_QUEUE, {
  concurrency: 5, // Process 5 jobs in parallel
})
export class JobRecommendationQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(JobRecommendationQueueProcessor.name);

  constructor(
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: SoftDeleteModel<SubscriberDocument>,
    @InjectModel(JobEntity.name)
    private readonly jobModel: SoftDeleteModel<JobDocument>,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<JobRecommendationPayload>): Promise<void> {
    const { subscriberId } = job.data;
    this.logger.log(`Processing job recommendation for subscriber ${subscriberId}`);

    try {
      // 1. Fetch subscriber data
      const subscriber = await this.subscriberModel
        .findById(subscriberId)
        .select('email name skills location')
        .lean()
        .exec();

      if (!subscriber) {
        this.logger.warn(`Subscriber ${subscriberId} not found, skipping`);
        return;
      }

      if (!subscriber.email) {
        this.logger.warn(`Subscriber ${subscriberId} has no email, skipping`);
        return;
      }

      // 2. Build matching query
      const now = new Date();
      const matchQuery: any = {
        isActive: true,
        isDeleted: false,
        endDate: { $gte: now }, // Job still valid
        skills: { $in: subscriber.skills || [] }, // Skills intersection
      };

      // Add location matching if subscriber has location preference
      if (subscriber.location && subscriber.location.trim()) {
        // Use regex for flexible location matching
        // e.g., "Hà Nội" matches "Cầu Giấy - Hà Nội"
        matchQuery.location = {
          $regex: this.escapeRegex(subscriber.location),
          $options: 'i', // Case-insensitive
        };
      }

      // 3. Query matching jobs (limit to top 5)
      const matchingJobs = await this.jobModel
        .find(matchQuery)
        .sort({ createdAt: -1 }) // Newest first
        .limit(5)
        .select('name skills location salary company endDate')
        .lean()
        .exec();

      if (!matchingJobs || matchingJobs.length === 0) {
        this.logger.debug(
          `No matching jobs found for subscriber ${subscriberId}`,
        );
        return;
      }

      this.logger.log(
        `Found ${matchingJobs.length} matching jobs for subscriber ${subscriberId}`,
      );

      // 4. Format job data for email template
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000';

      const jobs: JobRecommendationData[] = matchingJobs.map((jobDoc) => ({
        name: jobDoc.name,
        company: jobDoc.company?.name || 'N/A',
        salary: this.formatSalary(jobDoc.salary),
        skills: jobDoc.skills || [],
        location: jobDoc.location || 'N/A',
        jobUrl: `${frontendUrl}/jobs/${jobDoc._id}`,
      }));

      // 5. Send email
      await this.mailerService.sendMail({
        to: subscriber.email,
        from: '"Job Portal Team" <support@example.com>',
        subject: `🎯 ${matchingJobs.length} việc làm phù hợp với bạn!`,
        template: 'job-recommendation', 
        context: {
          receiver: subscriber.name || 'Bạn',
          jobs,
          totalJobs: matchingJobs.length,
          currentYear: new Date().getFullYear(),
        },
      });

      this.logger.log(
        `Successfully sent job recommendations to ${subscriber.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing job recommendation for subscriber ${subscriberId}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw to trigger retry mechanism
    }
  }

  /**
   * Format salary with Vietnamese currency format
   */
  private formatSalary(salary: number): string {
    if (!salary) return 'Thỏa thuận';
    return `${salary.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} đ`;
  }

  /**
   * Escape special regex characters for safe string matching
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
