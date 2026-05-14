import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { AiUsageLog, AiUsageLogSchema } from './schemas/ai-usage-log.schema';
import { ChatToolAction, ChatToolActionSchema } from './schemas/chat-tool-action.schema';
import { AIModule } from '../ai/ai.module';
import { CvProfilesModule } from '../cv-profiles/cv-profiles.module';
import { JobsModule } from '../jobs/jobs.module';
import { UsersModule } from '../users/users.module';
import { CompaniesModule } from '../companies/companies.module';
import { SkillsModule } from '../skills/skills.module';
import { MatchingModule } from '../matching/matching.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatContextService } from './chat-context.service';
import { ChatContextProviderRegistry } from './chat-context-provider.registry';
import { ChatPromptBuilder } from './chat-prompt.builder';
import { ChatGuardrailService } from './chat-guardrail.service';
import { ChatIntentService } from './chat-intent.service';
import { AiUsageService } from './ai-usage.service';
import { ChatCacheService } from './chat-cache.service';
import { ChatQuotaService } from './chat-quota.service';
import { ChatToolActionService } from './chat-tool-action.service';
import { CompanyContextProvider } from './context-providers/company-context.provider';
import { CvReviewContextProvider } from './context-providers/cv-review-context.provider';
import { FaqContextProvider } from './context-providers/faq-context.provider';
import { JobMatchingContextProvider } from './context-providers/job-matching-context.provider';
import { JobSearchContextProvider } from './context-providers/job-search-context.provider';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: AiUsageLog.name, schema: AiUsageLogSchema },
      { name: ChatToolAction.name, schema: ChatToolActionSchema },
    ]),
    AIModule,
    CvProfilesModule,
    JobsModule,
    UsersModule,
    CompaniesModule,
    SkillsModule,
    MatchingModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatContextService,
    ChatContextProviderRegistry,
    ChatPromptBuilder,
    ChatGuardrailService,
    ChatIntentService,
    AiUsageService,
    ChatCacheService,
    ChatQuotaService,
    ChatToolActionService,
    JobSearchContextProvider,
    CompanyContextProvider,
    CvReviewContextProvider,
    JobMatchingContextProvider,
    FaqContextProvider,
  ],
  exports: [ChatService],
})
export class ChatModule {}
