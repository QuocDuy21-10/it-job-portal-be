export enum ERejectionReason {
  NOT_FOUND = 'NOT_FOUND',
  NO_STRUCTURED_DATA = 'NO_STRUCTURED_DATA',
  MISSING_FIELDS = 'MISSING_FIELDS',
  // Timeout, network error, oversized page or unexpected HTTP status; the stored job stays public.
  FETCH_ERROR = 'FETCH_ERROR',
  // Not an IT job, or outside Vietnam and not remote.
  NOT_IT = 'NOT_IT',
}
