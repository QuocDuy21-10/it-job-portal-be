
// ========== CACHE CONFIGURATION ==========
export const CACHE_KEYS = {
  DASHBOARD_STATS: 'dashboard:stats',
  JOBS_24H: 'stats:jobs:24h',
  ACTIVE_JOBS: 'stats:jobs:active',
  HIRING_COMPANIES: 'stats:companies:hiring',
  SALARY_DISTRIBUTION: 'stats:salary:distribution',
  JOB_TREND: 'stats:jobs:trend',
} as const;

export const CACHE_TTL = {
  DASHBOARD: 15 * 60 * 1000, // 15 minutes in milliseconds
  QUICK_STATS: 5 * 60 * 1000, // 5 minutes in milliseconds
} as const;

// ========== SALARY RANGES CONFIGURATION ==========
export const SALARY_RANGES = {
  BOUNDARIES: [0, 10_000_000, 20_000_000, 30_000_000, 50_000_000] as number[],
  LABELS: [
    'Dưới 10 triệu',
    '10-20 triệu',
    '20-30 triệu',
    '30-50 triệu',
    'Trên 50 triệu',
  ],
} as const;

// ========== TIME RANGES ==========
export const TIME_RANGES = {
  HOURS_24: 24,
  DAYS_7: 7,
  DAYS_30: 30,
} as const;

// ========== DATE FORMAT ==========
export const DATE_FORMATS = {
  ISO_DATE: '%Y-%m-%d',
  DISPLAY_DATE: 'YYYY-MM-DD',
} as const;
