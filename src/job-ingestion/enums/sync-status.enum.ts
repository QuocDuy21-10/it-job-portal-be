export enum ESyncStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  // Detail fetching stopped early (403/429/captcha); the listing itself was complete.
  PARTIAL = 'PARTIAL',
  // Listing shrank too much to trust; no job was closed for being absent.
  SUSPECT = 'SUSPECT',
  FAILED = 'FAILED',
}
