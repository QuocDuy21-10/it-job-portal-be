import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiModule } from 'src/gemini/gemini.module';
import { GroqModule } from 'src/groq/groq.module';
import { AIService } from './ai.service';

@Module({
  imports: [ConfigModule, GeminiModule, GroqModule],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
