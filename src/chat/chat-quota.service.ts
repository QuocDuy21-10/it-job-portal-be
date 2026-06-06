import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Model } from 'mongoose';
import { ERole } from 'src/casl';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { IUser } from 'src/users/user.interface';
import {
  CHAT_QUOTA_HR_DAILY_LIMIT,
  CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT,
} from './constants/chat.constant';
import {
  IChatQuotaPublicStatus,
  IChatQuotaReservation,
  IChatQuotaStatus,
} from './interfaces/chat-quota-status.interface';
import { ChatQuotaExceededException } from './exceptions/too-many-requests.exception';
import { ChatQuotaPolicy, ChatQuotaPolicyDocument } from './schemas/chat-quota-policy.schema';

const DEFAULT_QUOTA_TIMEZONE = 'Asia/Ho_Chi_Minh';
const POLICY_CACHE_TTL_MS = 60_000;

const RESERVE_QUOTA_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current >= limit then
  return {0, current, 0}
end

local used = redis.call('INCR', KEYS[1])
if used == 1 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end

return {1, used, math.max(0, limit - used)}
`;

const ROLLBACK_QUOTA_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 0 then
  return 0
end

return redis.call('DECR', KEYS[1])
`;

interface QuotaPolicy {
  limit: number | null;
  timezone: string;
}

interface CachedQuotaPolicy {
  policy: QuotaPolicy;
  expiresAt: number;
}

interface TimeZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

@Injectable()
export class ChatQuotaService {
  private readonly logger = new Logger(ChatQuotaService.name);
  private readonly policyCache = new Map<string, CachedQuotaPolicy>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly configService: ConfigService,
    @InjectModel(ChatQuotaPolicy.name)
    private readonly chatQuotaPolicyModel: Model<ChatQuotaPolicyDocument>,
  ) {}

  async reserve(user: IUser): Promise<IChatQuotaReservation> {
    const policy = await this.resolvePolicy(user);
    const resetAt = this.getNextResetAt(policy.timezone);

    if (policy.limit === null) {
      return {
        consumed: false,
        status: this.buildUnlimitedStatus(resetAt),
      };
    }

    const roleName = this.resolveUserRoleName(user);
    const key = this.buildQuotaKey(user._id, roleName, policy.timezone);
    const ttlMs = Math.max(1000, resetAt.getTime() - Date.now());

    try {
      const result = await this.redisClient.eval(RESERVE_QUOTA_SCRIPT, 1, key, policy.limit, ttlMs);
      const [allowed, used, remaining] = this.parseReserveResult(result);
      const status = this.buildLimitedStatus(policy.limit, used, remaining, resetAt);

      if (!allowed) {
        throw new ChatQuotaExceededException(status);
      }

      return {
        key,
        consumed: true,
        status,
      };
    } catch (error) {
      if (error instanceof ChatQuotaExceededException) {
        throw error;
      }

      this.logger.warn(
        `Chat quota storage unavailable; allowing request for user ${user._id}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        consumed: false,
        status: this.buildUnavailableStatus(policy.limit, resetAt),
      };
    }
  }

  async rollback(reservation?: IChatQuotaReservation): Promise<void> {
    if (!reservation?.consumed || !reservation.key) {
      return;
    }

    try {
      await this.redisClient.eval(ROLLBACK_QUOTA_SCRIPT, 1, reservation.key);
    } catch (error) {
      this.logger.warn(
        `Failed to rollback chat quota reservation for key ${reservation.key}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async getStatus(user: IUser): Promise<IChatQuotaStatus> {
    const policy = await this.resolvePolicy(user);
    const resetAt = this.getNextResetAt(policy.timezone);

    if (policy.limit === null) {
      return this.buildUnlimitedStatus(resetAt);
    }

    try {
      const key = this.buildQuotaKey(user._id, this.resolveUserRoleName(user), policy.timezone);
      const rawUsed = await this.redisClient.get(key);
      const used = this.toNonNegativeInteger(rawUsed);

      return this.buildLimitedStatus(policy.limit, used, Math.max(0, policy.limit - used), resetAt);
    } catch (error) {
      this.logger.warn(
        `Chat quota status unavailable for user ${user._id}`,
        error instanceof Error ? error.stack : String(error),
      );

      return this.buildUnavailableStatus(policy.limit, resetAt);
    }
  }

  async consume(user: IUser): Promise<IChatQuotaStatus> {
    const reservation = await this.reserve(user);
    return reservation.status;
  }

  serializePublicStatus(status: IChatQuotaStatus): IChatQuotaPublicStatus {
    return {
      remainingQuota: status.remaining,
      nextResetTime: Math.floor(status.resetAt.getTime() / 1000),
    };
  }

  private async resolvePolicy(user: IUser): Promise<QuotaPolicy> {
    const roleName = this.resolveUserRoleName(user);

    if (roleName === ERole.SUPER_ADMIN) {
      return {
        limit: null,
        timezone: DEFAULT_QUOTA_TIMEZONE,
      };
    }

    const cachedPolicy = this.policyCache.get(roleName);
    if (cachedPolicy && cachedPolicy.expiresAt > Date.now()) {
      return cachedPolicy.policy;
    }

    const fallbackPolicy = this.resolveFallbackPolicy(roleName);

    try {
      const quotaPolicy = await this.chatQuotaPolicyModel
        .findOne({ roleName, isActive: true })
        .select('dailyLimit timezone')
        .lean()
        .exec();

      const policy = quotaPolicy
        ? {
            limit:
              quotaPolicy.dailyLimit === null
                ? null
                : this.normalizePolicyLimit(quotaPolicy.dailyLimit, fallbackPolicy.limit),
            timezone: this.normalizeTimezone(quotaPolicy.timezone, fallbackPolicy.timezone),
          }
        : fallbackPolicy;

      this.policyCache.set(roleName, {
        policy,
        expiresAt: Date.now() + POLICY_CACHE_TTL_MS,
      });

      return policy;
    } catch (error) {
      this.logger.warn(
        `Failed to read chat quota policy for role ${roleName}; using fallback policy`,
        error instanceof Error ? error.stack : String(error),
      );

      return fallbackPolicy;
    }
  }

  private resolveFallbackPolicy(roleName: string): QuotaPolicy {
    if (roleName === ERole.HR) {
      return {
        limit: this.readPositiveIntConfig('CHAT_QUOTA_HR_DAILY_LIMIT', CHAT_QUOTA_HR_DAILY_LIMIT),
        timezone: DEFAULT_QUOTA_TIMEZONE,
      };
    }

    return {
      limit: this.readPositiveIntConfig(
        'CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT',
        CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT,
      ),
      timezone: DEFAULT_QUOTA_TIMEZONE,
    };
  }

  private normalizePolicyLimit(value: unknown, fallback: number | null): number | null {
    if (value === null) {
      return null;
    }

    const parsedValue = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }

  private normalizeTimezone(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return fallback;
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
      return value;
    } catch (error) {
      this.logger.warn(
        `Invalid chat quota timezone "${value}"; using ${fallback}`,
        error instanceof Error ? error.stack : String(error),
      );
      return fallback;
    }
  }

  private resolveUserRoleName(user: IUser): string {
    return user.role ?? ERole.NORMAL_USER;
  }

  private buildQuotaKey(userId: string, roleName: string, timezone: string): string {
    return `chat:quota:v1:${this.getDateKey(timezone)}:role:${roleName}:user:${userId}`;
  }

  private getDateKey(timezone: string): string {
    const parts = this.getTimeZoneParts(new Date(), timezone);
    return `${parts.year}${this.pad(parts.month)}${this.pad(parts.day)}`;
  }

  private getNextResetAt(timezone: string): Date {
    const now = new Date();
    const parts = this.getTimeZoneParts(now, timezone);
    const nextMidnightUtcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
    const offsetMs = this.getTimeZoneOffsetMs(nextMidnightUtcGuess, timezone);

    return new Date(nextMidnightUtcGuess.getTime() - offsetMs);
  }

  private getTimeZoneParts(date: Date, timezone: string): TimeZoneParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date).reduce<Record<string, string>>((result, part) => {
      if (part.type !== 'literal') {
        result[part.type] = part.value;
      }

      return result;
    }, {});

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  private getTimeZoneOffsetMs(date: Date, timezone: string): number {
    const parts = this.getTimeZoneParts(date, timezone);
    const zonedTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );

    return zonedTimestamp - date.getTime();
  }

  private parseReserveResult(result: unknown): [boolean, number, number] {
    if (!Array.isArray(result) || result.length < 3) {
      return [false, 0, 0];
    }

    return [
      Number(result[0]) === 1,
      this.toNonNegativeInteger(result[1]),
      this.toNonNegativeInteger(result[2]),
    ];
  }

  private buildUnlimitedStatus(resetAt: Date): IChatQuotaStatus {
    return {
      limit: null,
      used: 0,
      remaining: null,
      resetAt,
      unlimited: true,
    };
  }

  private buildLimitedStatus(
    limit: number,
    used: number,
    remaining: number,
    resetAt: Date,
  ): IChatQuotaStatus {
    return {
      limit,
      used,
      remaining,
      resetAt,
      unlimited: false,
    };
  }

  private buildUnavailableStatus(limit: number, resetAt: Date): IChatQuotaStatus {
    return {
      limit,
      used: 0,
      remaining: limit,
      resetAt,
      unlimited: false,
      unavailable: true,
    };
  }

  private toNonNegativeInteger(value: unknown): number {
    const parsedValue = typeof value === 'number' ? value : Number.parseInt(String(value ?? 0), 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  }

  private readPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback;

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
