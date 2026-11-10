export const RESUME_QUEUE = 'resume-processing';
export const COMPANY_FOLLOWER_NOTIFICATION_QUEUE = 'company-follower-notification';
export const JOB_RECOMMENDATION_QUEUE = 'job-recommendation';
export const APPLICATION_NOTIFICATION_QUEUE = 'application-notification';
export const JOB_EXPIRATION_NOTIFICATION_QUEUE = 'job-expiration-notification';
export const ACCOUNT_DELETION_QUEUE = 'account-deletion';
export const JOB_INGESTION_QUEUE = 'job-ingestion';

const HOUR_MS = 60 * 60 * 1000;

export const QUEUE_DEDUP_TTL_MS = {
  JOB_EXPIRED: 24 * HOUR_MS,
  NEW_JOB: 24 * HOUR_MS,
  NEW_APPLICATION: 24 * HOUR_MS,
  // Short window: a status may legitimately change back and forth.
  STATUS_UPDATE: 10 * 60 * 1000,
  JOB_RECOMMENDATION: 7 * 24 * HOUR_MS,
} as const;
