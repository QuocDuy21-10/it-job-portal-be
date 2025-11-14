import { Module } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { ResumesController } from './resumes.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './schemas/resume.schema';
import { ResumeProcessingService } from './resume-processing.service';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeProcessingService],
  exports: [
    ResumesService,
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
    ]),
  ],
})
export class ResumesModule {}
