import { setTimeout as delay } from 'timers/promises';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { buildExcerpt, formatSalaryText } from '../ingestion-filters';
import { IAtsAdapter, IAtsFetchResult, IRawAtsJob } from './ats-adapter.interface';
import { assertBoardToken } from './ats-http';

const LOC_PATTERN = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
const JSON_LD_PATTERN = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
const BOT_CHALLENGE_PATTERN = /captcha|cf-challenge/i;
const BLOCKED_STATUSES = new Set([403, 429]);
const PLACEHOLDER_ADDRESS_PARTS = new Set(['not available']);
const USER_AGENT = 'DevLinkBot/1.0';
const FETCH_TIMEOUT_MS = 15_000;
const SITEMAP_DELAY_MS = 500;
const DETAIL_DELAY_MS = 1_000;
const MAX_DETAIL_FETCHES_PER_SYNC = 150;

type DetailOutcome =
  | { kind: 'job'; job: IRawAtsJob }
  | { kind: 'rejected' }
  | { kind: 'retry-later' }
  | { kind: 'blocked'; reason: string };

const extractLocs = (xml: string): string[] =>
  [...xml.matchAll(LOC_PATTERN)].map(match => match[1]);

const findJobPosting = (html: string): any => {
  for (const [, json] of html.matchAll(JSON_LD_PATTERN)) {
    try {
      const data = JSON.parse(json);

      if (data?.['@type'] === 'JobPosting') {
        return data;
      }
    } catch {
      // Malformed blocks are ignored; another block may still hold the JobPosting.
    }
  }

  return undefined;
};

const toDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const trimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const addressPart = (value: unknown): string => {
  const part = trimmedString(value);
  return PLACEHOLDER_ADDRESS_PARTS.has(part.toLowerCase()) ? '' : part;
};

/**
 * Job boards that publish a sitemap of job pages, each carrying a schema.org JobPosting in JSON-LD.
 * Only new ids are fetched, politely and sequentially; subclasses describe where the pages live.
 */
export abstract class SitemapJobPostingAdapter implements IAtsAdapter {
  abstract readonly provider: EJobSourceProvider;
  protected abstract readonly sitemapIndexUrl: string;

  protected abstract isJobSitemapPage(url: string): boolean;

  // Returns the external id when the URL is a job page worth fetching.
  protected abstract parseJobUrl(url: string): string | undefined;

  protected mapSalary(baseSalary: unknown): string | undefined {
    return formatSalaryText(baseSalary);
  }

  async fetchJobs(boardToken: string, knownIds: ReadonlySet<string>): Promise<IAtsFetchResult> {
    assertBoardToken(boardToken);

    const listedUrls = await this.fetchListedJobUrls();
    const toFetch = [...listedUrls]
      .filter(([id]) => !knownIds.has(id))
      .slice(0, MAX_DETAIL_FETCHES_PER_SYNC);
    const jobs: IRawAtsJob[] = [];
    const rejectedIds: string[] = [];
    let stoppedEarly: string | undefined;

    for (const [id, url] of toFetch) {
      await this.sleep(DETAIL_DELAY_MS);
      const outcome = await this.fetchDetail(id, url);

      if (outcome.kind === 'blocked') {
        stoppedEarly = outcome.reason;
        break;
      }

      if (outcome.kind === 'job') {
        jobs.push(outcome.job);
      } else if (outcome.kind === 'rejected') {
        rejectedIds.push(id);
      }
    }

    return { jobs, listedIds: [...listedUrls.keys()], rejectedIds, stoppedEarly };
  }

  protected async sleep(ms: number): Promise<void> {
    await delay(ms);
  }

  private async fetchListedJobUrls(): Promise<Map<string, string>> {
    const pageUrls = extractLocs(await this.fetchSitemap(this.sitemapIndexUrl)).filter(url =>
      this.isJobSitemapPage(url),
    );

    if (pageUrls.length === 0) {
      throw new Error(`${this.provider} sitemap index lists no job pages`);
    }

    const listedUrls = new Map<string, string>();

    for (const pageUrl of pageUrls) {
      await this.sleep(SITEMAP_DELAY_MS);

      for (const url of extractLocs(await this.fetchSitemap(pageUrl))) {
        const id = this.parseJobUrl(url);

        if (id && !listedUrls.has(id)) {
          listedUrls.set(id, url);
        }
      }
    }

    return listedUrls;
  }

  private async fetchSitemap(url: string): Promise<string> {
    const response = await this.request(url);

    if (!response.ok) {
      throw new Error(
        `${this.provider} sitemap request failed with status ${response.status}: ${url}`,
      );
    }

    return response.text();
  }

  private async fetchDetail(id: string, url: string): Promise<DetailOutcome> {
    let html: string;

    try {
      const response = await this.request(url);

      if (BLOCKED_STATUSES.has(response.status)) {
        return { kind: 'blocked', reason: String(response.status) };
      }

      if (response.status === 404) {
        return { kind: 'rejected' };
      }

      if (!response.ok) {
        return { kind: 'retry-later' };
      }

      html = await response.text();
    } catch {
      // Timeouts and network errors: the job stays unknown and is retried next sync.
      return { kind: 'retry-later' };
    }

    const posting = findJobPosting(html);

    if (posting) {
      return { kind: 'job', job: this.toRawJob(id, url, posting) };
    }

    return BOT_CHALLENGE_PATTERN.test(html)
      ? { kind: 'blocked', reason: 'captcha' }
      : { kind: 'rejected' };
  }

  private toRawJob(externalId: string, url: string, posting: any): IRawAtsJob {
    const addresses = [posting.jobLocation]
      .flat()
      .map(place => place?.address)
      .filter(Boolean);
    const location = addresses
      .map(address =>
        [addressPart(address.addressLocality), addressPart(address.addressRegion)]
          .filter(Boolean)
          .join(', '),
      )
      .filter(Boolean)
      .join('; ');
    const months = posting.experienceRequirements?.monthsOfExperience;

    return {
      externalId,
      title: trimmedString(posting.title),
      companyName: trimmedString(posting.hiringOrganization?.name) || undefined,
      location,
      country: trimmedString(addresses[0]?.addressCountry) || undefined,
      sourceUrl: url,
      applyUrl: url,
      descriptionHtml: buildExcerpt(trimmedString(posting.description)),
      publishedAt: toDate(posting.datePosted),
      expiresAt: toDate(posting.validThrough),
      skills: trimmedString(posting.skills)
        .split(',')
        .map(skill => skill.trim())
        .filter(Boolean),
      monthsOfExperience: typeof months === 'number' ? months : undefined,
      salaryText: this.mapSalary(posting.baseSalary),
    };
  }

  private request(url: string): Promise<Response> {
    return fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }
}
