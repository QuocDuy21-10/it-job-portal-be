import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import Redis from 'ioredis';
import { ListCacheService } from './list-cache.service';
import { CronLockService } from './cron-lock.service';
import { REDIS_CLIENT } from './redis.constants';

export { REDIS_CLIENT } from './redis.constants';

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
    // cache-manager v7 only takes Keyv stores: the old `store: redisStore` option was ignored, which left an
    // unbounded in-memory Map that lost every entry (account-deletion cancel tokens included) on restart.
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        stores: [
          createKeyv({
            socket: {
              host: configService.get('REDIS_HOST', 'localhost'),
              port: Number(configService.get('REDIS_PORT', 6379)),
            },
            password: configService.get('REDIS_PASSWORD') || undefined,
            database: Number(configService.get('REDIS_CACHE_DB', 1)),
          }),
        ],
        ttl: Number(configService.get('REDIS_TTL', 3600000)), // milliseconds, 1 hour default
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD') || undefined,
          db: configService.get<number>('REDIS_CACHE_DB', 1),
        }),
    },
    ListCacheService,
    CronLockService,
  ],
  exports: [BullModule, CacheModule, REDIS_CLIENT, ListCacheService, CronLockService],
})
export class RedisModule {}
