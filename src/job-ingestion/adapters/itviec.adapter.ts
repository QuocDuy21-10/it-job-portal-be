import { Injectable } from '@nestjs/common';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { formatSalaryText } from '../ingestion-filters';
import { SitemapJobPostingAdapter } from './sitemap-job-posting.adapter';

const ITVIEC_JOBS_SITEMAP_URL = 'https://itviec.com/twinnings_jobs_desc_en.xml';
const DETAIL_URL_PATTERN = /^https:\/\/itviec\.com\/it-jobs\/([a-z0-9-]+)$/;
const NUMERIC_PATTERN = /^\d+(\.\d+)?$/;

@Injectable()
export class ItviecAdapter extends SitemapJobPostingAdapter {
  readonly provider = EJobSourceProvider.ITVIEC;
  protected readonly sitemapIndexUrl = 'https://itviec.com/dunggiatminh.xml';

  protected isJobSitemapPage(url: string): boolean {
    return url === ITVIEC_JOBS_SITEMAP_URL;
  }

  // ITviec is IT-only, and numeric slug suffixes repeat across companies, so the whole slug is the id.
  protected parseJobUrl(url: string): string | undefined {
    return DETAIL_URL_PATTERN.exec(url)?.[1];
  }

  // Salaries sit behind login; the text field only carries a teaser such as "You'll love it".
  protected mapSalary(baseSalary: any): string | undefined {
    const text = baseSalary?.value?.value;

    if (typeof text === 'string' && !NUMERIC_PATTERN.test(text.trim())) {
      return formatSalaryText({ ...baseSalary, value: { ...baseSalary.value, value: undefined } });
    }

    return formatSalaryText(baseSalary);
  }
}
