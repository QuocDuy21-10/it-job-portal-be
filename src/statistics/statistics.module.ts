import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { Resume, ResumeSchema } from 'src/resumes/schemas/resume.schema';
import { Company, CompanySchema } from 'src/companies/schemas/company.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { StatisticsCacheService } from './statistics-cache.service';

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
    ]),
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService, StatisticsCacheService],
  exports: [StatisticsService, StatisticsCacheService],
})
export class StatisticsModule {}
