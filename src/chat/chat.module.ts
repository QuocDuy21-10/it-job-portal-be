import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { GeminiModule } from '../gemini/gemini.module';
import { CvProfilesModule } from '../cv-profiles/cv-profiles.module';
import { JobsModule } from '../jobs/jobs.module';
import { UsersModule } from '../users/users.module';
import { CompaniesModule } from '../companies/companies.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatContextService } from './chat-context.service';
import { ChatPromptBuilder } from './chat-prompt.builder';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Conversation.name, schema: ConversationSchema }]),
    GeminiModule,
    CvProfilesModule,
    JobsModule,
    UsersModule,
    CompaniesModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatContextService, ChatPromptBuilder],
  exports: [ChatService],
})
export class ChatModule {}
