import { Module } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { ResumesController } from './resumes.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './schemas/resume.schema';
import { ResumeProcessingService } from './resume-processing.service';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from 'src/files/multer.config';
import { MatchingModule } from 'src/matching/matching.module';
import { CvProfilesModule } from 'src/cv-profiles/cv-profiles.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      { name: Job.name, schema: JobSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
    MatchingModule,
    CvProfilesModule,
    JobsModule,
    NotificationsModule,
  ],
  controllers: [ResumesController],
  providers: [ResumesService, ResumeProcessingService, MulterConfigService],
  exports: [
    ResumesService,
    MongooseModule.forFeature([{ name: Resume.name, schema: ResumeSchema }]),
  ],
})
export class ResumesModule {}
