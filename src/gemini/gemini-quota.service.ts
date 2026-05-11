import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import {
  DEFAULT_GEMINI_DAILY_ALERT_THRESHOLDS,
  DEFAULT_GEMINI_DAILY_BUDGET,
  DEFAULT_GEMINI_DAILY_RESERVES,
  DEFAULT_GEMINI_MINUTE_RESERVES,
  GEMINI_QUOTA_REDIS_PREFIX,
  GeminiQuotaScope,
  GeminiQuotaWorkload,
} from './gemini-quota.constants';
import { GeminiQuotaDeniedException } from './gemini-quota-denied.exception';

const DEFAULT_GEMINI_RPM = 15;
const MIN_GEMINI_LIMIT = 1;

const RESERVE_REQUEST_LUA = `
local minuteCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local dayCount = tonumber(redis.call('GET', KEYS[2]) or '0')
local minuteLimit = tonumber(ARGV[1])
local dayLimit = tonumber(ARGV[2])
local minuteReserve = tonumber(ARGV[3])
local dayReserve = tonumber(ARGV[4])
local units = tonumber(ARGV[5])

if minuteCount + units > minuteLimit - minuteReserve then
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl < 0 then ttl = tonumber(ARGV[6]) end
  return {0, 'minute', minuteCount, dayCount, ttl}
end

if dayCount + units > dayLimit - dayReserve then
  local ttl = redis.call('PTTL', KEYS[2])
  if ttl < 0 then ttl = tonumber(ARGV[7]) end
  return {0, 'day', minuteCount, dayCount, ttl}
end

local newMinute = redis.call('INCRBY', KEYS[1], units)
if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[6]) end

local newDay = redis.call('INCRBY', KEYS[2], units)
if redis.call('PTTL', KEYS[2]) < 0 then redis.call('PEXPIRE', KEYS[2], ARGV[7]) end

return {1, 'ok', newMinute, newDay, 0}
`;

interface IGeminiQuotaReservation {
  minuteCount: number;
  dayCount: number;
  remainingMinuteQuota: number;
  remainingDayQuota: number;
}

interface IGeminiQuotaReserves {
  minute: number;
  day: number;
}

@Injectable()
export class GeminiQuotaService {
  private readonly logger = new Logger(GeminiQuotaService.name);
  private readonly minuteLimit: number;
  private readonly dailyLimit: number;
  private readonly alertThresholds: number[];
  private readonly minuteReserves: Record<GeminiQuotaWorkload, number>;
  private readonly dailyReserves: Record<GeminiQuotaWorkload, number>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly configService: ConfigService,
  ) {
    this.minuteLimit = this.readPositiveIntConfig('GEMINI_RPM', DEFAULT_GEMINI_RPM);
    this.dailyLimit = this.readPositiveIntConfig(
      'GEMINI_DAILY_BUDGET',
      DEFAULT_GEMINI_DAILY_BUDGET,
    );
    this.alertThresholds = this.readAlertThresholds();
    this.minuteReserves = {
      parse: this.readReserveConfig(
        'GEMINI_PARSE_MINUTE_RESERVE',
        DEFAULT_GEMINI_MINUTE_RESERVES.parse,
        this.minuteLimit,
      ),
      'chat-fallback': this.readReserveConfig(
        'GEMINI_CHAT_FALLBACK_MINUTE_RESERVE',
        DEFAULT_GEMINI_MINUTE_RESERVES['chat-fallback'],
        this.minuteLimit,
      ),
      summary: this.readReserveConfig(
        'GEMINI_SUMMARY_MINUTE_RESERVE',
        DEFAULT_GEMINI_MINUTE_RESERVES.summary,
        this.minuteLimit,
      ),
    };
    this.dailyReserves = {
      parse: this.readReserveConfig(
        'GEMINI_PARSE_DAILY_RESERVE',
        DEFAULT_GEMINI_DAILY_RESERVES.parse,
        this.dailyLimit,
      ),
      'chat-fallback': this.readReserveConfig(
        'GEMINI_CHAT_FALLBACK_DAILY_RESERVE',
        DEFAULT_GEMINI_DAILY_RESERVES['chat-fallback'],
        this.dailyLimit,
      ),
      summary: this.readReserveConfig(
        'GEMINI_SUMMARY_DAILY_RESERVE',
        DEFAULT_GEMINI_DAILY_RESERVES.summary,
        this.dailyLimit,
      ),
    };

    this.logger.log(
      `Gemini quota service initialized (RPM: ${this.minuteLimit}, daily budget: ${this.dailyLimit})`,
    );
  }

  async reserveRequest(
    workload: GeminiQuotaWorkload,
    units: number = 1,
  ): Promise<IGeminiQuotaReservation> {
    if (!Number.isInteger(units) || units < 1) {
      throw new Error('Quota units must be a positive integer');
    }

    const now = Date.now();
    const minuteKey = this.buildMinuteKey(now);
    const dayKey = this.buildDayKey(now);
    const minuteTtlMs = this.getMillisecondsUntilNextMinute(now);
    const dayTtlMs = this.getMillisecondsUntilNextUtcDay(now);
    const reserves = this.getReserves(workload);
    const rawResult = (await this.redisClient.eval(
      RESERVE_REQUEST_LUA,
      2,
      minuteKey,
      dayKey,
      String(this.minuteLimit),
      String(this.dailyLimit),
      String(reserves.minute),
      String(reserves.day),
      String(units),
      String(minuteTtlMs),
      String(dayTtlMs),
    )) as [
      number | string,
      GeminiQuotaScope | 'ok',
      number | string,
      number | string,
      number | string,
    ];

    const allowed = this.toNumber(rawResult[0]) === 1;
    const scope = rawResult[1];
    const minuteCount = this.toNumber(rawResult[2]);
    const dayCount = this.toNumber(rawResult[3]);
    const retryAfterMs = Math.max(1000, this.toNumber(rawResult[4]));
    const remainingMinuteQuota = Math.max(0, this.minuteLimit - minuteCount);
    const remainingDayQuota = Math.max(0, this.dailyLimit - dayCount);

    if (!allowed && scope !== 'ok') {
      throw new GeminiQuotaDeniedException(
        workload,
        scope,
        retryAfterMs,
        remainingMinuteQuota,
        remainingDayQuota,
      );
    }

    await this.logThresholdCrossings(dayCount, dayTtlMs);

    return {
      minuteCount,
      dayCount,
      remainingMinuteQuota,
      remainingDayQuota,
    };
  }

  isQuotaDeniedError(error: unknown): error is GeminiQuotaDeniedException {
    return error instanceof GeminiQuotaDeniedException;
  }

  private getReserves(workload: GeminiQuotaWorkload): IGeminiQuotaReserves {
    return {
      minute: this.minuteReserves[workload],
      day: this.dailyReserves[workload],
    };
  }

  private async logThresholdCrossings(dayCount: number, dayTtlMs: number): Promise<void> {
    const usagePercent = (dayCount / this.dailyLimit) * 100;

    for (const threshold of this.alertThresholds) {
      if (usagePercent < threshold) {
        continue;
      }

      const alertKey = this.buildAlertKey(threshold);
      const wasCreated = await this.redisClient.set(alertKey, '1', 'PX', dayTtlMs, 'NX');
      if (wasCreated !== 'OK') {
        continue;
      }

      const message =
        `Gemini daily quota threshold reached: ${threshold}% ` +
        `(used ${dayCount}/${this.dailyLimit}, remaining ${Math.max(0, this.dailyLimit - dayCount)})`;

      if (threshold >= 95) {
        this.logger.error(message);
        continue;
      }

      this.logger.warn(message);
    }
  }

  private readPositiveIntConfig(key: string, defaultValue: number): number {
    const value = this.configService.get<string>(key);
    if (value === undefined || value === null || value.trim() === '') {
      return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < MIN_GEMINI_LIMIT) {
      throw new Error(`${key} must be a positive integer`);
    }

    return parsed;
  }

  private readReserveConfig(key: string, defaultValue: number, limit: number): number {
    const value = this.configService.get<string>(key);
    if (value === undefined || value === null || value.trim() === '') {
      return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= limit) {
      throw new Error(`${key} must be an integer between 0 and ${limit - 1}`);
    }

    return parsed;
  }

  private readAlertThresholds(): number[] {
    const raw = this.configService.get<string>('GEMINI_DAILY_ALERT_THRESHOLDS');
    if (!raw || raw.trim() === '') {
      return [...DEFAULT_GEMINI_DAILY_ALERT_THRESHOLDS];
    }

    const parsed = raw
      .split(',')
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(value => Number.isFinite(value) && value > 0 && value <= 100);

    if (parsed.length === 0) {
      throw new Error('GEMINI_DAILY_ALERT_THRESHOLDS must contain comma-separated integers');
    }

    return Array.from(new Set(parsed)).sort((left, right) => left - right);
  }

  private buildMinuteKey(now: number): string {
    const minuteBucket = Math.floor(now / 60000);
    return `${GEMINI_QUOTA_REDIS_PREFIX}:minute:${minuteBucket}`;
  }

  private buildDayKey(now: number): string {
    const dayBucket = new Date(now).toISOString().slice(0, 10);
    return `${GEMINI_QUOTA_REDIS_PREFIX}:day:${dayBucket}`;
  }

  private buildAlertKey(threshold: number): string {
    const dayBucket = new Date().toISOString().slice(0, 10);
    return `${GEMINI_QUOTA_REDIS_PREFIX}:alert:${dayBucket}:${threshold}`;
  }

  private getMillisecondsUntilNextMinute(now: number): number {
    return 60000 - (now % 60000);
  }

  private getMillisecondsUntilNextUtcDay(now: number): number {
    const nextDay = new Date(now);
    nextDay.setUTCHours(24, 0, 0, 0);
    return nextDay.getTime() - now;
  }

  private toNumber(value: number | string): number {
    return typeof value === 'number' ? value : Number.parseInt(value, 10);
  }
}
