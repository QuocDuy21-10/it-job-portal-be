import { ThrottlerOptions } from '@nestjs/throttler';

/** Applied to every route by the global ThrottlerGuard. Counted per IP and per route handler. */
export const BASELINE_THROTTLERS: ThrottlerOptions[] = [
  { name: 'burst', ttl: 1000, limit: 20 },
  { name: 'sustained', ttl: 10000, limit: 100 },
  { name: 'default', ttl: 60000, limit: 300 },
];

/** The limits auth, chat and job-search had before the guard became global. */
export const STRICT_THROTTLE: Record<string, { ttl: number; limit: number }> = {
  burst: { ttl: 1000, limit: 5 },
  sustained: { ttl: 10000, limit: 20 },
  default: { ttl: 60000, limit: 60 },
};

/** `@SkipThrottle()` alone skips only the throttler named `default`. */
export const SKIP_ALL_THROTTLERS: Record<string, boolean> = {
  burst: true,
  sustained: true,
  default: true,
};
