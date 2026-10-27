import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SkillsModule } from 'src/skills/skills.module';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter';
import { LeverAdapter } from './adapters/lever.adapter';
import { JobIngestionService } from './job-ingestion.service';
import { JobSourcesController } from './job-sources.controller';
import { ExternalJob, ExternalJobSchema } from './schemas/external-job.schema';
import { JobSource, JobSourceSchema } from './schemas/job-source.schema';

// JobIngestionQueueService comes from the global QueuesModule, same as JobsModule's queue services.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobSource.name, schema: JobSourceSchema },
      { name: ExternalJob.name, schema: ExternalJobSchema },
    ]),
    SkillsModule,
  ],
  controllers: [JobSourcesController],
  providers: [JobIngestionService, GreenhouseAdapter, LeverAdapter],
  exports: [JobIngestionService],
})
export class JobIngestionModule {}
