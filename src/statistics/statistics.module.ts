import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { Resume, ResumeSchema } from 'src/resumes/schemas/resume.schema';
import { Company, CompanySchema } from 'src/companies/schemas/company.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { StatisticsCacheService } from './statistics-cache.service';
import { ExternalJob, ExternalJobSchema } from 'src/job-ingestion/schemas/external-job.schema';
import { JobSource, JobSourceSchema } from 'src/job-ingestion/schemas/job-source.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Job.name,
        schema: JobSchema,
      },
      {
        name: Resume.name,
        schema: ResumeSchema,
      },
      {
        name: Company.name,
        schema: CompanySchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: ExternalJob.name,
        schema: ExternalJobSchema,
      },
      {
        name: JobSource.name,
        schema: JobSourceSchema,
      },
    ]),
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService, StatisticsCacheService],
  exports: [StatisticsService, StatisticsCacheService],
})
export class StatisticsModule {}
