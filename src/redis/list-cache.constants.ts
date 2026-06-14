export const LIST_CACHE_TTL = {
  JOBS: 60 * 1000,
  COMPANIES: 3 * 60 * 1000,
} as const;

export const LIST_CACHE_ENDPOINTS = {
  JOBS: 'jobs',
  COMPANIES: 'companies',
} as const;

export const LIST_CACHE_SCOPES = {
  PUBLIC: 'public',
  SUPER_ADMIN: 'super-admin',
  hr: (companyId: string) => `hr:${companyId}`,
} as const;

export const LIST_CACHE_TAGS = {
  jobs: {
    all: 'list:jobs',
    scope: (scope: string) => `list:jobs:scope:${scope}`,
    company: (companyId: string) => `list:jobs:company:${companyId}`,
    job: (jobId: string) => `list:jobs:job:${jobId}`,
    keyword: 'list:jobs:keyword',
    filter: (field: string) => `list:jobs:filter:${field}`,
  },
  companies: {
    all: 'list:companies',
    scope: (scope: string) => `list:companies:scope:${scope}`,
    company: (companyId: string) => `list:companies:company:${companyId}`,
    filter: (field: string) => `list:companies:filter:${field}`,
  },
} as const;
