import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { IUser } from 'src/users/user.interface';
import { CHAT_CONTEXT_CACHE_TTL_MS } from './constants/chat.constant';
import { EChatIntent } from './enums/chat-intent.enum';
import { IntentAwareChatContext } from './interfaces/chat-context.interface';

@Injectable()
export class ChatCacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {}

  async getContext(
    user: IUser,
    intent: EChatIntent,
    message: string,
    jobId?: string,
  ): Promise<IntentAwareChatContext | undefined> {
    return this.cacheManager.get<IntentAwareChatContext>(
      this.buildContextKey(user, intent, message, jobId),
    );
  }

  async setContext(
    user: IUser,
    intent: EChatIntent,
    message: string,
    context: IntentAwareChatContext,
    jobId?: string,
  ): Promise<void> {
    await this.cacheManager.set(
      this.buildContextKey(user, intent, message, jobId),
      context,
      this.readPositiveIntConfig('CHAT_CONTEXT_CACHE_TTL_MS', CHAT_CONTEXT_CACHE_TTL_MS),
    );
  }

  private buildContextKey(
    user: IUser,
    intent: EChatIntent,
    message: string,
    jobId?: string,
  ): string {
    return [
      'chat_cache',
      'context',
      user._id,
      intent,
      jobId || 'none',
      this.hash(this.normalizeValue(message)),
    ].join(':');
  }

  private normalizeValue(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private readPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback;

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }
}
