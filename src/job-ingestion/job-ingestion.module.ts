import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SkillsModule } from 'src/skills/skills.module';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter';
import { ItviecAdapter } from './adapters/itviec.adapter';
import { LeverAdapter } from './adapters/lever.adapter';
import { TopDevAdapter } from './adapters/topdev.adapter';
import { ExternalJobRepository } from './external-job.repository';
import { JobIngestionService } from './job-ingestion.service';
import { JobLifecycleService } from './job-lifecycle.service';
import { JobSourcesController } from './job-sources.controller';
import { CrawlRun, CrawlRunSchema } from './schemas/crawl-run.schema';
import { ExternalJob, ExternalJobSchema } from './schemas/external-job.schema';
import { JobSource, JobSourceSchema } from './schemas/job-source.schema';
import { SourceSyncCoordinator } from './source-sync-coordinator';

// JobIngestionQueueService comes from the global QueuesModule, same as JobsModule's queue services.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobSource.name, schema: JobSourceSchema },
      { name: ExternalJob.name, schema: ExternalJobSchema },
      { name: CrawlRun.name, schema: CrawlRunSchema },
    ]),
    SkillsModule,
  ],
  controllers: [JobSourcesController],
  providers: [
    JobIngestionService,
    SourceSyncCoordinator,
    JobLifecycleService,
    ExternalJobRepository,
    GreenhouseAdapter,
    LeverAdapter,
    TopDevAdapter,
    ItviecAdapter,
  ],
  exports: [JobIngestionService],
})
export class JobIngestionModule {}
