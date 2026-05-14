import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ERole } from 'src/casl';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { IUser } from 'src/users/user.interface';
import {
  CHAT_QUOTA_HR_DAILY_LIMIT,
  CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT,
} from './constants/chat.constant';
import { IChatQuotaStatus } from './interfaces/chat-quota-status.interface';
import { ChatQuotaExceededException } from './exceptions/too-many-requests.exception';

@Injectable()
export class ChatQuotaService {
  private readonly logger = new Logger(ChatQuotaService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly configService: ConfigService,
  ) {}

  async consume(user: IUser): Promise<IChatQuotaStatus> {
    const limit = this.resolveDailyLimit(user);
    const resetAt = this.getNextUtcMidnight();

    if (limit === null) {
      return {
        limit: null,
        used: 0,
        remaining: null,
        resetAt,
        unlimited: true,
      };
    }

    try {
      const key = this.buildQuotaKey(user._id);
      const used = await this.redisClient.incr(key);

      if (used === 1) {
        await this.redisClient.pexpire(key, Math.max(1000, resetAt.getTime() - Date.now()));
      }

      const status: IChatQuotaStatus = {
        limit,
        used,
        remaining: Math.max(0, limit - used),
        resetAt,
        unlimited: false,
      };

      if (used > limit) {
        throw new ChatQuotaExceededException(status);
      }

      return status;
    } catch (error) {
      if (error instanceof ChatQuotaExceededException) {
        throw error;
      }

      this.logger.warn(
        `Chat quota storage unavailable; allowing request for user ${user._id}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        limit,
        used: 0,
        remaining: limit,
        resetAt,
        unlimited: false,
        unavailable: true,
      };
    }
  }

  private resolveDailyLimit(user: IUser): number | null {
    const roleName = user.role?.name;

    if (roleName === ERole.SUPER_ADMIN) {
      return null;
    }

    if (roleName === ERole.HR) {
      return this.readPositiveIntConfig('CHAT_QUOTA_HR_DAILY_LIMIT', CHAT_QUOTA_HR_DAILY_LIMIT);
    }

    return this.readPositiveIntConfig(
      'CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT',
      CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT,
    );
  }

  private buildQuotaKey(userId: string): string {
    return `chat_quota:${this.getUtcDateKey()}:${userId}`;
  }

  private getUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getNextUtcMidnight(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  }

  private readPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback;

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }
}
