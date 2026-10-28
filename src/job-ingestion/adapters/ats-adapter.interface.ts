import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { ERejectionReason } from '../enums/rejection-reason.enum';

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
  // Multi-company sources; the service prefers this over the source's companyName
  companyName?: string;
  // Raw skill names from the source, not yet mapped to the catalog
  skills?: string[];
  monthsOfExperience?: number;
  salaryText?: string;
  expiresAt?: Date;
}

export interface IRejectedAtsJob {
  externalId: string;
  reason: ERejectionReason;
}

export interface IAtsFetchOptions {
  // Receives every listed id, returns the ids worth a detail fetch in priority order.
  selectForFetch(listedIds: string[]): string[];
}

export interface IAtsFetchResult {
  jobs: IRawAtsJob[];
  // Every id still posted at the source
  listedIds: string[];
  // Fetched but unusable (404, no structured data)
  rejected?: IRejectedAtsJob[];
  stoppedEarly?: string;
}

export interface IAtsAdapter {
  readonly provider: EJobSourceProvider;
  // Board adapters that return the whole board in one response ignore options.
  fetchJobs(boardToken: string, options: IAtsFetchOptions): Promise<IAtsFetchResult>;
}
