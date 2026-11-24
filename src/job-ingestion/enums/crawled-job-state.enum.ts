// What an admin filters by: the crawl status, or REMOVED once taken down.
export enum ECrawledJobState {
  ACTIVE = 'ACTIVE',
  STALE = 'STALE',
  CLOSED = 'CLOSED',
  REMOVED = 'REMOVED',
}
