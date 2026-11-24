export const JOB_SEARCH_SOURCES = ['all', 'internal', 'external'] as const;
export type JobSearchSource = (typeof JOB_SEARCH_SOURCES)[number];

export const JOB_SEARCH_SORTS = ['newest', 'oldest', 'salary_desc', 'salary_asc'] as const;
export type JobSearchSort = (typeof JOB_SEARCH_SORTS)[number];

export const JOB_SEARCH_DEFAULT_PAGE = 1;
export const JOB_SEARCH_DEFAULT_LIMIT = 10;
export const JOB_SEARCH_MAX_LIMIT = 50;
// Each branch keeps page * limit rows, so the page number bounds the memory of one request.
export const JOB_SEARCH_MAX_PAGE = 200;
export const JOB_SEARCH_MAX_KEYWORD_LENGTH = 100;
