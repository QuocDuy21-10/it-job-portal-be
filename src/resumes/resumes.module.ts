import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './schemas/resume.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { MatchingModule } from 'src/matching/matching.module';
import { CvProfilesModule } from 'src/cv-profiles/cv-profiles.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { ResumeProcessingService } from './resume-processing.service';
import { ResumeRepository } from './repositories/resume.repository';
import { ApplicationNotificationService } from './services/application-notification.service';
import { ApplicationSubmissionService } from './services/application-submission.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MatchingModule,
    CvProfilesModule,
    JobsModule,
    NotificationsModule,
  ],
  controllers: [ResumesController],
  providers: [
    ResumeRepository,
    ResumesService,
    ResumeProcessingService,
    ApplicationNotificationService,
    ApplicationSubmissionService,
  ],
  exports: [
    ResumesService,
    ResumeRepository,
    MongooseModule.forFeature([{ name: Resume.name, schema: ResumeSchema }]),
  ],
})
export class ResumesModule {}
