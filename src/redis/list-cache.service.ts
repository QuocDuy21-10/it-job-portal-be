import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface ListCacheKeyInput {
  endpoint: string;
  scope: string;
  payload: Record<string, unknown>;
}

interface ListCacheOptions<T> {
  keyInput: ListCacheKeyInput;
  ttlMs: number;
  tags: string[] | ((value: T) => string[]);
  loader: () => Promise<T>;
}

@Injectable()
export class ListCacheService {
  private readonly logger = new Logger(ListCacheService.name);
  private readonly keyPrefix = 'list-cache';
  private readonly indexTtlPaddingMs = 5 * 60 * 1000;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  buildKey(input: ListCacheKeyInput): string {
    const stablePayload = this.stableStringify(input);
    const hash = createHash('sha256').update(stablePayload).digest('hex');

    return `${this.keyPrefix}:entry:${input.endpoint}:${hash}`;
  }

  async getOrSet<T>(options: ListCacheOptions<T>): Promise<T> {
    const cacheKey = this.buildKey(options.keyInput);

    try {
      const cachedValue = await this.redis.get(cacheKey);
      if (cachedValue !== null) {
        return JSON.parse(cachedValue) as T;
      }
    } catch (error) {
      this.logger.warn(`List cache read failed: ${this.getErrorMessage(error)}`);
    }

    const value = await options.loader();

    try {
      const tags = typeof options.tags === 'function' ? options.tags(value) : options.tags;
      await this.store(cacheKey, value, tags, options.ttlMs);
    } catch (error) {
      this.logger.warn(`List cache write failed: ${this.getErrorMessage(error)}`);
    }

    return value;
  }

  async reclaimByTags(tags: string[]): Promise<void> {
    const uniqueTags = this.uniqueValues(tags);
    if (uniqueTags.length === 0) {
      return;
    }

    try {
      const tagIndexKeys = uniqueTags.map(tag => this.tagIndexKey(tag));
      const keyGroups = await Promise.all(tagIndexKeys.map(tagKey => this.redis.smembers(tagKey)));
      const cacheKeys = this.uniqueValues(keyGroups.flat());

      if (cacheKeys.length === 0) {
        await Promise.all(tagIndexKeys.map(tagKey => this.redis.del(tagKey)));
        return;
      }

      const reverseTagGroups = await Promise.all(
        cacheKeys.map(cacheKey => this.redis.smembers(this.entryTagsKey(cacheKey))),
      );

      const cleanupTasks: Array<Promise<unknown>> = [
        ...cacheKeys.map(cacheKey => this.redis.del(cacheKey)),
        ...cacheKeys.map(cacheKey => this.redis.del(this.entryTagsKey(cacheKey))),
        ...tagIndexKeys.map(tagKey => this.redis.del(tagKey)),
      ];

      for (let index = 0; index < cacheKeys.length; index += 1) {
        const cacheKey = cacheKeys[index];
        for (const reverseTag of reverseTagGroups[index]) {
          cleanupTasks.push(this.redis.srem(this.tagIndexKey(reverseTag), cacheKey));
        }
      }

      await Promise.all(cleanupTasks);
    } catch (error) {
      this.logger.warn(`List cache reclaim failed: ${this.getErrorMessage(error)}`);
    }
  }

  private async store<T>(cacheKey: string, value: T, tags: string[], ttlMs: number): Promise<void> {
    const uniqueTags = this.uniqueValues(tags);
    const indexTtlMs = ttlMs + this.indexTtlPaddingMs;
    const entryTagsKey = this.entryTagsKey(cacheKey);

    await this.redis.psetex(cacheKey, ttlMs, JSON.stringify(value));

    if (uniqueTags.length === 0) {
      return;
    }

    await Promise.all([
      ...uniqueTags.flatMap(tag => {
        const tagIndexKey = this.tagIndexKey(tag);
        return [
          this.redis.sadd(tagIndexKey, cacheKey),
          this.redis.pexpire(tagIndexKey, indexTtlMs),
        ];
      }),
      this.redis.sadd(entryTagsKey, ...uniqueTags),
      this.redis.pexpire(entryTagsKey, indexTtlMs),
    ]);
  }

  private tagIndexKey(tag: string): string {
    return `${this.keyPrefix}:tag:${this.hash(tag)}`;
  }

  private entryTagsKey(cacheKey: string): string {
    return `${this.keyPrefix}:entry-tags:${this.hash(cacheKey)}`;
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(this.normalizeForStableStringify(value));
  }

  private normalizeForStableStringify(value: unknown): unknown {
    if (value === null || typeof value === 'undefined') {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof RegExp) {
      return {
        __type: 'RegExp',
        flags: value.flags,
        source: value.source,
      };
    }

    if (Array.isArray(value)) {
      return value.map(item => this.normalizeForStableStringify(item));
    }

    if (typeof value === 'object') {
      const objectValue = value as Record<string, unknown> & { toHexString?: () => string };

      if (typeof objectValue.toHexString === 'function') {
        return objectValue.toHexString();
      }

      return Object.keys(objectValue)
        .sort()
        .reduce<Record<string, unknown>>((normalized, key) => {
          normalized[key] = this.normalizeForStableStringify(objectValue[key]);
          return normalized;
        }, {});
    }

    return value;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
