import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import type { RedisClientOptions } from 'redis';

@Global()
@Module({
  imports: [
    // BullMQ Queue Configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_QUEUE_DB', 0),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            count: 100,
            age: 3600, // 1 hour
          },
          removeOnFail: {
            count: 500,
            age: 86400, // 24 hours
          },
        },
      }),
      inject: [ConfigService],
    }),

    // Cache Configuration
    CacheModule.registerAsync<RedisClientOptions>({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore as any,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
        password: configService.get('REDIS_PASSWORD'),
        db: configService.get('REDIS_CACHE_DB', 1),
        ttl: configService.get('REDIS_TTL', 3600), // 1 hour default
        max: 100, // maximum number of items in cache
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  exports: [BullModule, CacheModule],
})
export class RedisModule {}
