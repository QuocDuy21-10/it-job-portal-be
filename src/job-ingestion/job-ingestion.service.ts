import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { JobIngestionQueueService } from 'src/queues/services/job-ingestion-queue.service';
import { JobSource, JobSourceDocument } from './schemas/job-source.schema';
import { SourceSyncCoordinator } from './source-sync-coordinator';

@Injectable()
export class JobIngestionService {
  constructor(
    @InjectModel(JobSource.name)
    private readonly jobSourceModel: Model<JobSourceDocument>,
    private readonly jobIngestionQueueService: JobIngestionQueueService,
    private readonly sourceSyncCoordinator: SourceSyncCoordinator,
  ) {}

  @Cron('0 */6 * * *', {
    name: 'sync-external-job-sources',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async enqueueEnabledSources(): Promise<void> {
    const sources = await this.jobSourceModel.find({ enabled: true }).select('key').lean();
    await Promise.all(sources.map(source => this.jobIngestionQueueService.enqueueSync(source.key)));
  }

  async findAllSources(): Promise<JobSource[]> {
    return this.jobSourceModel.find().select('-rejections').sort({ key: 1 }).lean<JobSource[]>();
  }

  async requestSync(key: string): Promise<{ key: string; queued: true }> {
    const exists = await this.jobSourceModel.exists({ key });

    if (!exists) {
      throw new NotFoundException(`Job source '${key}' not found`);
    }

    await this.jobIngestionQueueService.enqueueSync(key);
    return { key, queued: true };
  }

  syncSource(sourceKey: string): Promise<void> {
    return this.sourceSyncCoordinator.run(sourceKey);
  }
}
