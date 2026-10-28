import { EJobLevel } from 'src/jobs/enums/job-level.enum';

export interface INormalizedExternalJob {
  sourceKey: string;
  externalId: string;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  companyName: string;
  location: string;
  locationCode?: string;
  isRemote: boolean;
  skills: string[];
  level?: EJobLevel;
  descriptionHtml: string;
  publishedAt?: Date;
  expiresAt?: Date;
  salaryText?: string;
}

export interface INormalizeOptions {
  sourceKey: string;
  companyName: string;
  aliasMap: Record<string, string>;
  // False for LINK_ONLY sources: skills are still extracted, the text is not stored.
  keepDescription: boolean;
}
