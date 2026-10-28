import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExternalJob, ExternalJobSchema } from 'src/job-ingestion/schemas/external-job.schema';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { JobSearchController } from './job-search.controller';
import { JobSearchService } from './job-search.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: ExternalJob.name, schema: ExternalJobSchema },
    ]),
  ],
  controllers: [JobSearchController],
  providers: [JobSearchService],
})
export class JobSearchModule {}
