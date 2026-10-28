export interface ICrawlRunStats {
  listed: number;
  planned: number;
  fetched: number;
  kept: number;
  rejected: number;
  created: number;
  updated: number;
  unchanged: number;
  reactivated: number;
  staled: number;
  closed: number;
}

export interface IUpsertCounts {
  created: number;
  updated: number;
  unchanged: number;
  reactivated: number;
}
