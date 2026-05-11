export const GEMINI_QUOTA_WORKLOADS = ['parse', 'chat-fallback', 'summary'] as const;

export type GeminiQuotaWorkload = (typeof GEMINI_QUOTA_WORKLOADS)[number];
export type GeminiQuotaScope = 'minute' | 'day';

export const DEFAULT_GEMINI_DAILY_BUDGET = 450;
export const DEFAULT_GEMINI_DAILY_ALERT_THRESHOLDS = [70, 85, 95];

export const DEFAULT_GEMINI_MINUTE_RESERVES: Record<GeminiQuotaWorkload, number> = {
  parse: 0,
  'chat-fallback': 2,
  summary: 4,
};

export const DEFAULT_GEMINI_DAILY_RESERVES: Record<GeminiQuotaWorkload, number> = {
  parse: 0,
  'chat-fallback': 25,
  summary: 50,
};

export const GEMINI_QUOTA_REDIS_PREFIX = 'gemini:quota';
