import { Controller, Get, Logger } from '@nestjs/common';
import { MailService } from './mail.service';
import { Public, ResponseMessage } from 'src/decorator/customize';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import {
  Subscriber,
  SubscriberDocument,
} from 'src/subscribers/schemas/subscriber.schema';
import { JobRecommendationQueueService } from 'src/queues/services/job-recommendation-queue.service';

@ApiTags('Mail')
@Controller('mail')
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(
    private readonly mailService: MailService,
    private readonly jobRecommendationQueueService: JobRecommendationQueueService,
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: SoftDeleteModel<SubscriberDocument>,
  ) {}

  @Get('send-job-recommendations')
  @Public()
  @ApiOperation({
    summary: 'Trigger job recommendations manually',
    description:
      'Manually trigger job recommendation emails for all subscribers. Use for testing.',
  })
  @ResponseMessage('Job recommendation task queued successfully')
  async triggerJobRecommendations() {
    await this.queueJobRecommendations();
    const metrics =
      await this.jobRecommendationQueueService.getQueueMetrics();
    return {
      message: 'Job recommendation tasks queued successfully',
      metrics,
    };
  }

  @Cron('0 9 * * 1', {
    name: 'weekly-job-recommendations',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  @ApiOperation({
    summary: 'Cron job - Send weekly job recommendations',
    description:
      'Runs every Monday at 9:00 AM (Vietnam timezone). Queues job recommendation tasks for all active subscribers.',
  })
  async handleWeeklyJobRecommendations() {
    this.logger.log('Starting weekly job recommendation cron job');
    await this.queueJobRecommendations();
    this.logger.log('Weekly job recommendation cron job completed');
  }

  /**
   * Core logic: Query subscribers and queue recommendation tasks
   * Uses cursor for memory efficiency with large datasets
   */
  private async queueJobRecommendations(): Promise<void> {
    try {
      const BATCH_SIZE = 100;
      const subscriberIds: string[] = [];

      // Use cursor to stream subscriber IDs for memory efficiency
      const cursor = this.subscriberModel
        .find({
          isDeleted: false,
          email: { $exists: true, $ne: null },
        })
        .select('_id')
        .lean()
        .cursor();

      // Stream and collect IDs
      for await (const subscriber of cursor) {
        subscriberIds.push(subscriber._id.toString());

        // Queue in batches to avoid memory pressure
        if (subscriberIds.length >= BATCH_SIZE) {
          await this.jobRecommendationQueueService.addSubscribersToQueueBatch(
            subscriberIds,
            BATCH_SIZE,
          );
          subscriberIds.length = 0; // Clear array
        }
      }

      // Queue remaining subscribers
      if (subscriberIds.length > 0) {
        await this.jobRecommendationQueueService.addSubscribersToQueueBatch(
          subscriberIds,
          BATCH_SIZE,
        );
      }

      this.logger.log('All subscribers queued for job recommendations');
    } catch (error) {
      this.logger.error(
        `Failed to queue job recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
