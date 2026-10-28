import { JobSearchSort, JobSearchSource } from '../job-search.constants';

export interface INormalizedJobSearch {
  keyword?: string;
  locationCode?: string;
  level?: string;
  formOfWork?: string;
  salaryMin?: number;
  salaryMax?: number;
  source: JobSearchSource;
  sort: JobSearchSort;
  page: number;
  limit: number;
}

export interface IJobSearchItem {
  id: string;
  sourceType: 'INTERNAL' | 'EXTERNAL';
  sourceKey?: string;
  title: string;
  companyName: string;
  companyLogo?: string | null;
  location: string;
  locationCode?: string;
  salary?: number;
  level?: string;
  formOfWork?: string;
  isRemote: boolean;
  skills: string[];
  postedAt: Date;
  applyMode: 'INTERNAL' | 'EXTERNAL_REDIRECT';
  applyUrl?: string;
}

export interface IJobSearchResponse {
  result: IJobSearchItem[];
  meta: {
    pagination: {
      current_page: number;
      per_page: number;
      total_pages: number;
      total: number;
    };
  };
}

export interface IExternalJobDetail {
  id: string;
  sourceKey: string;
  title: string;
  companyName: string;
  location: string;
  locationCode?: string;
  isRemote: boolean;
  skills: string[];
  level?: string;
  descriptionHtml: string;
  postedAt: Date;
  sourceUrl: string;
  applyUrl: string;
  status: 'ACTIVE' | 'CLOSED';
}
