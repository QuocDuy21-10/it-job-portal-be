import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { CronLockService } from 'src/redis/cron-lock.service';
import { JobIngestionQueueService } from 'src/queues/services/job-ingestion-queue.service';
import { CrawlFailureRepository } from './crawl-failure.repository';
import { CreateJobSourceDto } from './dto/create-job-source.dto';
import { ListCrawlRunsQueryDto } from './dto/list-crawl-runs-query.dto';
import { UpdateJobSourceDto } from './dto/update-job-source.dto';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { ExternalJobRepository } from './external-job.repository';
import {
  CRAWL_RUNS_DEFAULT_LIMIT,
  CRAWL_RUNS_MAX_LIMIT,
  DEFAULT_DISPLAY_POLICY,
} from './job-ingestion.constants';
import { CrawlRun, CrawlRunDocument } from './schemas/crawl-run.schema';
import { JobSource, JobSourceDocument } from './schemas/job-source.schema';
import { SourceSyncCoordinator } from './source-sync-coordinator';

const SOURCE_SYNC_CRON = 'sync-external-job-sources';

@Injectable()
export class JobIngestionService {
  constructor(
    @InjectModel(JobSource.name)
    private readonly jobSourceModel: Model<JobSourceDocument>,
    @InjectModel(CrawlRun.name)
    private readonly crawlRunModel: Model<CrawlRunDocument>,
    private readonly externalJobRepository: ExternalJobRepository,
    private readonly crawlFailures: CrawlFailureRepository,
    private readonly jobIngestionQueueService: JobIngestionQueueService,
    private readonly sourceSyncCoordinator: SourceSyncCoordinator,
    private readonly cronLockService: CronLockService,
  ) {}

  @Cron('0 */6 * * *', {
    name: SOURCE_SYNC_CRON,
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async runSourceSyncCron(): Promise<void> {
    await this.cronLockService.runExclusive(SOURCE_SYNC_CRON, () => this.enqueueEnabledSources());
  }

  async enqueueEnabledSources(): Promise<void> {
    const sources = await this.jobSourceModel.find({ enabled: true }).select('key').lean();
    await Promise.all(sources.map(source => this.jobIngestionQueueService.enqueueSync(source.key)));
  }

  async findAllSources() {
    const [sources, jobs, failures] = await Promise.all([
      this.jobSourceModel.find().select('-rejections').sort({ key: 1 }).lean<JobSource[]>(),
      this.externalJobRepository.countByState(),
      this.crawlFailures.countByGroup(),
    ]);

    return sources.map(source => ({
      ...source,
      counts: {
        ...(jobs.get(source.key) ?? { total: 0, active: 0, stale: 0, closed: 0, removed: 0 }),
        ...(failures.get(source.key) ?? { errors: 0, filtered: 0 }),
      },
    }));
  }

  async createSource({
    provider,
    boardToken,
    companyName,
    displayPolicy = DEFAULT_DISPLAY_POLICY,
  }: CreateJobSourceDto): Promise<JobSource> {
    const key = `${provider.toLowerCase()}-${boardToken}`;
    // A duplicate key is answered with 409 by the exception filter.
    const source = await this.jobSourceModel.create({
      key,
      provider,
      boardToken,
      companyName,
      displayPolicy,
      enabled: true,
    });
    await this.jobIngestionQueueService.enqueueSync(key);
    return source.toObject();
  }

  /** Disabled first, so no new sync can start; safe to repeat after a crash midway. */
  async deleteSource(key: string): Promise<{ key: string; closed: number }> {
    const source = await this.jobSourceModel.findOne({ key }).select('enabled').lean<JobSource>();

    if (!source) {
      throw new NotFoundException(`Không tìm thấy nguồn tin tuyển dụng '${key}'`);
    }

    if (source.enabled) {
      throw new ConflictException('Hãy tắt nguồn trước khi xoá');
    }

    if (!(await this.jobIngestionQueueService.cancelSync(key))) {
      throw new ConflictException('Nguồn đang đồng bộ, hãy thử lại sau');
    }

    const closed = await this.externalJobRepository.closeSource(key, new Date());
    await this.crawlFailures.deleteBySource(key);
    const { deletedCount } = await this.jobSourceModel.deleteOne({ key, enabled: false });

    if (deletedCount === 0) {
      throw new ConflictException('Nguồn vừa được bật lại, chưa xoá');
    }

    return { key, closed };
  }

  async requestSync(key: string): Promise<{ key: string; queued: true }> {
    const exists = await this.jobSourceModel.exists({ key });

    if (!exists) {
      throw new NotFoundException(`Không tìm thấy nguồn tin tuyển dụng '${key}'`);
    }

    await this.jobIngestionQueueService.enqueueSync(key);
    return { key, queued: true };
  }

  syncSource(sourceKey: string): Promise<void> {
    return this.sourceSyncCoordinator.run(sourceKey);
  }

  async updateSource(key: string, dto: UpdateJobSourceDto): Promise<JobSource> {
    const previous = await this.jobSourceModel
      .findOneAndUpdate({ key }, { $set: dto }, { new: false, projection: { rejections: 0 } })
      .lean<JobSource>();

    if (!previous) {
      throw new NotFoundException(`Không tìm thấy nguồn tin tuyển dụng '${key}'`);
    }

    const { displayPolicy } = dto;

    if (displayPolicy && displayPolicy !== previous.displayPolicy) {
      if (displayPolicy === EJobSourceDisplayPolicy.LINK_ONLY) {
        await this.externalJobRepository.clearDescriptions(key);
      } else if (displayPolicy === EJobSourceDisplayPolicy.FULL) {
        await this.externalJobRepository.resetFetchedAt(key);
      }
    }

    return { ...previous, ...dto };
  }

  async findRuns(key: string, query: ListCrawlRunsQueryDto): Promise<CrawlRun[]> {
    const exists = await this.jobSourceModel.exists({ key });

    if (!exists) {
      throw new NotFoundException(`Không tìm thấy nguồn tin tuyển dụng '${key}'`);
    }

    // ValidationPipe does not transform, so limit may still be a string here.
    const limit = Math.min(Number(query.limit) || CRAWL_RUNS_DEFAULT_LIMIT, CRAWL_RUNS_MAX_LIMIT);

    return this.crawlRunModel
      .find({ sourceKey: key })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean<CrawlRun[]>();
  }
}
