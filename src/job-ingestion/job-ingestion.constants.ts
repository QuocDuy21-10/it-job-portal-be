import { EExternalJobStatus } from './enums/external-job-status.enum';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { ERejectionReason } from './enums/rejection-reason.enum';

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 3;
export const MAX_DETAIL_BYTES = 2 * 1024 * 1024;
export const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
// Whole ATS boards with content inline; Axon was 7.7 MB and Agoda 6.2 MB on 2026-10-28.
export const MAX_BOARD_BYTES = 25 * 1024 * 1024;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const REFRESH_AFTER_DAYS = 7;
// Slightly under the 6h cron so the next scheduled run closes the job despite jitter.
export const STALE_GRACE_HOURS = 5;
export const MIN_LISTED_RATIO = 0.5;
export const MIN_BASELINE_FOR_RATIO = 20;
export const REJECTION_RETRY_DAYS: Record<ERejectionReason, number> = {
  [ERejectionReason.NOT_FOUND]: 3,
  [ERejectionReason.NO_STRUCTURED_DATA]: 3,
  [ERejectionReason.MISSING_FIELDS]: 7,
  [ERejectionReason.NOT_IT]: 30,
};
export const ALERT_AFTER_FAILURES = 3;

export const CRAWL_RUN_TTL_SECONDS = 90 * 24 * 60 * 60;
export const CRAWL_RUNS_DEFAULT_LIMIT = 20;
export const CRAWL_RUNS_MAX_LIMIT = 100;

// Sources stored before displayPolicy existed get the most restrictive public policy.
export const DEFAULT_DISPLAY_POLICY = EJobSourceDisplayPolicy.LINK_ONLY;
export const VISIBLE_EXTERNAL_JOB_STATUSES = [EExternalJobStatus.ACTIVE, EExternalJobStatus.STALE];
