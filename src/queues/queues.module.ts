import { Module, DynamicModule, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ResumeQueueProcessor } from './processors/resume-queue.processor';
import { ResumeQueueService } from './services/resume-queue.service';
import { CompanyFollowerQueueProcessor } from './processors/company-follower-queue.processor';
import { CompanyFollowerQueueService } from './services/company-follower-queue.service';
import { CvParserModule } from 'src/cv-parser/cv-parser.module';
import { GeminiModule } from 'src/gemini/gemini.module';
import { MatchingModule } from 'src/matching/matching.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { MailModule } from 'src/mail/mail.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from 'src/resumes/schemas/resume.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { RESUME_QUEUE, COMPANY_FOLLOWER_NOTIFICATION_QUEUE } from './queues.constants';

export { RESUME_QUEUE, COMPANY_FOLLOWER_NOTIFICATION_QUEUE };

@Global()
@Module({})
export class QueuesModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: QueuesModule,
      imports: [
        BullModule.registerQueue(
          {
            name: RESUME_QUEUE,
          },
          {
            name: COMPANY_FOLLOWER_NOTIFICATION_QUEUE,
          },
        ),
        MongooseModule.forFeature([
          { name: Resume.name, schema: ResumeSchema },
          { name: User.name, schema: UserSchema },
        ]),
        CvParserModule,
        GeminiModule,
        MatchingModule, 
        JobsModule,
        MailModule,
      ],
      providers: [
        ResumeQueueProcessor, 
        ResumeQueueService,
        CompanyFollowerQueueProcessor,
        CompanyFollowerQueueService,
      ],
      exports: [ResumeQueueService, CompanyFollowerQueueService],
    };
  }

  static forFeature(): DynamicModule {
    return {
      module: QueuesModule,
      imports: [],
      exports: [],
    };
  }
}
