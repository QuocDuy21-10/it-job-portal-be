import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { CHAT_IDEMPOTENCY_KEY_PREFIX, CHAT_IDEMPOTENCY_TTL_MS } from './constants/chat.constant';

@Injectable()
export class ChatIdempotencyService {
  private readonly logger = new Logger(ChatIdempotencyService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  /** Returns the key this request now owns, or undefined when there is nothing to release later. */
  async acquire(userId: string, clientMessageId?: string): Promise<string | undefined> {
    if (!clientMessageId) {
      return undefined;
    }

    const key = `${CHAT_IDEMPOTENCY_KEY_PREFIX}${userId}:${clientMessageId}`;
    let claimed: string | null;

    try {
      claimed = await this.redisClient.set(key, '1', 'PX', CHAT_IDEMPOTENCY_TTL_MS, 'NX');
    } catch (error) {
      // Chat availability matters more than dedupe.
      this.logger.warn(
        `Skipped idempotency check: ${error instanceof Error ? error.message : error}`,
      );
      return undefined;
    }

    if (claimed === null) {
      throw new ConflictException('Duplicate message');
    }

    return key;
  }

  async release(key?: string): Promise<void> {
    if (!key) {
      return;
    }

    try {
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.warn(
        `Failed to release idempotency key: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
