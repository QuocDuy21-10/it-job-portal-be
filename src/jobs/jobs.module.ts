import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Job, JobSchema } from './schemas/job.schema';
import { QueuesModule } from 'src/queues/queues.module';
import { Company, CompanySchema } from 'src/companies/schemas/company.schema';
import { JobRepository } from './repositories/job.repository';
import { SkillsModule } from 'src/skills/skills.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name, schema: JobSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
    QueuesModule.forFeature(),
    SkillsModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobRepository],
  exports: [JobsService],
})
export class JobsModule {}
