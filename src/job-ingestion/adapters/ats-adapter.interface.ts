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
  // Multi-company sources; the service prefers this over the source's companyName
  companyName?: string;
  // Raw skill names from the source, not yet mapped to the catalog
  skills?: string[];
  monthsOfExperience?: number;
  salaryText?: string;
  expiresAt?: Date;
}

export interface IAtsFetchResult {
  jobs: IRawAtsJob[];
  // Every id still posted at the source; known ids the adapter did not refetch stay ACTIVE
  listedIds: string[];
  // Fetched but unusable (404, no structured data); remembered so they are not refetched
  rejectedIds?: string[];
  stoppedEarly?: string;
}

export interface IAtsAdapter {
  readonly provider: EJobSourceProvider;
  fetchJobs(boardToken: string, knownIds: ReadonlySet<string>): Promise<IAtsFetchResult>;
}
