import { Module } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { ResumesController } from './resumes.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './schemas/resume.schema';
import { ResumeProcessingService } from './resume-processing.service';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from 'src/files/multer.config';
import { MatchingModule } from 'src/matching/matching.module';
import { CvProfilesModule } from 'src/cv-profiles/cv-profiles.module';
import { JobsModule } from 'src/jobs/jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      { name: Job.name, schema: JobSchema },
    ]),
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
    MatchingModule, // For hybrid matching service
    CvProfilesModule, // For accessing user's structured CV
    JobsModule, // For job validation
  ],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeProcessingService, MulterConfigService],
  exports: [
    ResumesService,
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
    ]),
  ],
})
export class ResumesModule {}
