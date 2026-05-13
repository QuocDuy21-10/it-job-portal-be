import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { AiUsageLog, AiUsageLogSchema } from './schemas/ai-usage-log.schema';
import { AIModule } from '../ai/ai.module';
import { CvProfilesModule } from '../cv-profiles/cv-profiles.module';
import { JobsModule } from '../jobs/jobs.module';
import { UsersModule } from '../users/users.module';
import { CompaniesModule } from '../companies/companies.module';
import { SkillsModule } from '../skills/skills.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatContextService } from './chat-context.service';
import { ChatPromptBuilder } from './chat-prompt.builder';
import { ChatGuardrailService } from './chat-guardrail.service';
import { AiUsageService } from './ai-usage.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: AiUsageLog.name, schema: AiUsageLogSchema },
    ]),
    AIModule,
    CvProfilesModule,
    JobsModule,
    UsersModule,
    CompaniesModule,
    SkillsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatContextService,
    ChatPromptBuilder,
    ChatGuardrailService,
    AiUsageService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
