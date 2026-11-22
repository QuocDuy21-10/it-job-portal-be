import { ThrottlerOptions } from '@nestjs/throttler';

/** Applied to every route by the global ThrottlerGuard. Counted per IP and per route handler. */
// Replaces the default 'ThrottlerException: Too Many Requests', which clients showed verbatim.
export const THROTTLE_ERROR_MESSAGE = 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau.';

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

/** Image uploads: each accepted file (up to 5 MB) stays on the VPS disk until it is cleaned up. */
export const UPLOAD_THROTTLE: Record<string, { ttl: number; limit: number }> = {
  default: { ttl: 60000, limit: 10 },
};

/** `@SkipThrottle()` alone skips only the throttler named `default`. */
export const SKIP_ALL_THROTTLERS: Record<string, boolean> = {
  burst: true,
  sustained: true,
  default: true,
};
