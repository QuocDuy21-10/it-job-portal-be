export const CACHE_KEYS = {
  ADMIN_DASHBOARD: 'dashboard:admin',
  hrDashboard: (companyId: string) => `dashboard:hr:${companyId}`,
  topHiringCompanies: (limit: number) => `homepage:top-hiring-companies:${limit}`,
} as const;

export const CACHE_TTL = {
  ADMIN_DASHBOARD: 15 * 60 * 1000,
  HR_DASHBOARD: 3 * 60 * 1000,
  TOP_HIRING_COMPANIES: 5 * 60 * 1000,
} as const;

export const TIME_RANGES = {
  HOURS_24: 24,
  DAYS_7: 7,
  DAYS_30: 30,
} as const;

export const LIMITS = {
  TOP_SKILLS: 10,
  TOP_JOBS: 5,
  TOP_HIRING_COMPANIES: 20,
} as const;

export const DATE_FORMATS = {
  ISO_DATE: '%Y-%m-%d',
  DISPLAY_DATE: 'YYYY-MM-DD',
} as const;
