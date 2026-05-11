import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/redis/redis.module';
import { GeminiService } from './gemini.service';
import { GeminiQuotaService } from './gemini-quota.service';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [GeminiService, GeminiQuotaService],
  exports: [GeminiService, GeminiQuotaService],
})
export class GeminiModule {}
