import { readFileSync } from 'fs';
import { join } from 'path';
import { UnrecoverableError } from 'bullmq';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { ERejectionReason } from '../enums/rejection-reason.enum';
import { TopDevAdapter } from './topdev.adapter';

const readFixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const INDEX_URL = 'https://topdev.vn/sitemap-jobs.xml';
const PAGE_1_URL = 'https://topdev.vn/sitemap/jobs_desc_en_page_1.xml';
const PAGE_2_URL = 'https://topdev.vn/sitemap/jobs_desc_en_page_2.xml';
const detailUrl = (slug: string) => `https://topdev.vn/detail-jobs/${slug}`;
const JAVA_URL = detailUrl('java-backend-developer-fpt-is-2140001');
const QA_URL = detailUrl('ky-su-kiem-thu-phan-mem-vivas-2140004');
const DATA_URL = detailUrl('data-engineer-big-data-f88-2140005');

type Route = { status: number; body?: string } | Error;

const SITEMAP_ROUTES: Record<string, Route> = {
  [INDEX_URL]: { status: 200, body: readFixture('topdev-sitemap-index.xml') },
  [PAGE_1_URL]: { status: 200, body: readFixture('topdev-sitemap-page-1.xml') },
  [PAGE_2_URL]: { status: 200, body: readFixture('topdev-sitemap-page-2.xml') },
};

const mockRoutes = (routes: Record<string, Route>) =>
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    const route = routes[url];

    if (route === undefined) {
      throw new Error(`Unexpected fetch: ${url}`);
    }

    if (route instanceof Error) {
      throw route;
    }

    return new Response(route.body ?? '', { status: route.status });
  });

const fetchedUrls = (fetchSpy: jest.SpyInstance) => fetchSpy.mock.calls.map(([url]) => String(url));

const selectAll = { selectForFetch: (ids: string[]) => ids };
const skip = (...knownIds: string[]) => ({
  selectForFetch: (ids: string[]) => ids.filter(id => !knownIds.includes(id)),
});

describe('TopDevAdapter', () => {
  const adapter = new TopDevAdapter();

  beforeEach(() => {
    jest.spyOn(TopDevAdapter.prototype as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('declares the TopDev provider', () => {
    expect(adapter.provider).toBe(EJobSourceProvider.TOPDEV);
  });

  it('lists IT-looking jobs from English sitemap pages and fetches only unknown ones', async () => {
    const fetchSpy = mockRoutes({
      ...SITEMAP_ROUTES,
      [JAVA_URL]: { status: 200, body: readFixture('topdev-detail-it.html') },
      [DATA_URL]: { status: 404 },
    });

    const result = await adapter.fetchJobs('topdev', skip('2140004'));

    expect(result.listedIds).toEqual(['2140001', '2140004', '2140005']);
    expect(fetchedUrls(fetchSpy)).toEqual([INDEX_URL, PAGE_1_URL, PAGE_2_URL, JAVA_URL, DATA_URL]);
    expect(fetchSpy).toHaveBeenCalledWith(
      JAVA_URL,
      expect.objectContaining({
        headers: { 'User-Agent': 'DevLinkBot/1.0' },
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.rejected).toEqual([
      { externalId: '2140005', reason: ERejectionReason.NOT_FOUND },
    ]);
    expect(result.stoppedEarly).toBeUndefined();
    expect(result.jobs).toEqual([
      {
        externalId: '2140001',
        title: 'Java Backend Developer',
        companyName: 'FPT IS',
        location: 'Quận Cầu Giấy, Hà Nội; Hồ Chí Minh',
        country: 'VN',
        sourceUrl: JAVA_URL,
        applyUrl: JAVA_URL,
        descriptionHtml: '<p>Build &amp; run payment services with Java.</p>',
        publishedAt: new Date('2026-10-20'),
        expiresAt: new Date('2026-11-20'),
        skills: ['Java', 'Spring Boot', 'Automation QA'],
        monthsOfExperience: 36,
        salaryText: '20.000.000 – 30.000.000 VND',
      },
    ]);
  });

  it('waits between requests', async () => {
    const sleepSpy = jest.spyOn(TopDevAdapter.prototype as any, 'sleep');
    mockRoutes({ ...SITEMAP_ROUTES, [JAVA_URL]: { status: 404 } });

    await adapter.fetchJobs('topdev', skip('2140004', '2140005'));

    expect(sleepSpy.mock.calls).toEqual([[500], [500], [1000]]);
  });

  it('fetches at most 150 detail pages per sync', async () => {
    const urls = Array.from({ length: 160 }, (_, i) => detailUrl(`java-developer-${3000000 + i}`));
    const page = `<urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
    const routes: Record<string, Route> = {
      [INDEX_URL]: {
        status: 200,
        body: `<sitemapindex><sitemap><loc>${PAGE_1_URL}</loc></sitemap></sitemapindex>`,
      },
      [PAGE_1_URL]: { status: 200, body: page },
    };
    urls.forEach(url => (routes[url] = { status: 404 }));
    const fetchSpy = mockRoutes(routes);

    const result = await adapter.fetchJobs('topdev', selectAll);

    expect(result.listedIds).toHaveLength(160);
    expect(fetchSpy).toHaveBeenCalledTimes(2 + 150);
    expect(result.rejected).toHaveLength(150);
  });

  it.each([403, 429])('stops fetching details on HTTP %i', async status => {
    const fetchSpy = mockRoutes({ ...SITEMAP_ROUTES, [JAVA_URL]: { status } });

    const result = await adapter.fetchJobs('topdev', selectAll);

    expect(result.stoppedEarly).toBe(String(status));
    expect(result.jobs).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(fetchedUrls(fetchSpy)).not.toContain(QA_URL);
  });

  it('stops on a captcha page without structured data', async () => {
    mockRoutes({
      ...SITEMAP_ROUTES,
      [JAVA_URL]: { status: 200, body: '<html><div class="g-recaptcha">captcha</div></html>' },
    });

    const result = await adapter.fetchJobs('topdev', selectAll);

    expect(result.stoppedEarly).toBe('captcha');
  });

  it('rejects pages without a JobPosting and retries server errors next time', async () => {
    mockRoutes({
      ...SITEMAP_ROUTES,
      [JAVA_URL]: { status: 200, body: '<html><body>Moved</body></html>' },
      [QA_URL]: { status: 500 },
      [DATA_URL]: new Error('timeout'),
    });

    const result = await adapter.fetchJobs('topdev', selectAll);

    expect(result.jobs).toEqual([]);
    expect(result.rejected).toEqual([
      { externalId: '2140001', reason: ERejectionReason.NO_STRUCTURED_DATA },
    ]);
    expect(result.stoppedEarly).toBeUndefined();
  });

  it('throws when a sitemap page fails so no job gets closed by mistake', async () => {
    mockRoutes({ ...SITEMAP_ROUTES, [PAGE_2_URL]: { status: 500 } });

    await expect(adapter.fetchJobs('topdev', selectAll)).rejects.toThrow('status 500');
  });

  it('throws when the sitemap index lists no job pages', async () => {
    mockRoutes({ [INDEX_URL]: { status: 200, body: '<sitemapindex></sitemapindex>' } });

    await expect(adapter.fetchJobs('topdev', selectAll)).rejects.toThrow('no job pages');
  });

  it('fetches details in the order chosen by selectForFetch', async () => {
    const fetchSpy = mockRoutes({
      ...SITEMAP_ROUTES,
      [JAVA_URL]: { status: 404 },
      [DATA_URL]: { status: 404 },
    });

    await adapter.fetchJobs('topdev', { selectForFetch: () => ['2140005', '2140001'] });

    expect(fetchedUrls(fetchSpy).slice(3)).toEqual([DATA_URL, JAVA_URL]);
  });

  it('retries an oversized detail page next time instead of rejecting it', async () => {
    mockRoutes({
      ...SITEMAP_ROUTES,
      [JAVA_URL]: { status: 200, body: 'x'.repeat(2 * 1024 * 1024 + 1) },
    });

    const result = await adapter.fetchJobs('topdev', { selectForFetch: () => ['2140001'] });

    expect(result.jobs).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('rejects an invalid board token without calling fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(adapter.fetchJobs('../evil', selectAll)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
