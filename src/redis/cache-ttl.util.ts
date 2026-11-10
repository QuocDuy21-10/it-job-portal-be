import { CACHE_TTL_JITTER_RATIO } from './redis.constants';

export function withTtlJitter(ttlMs: number): number {
  return ttlMs + Math.floor(Math.random() * ttlMs * CACHE_TTL_JITTER_RATIO);
}
