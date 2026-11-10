export const REDIS_CLIENT = 'REDIS_CLIENT';

export const CACHE_TTL_JITTER_RATIO = 0.1;

export const CRON_LOCK_KEY_PREFIX = 'cron-lock';
// Only has to outlive the gap between instances firing; every run has its own minute key.
export const CRON_LOCK_TTL_MS = 10 * 60 * 1000;
