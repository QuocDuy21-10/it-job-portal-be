import { Injectable } from '@nestjs/common';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { isLikelyItSlug } from '../ingestion-filters';
import { SitemapJobPostingAdapter } from './sitemap-job-posting.adapter';

const TOPDEV_SITEMAP_PAGE_PREFIX = 'https://topdev.vn/sitemap/jobs_desc_en_page_';
const DETAIL_URL_PATTERN = /^https:\/\/topdev\.vn\/detail-jobs\/([a-z0-9-]+)-(\d+)$/;

@Injectable()
export class TopDevAdapter extends SitemapJobPostingAdapter {
  readonly provider = EJobSourceProvider.TOPDEV;
  protected readonly sitemapIndexUrl = 'https://topdev.vn/sitemap-jobs.xml';

  protected isJobSitemapPage(url: string): boolean {
    return url.startsWith(TOPDEV_SITEMAP_PAGE_PREFIX);
  }

  // TopDev lists every industry, so slugs are pre-filtered before any detail fetch.
  protected parseJobUrl(url: string): string | undefined {
    const match = DETAIL_URL_PATTERN.exec(url);
    return match && isLikelyItSlug(match[1]) ? match[2] : undefined;
  }
}
