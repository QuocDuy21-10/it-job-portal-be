export const CHAT_ROUTE_RPM_LIMIT = 15;

export const CHAT_QUOTA_NORMAL_USER_DAILY_LIMIT = 30;
export const CHAT_QUOTA_HR_DAILY_LIMIT = 100;

export const CHAT_CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000;

export const CHAT_TOOL_ACTION_EXPIRY_MS = 15 * 60 * 1000;

export const CHAT_IDEMPOTENCY_KEY_PREFIX = 'chat_idem:';
// Well above the slowest observed turn (57 s in the 2026-11-20 QA run).
export const CHAT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
