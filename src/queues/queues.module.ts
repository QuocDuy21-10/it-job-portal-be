import { Module, DynamicModule, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ResumeQueueProcessor } from './processors/resume-queue.processor';
import { ResumeQueueService } from './services/resume-queue.service';
import { CvParserModule } from 'src/cv-parser/cv-parser.module';
import { GeminiModule } from 'src/gemini/gemini.module';
import { MatchingModule } from 'src/matching/matching.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from 'src/resumes/schemas/resume.schema';
import { RESUME_QUEUE } from './queues.constants';

export { RESUME_QUEUE };

@Global()
@Module({})
export class QueuesModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: QueuesModule,
      imports: [
        BullModule.registerQueue({
          name: RESUME_QUEUE,
        }),
        MongooseModule.forFeature([
          { name: Resume.name, schema: ResumeSchema },
        ]),
        CvParserModule,
        GeminiModule,
        MatchingModule, 
        JobsModule,
      ],
      providers: [ResumeQueueProcessor, ResumeQueueService],
      exports: [ResumeQueueService],
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
