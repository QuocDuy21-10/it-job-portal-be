import { EJobSourceProvider } from '../enums/job-source-provider.enum';

export interface IRawAtsJob {
  externalId: string;
  title: string;
  location: string;
  country?: string;
  isRemoteHint?: boolean;
  sourceUrl: string;
  applyUrl?: string;
  // HTML with entities decoded, NOT sanitized yet
  descriptionHtml: string;
  publishedAt?: Date;
}

export interface IAtsAdapter {
  readonly provider: EJobSourceProvider;
  fetchJobs(boardToken: string): Promise<IRawAtsJob[]>;
}
