import { readFileSync } from 'fs';
import { join } from 'path';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';
import { ItviecAdapter } from './itviec.adapter';

const readFixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const INDEX_URL = 'https://itviec.com/dunggiatminh.xml';
const JOBS_URL = 'https://itviec.com/twinnings_jobs_desc_en.xml';
const BRIDGE_SLUG = 'bridge-system-engineer-japanesse-speaking-itviec-recruitment-consulting-0003';
const BA_SLUG = 'business-analyst-agile-sql-dosoftpro-0003';
const BRIDGE_URL = `https://itviec.com/it-jobs/${BRIDGE_SLUG}`;

const mockRoutes = (routes: Record<string, { status: number; body?: string }>) =>
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const route = routes[String(input)];

    if (!route) {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }

    return new Response(route.body ?? '', { status: route.status });
  });

const SITEMAP_ROUTES = {
  [INDEX_URL]: { status: 200, body: readFixture('itviec-sitemap-index.xml') },
  [JOBS_URL]: { status: 200, body: readFixture('itviec-sitemap-jobs.xml') },
};

describe('ItviecAdapter', () => {
  const adapter = new ItviecAdapter();

  beforeEach(() => {
    jest.spyOn(ItviecAdapter.prototype as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('declares the ITviec provider', () => {
    expect(adapter.provider).toBe(EJobSourceProvider.ITVIEC);
  });

  it('reads only the English job sitemap and keys jobs by full slug', async () => {
    const fetchSpy = mockRoutes({
      ...SITEMAP_ROUTES,
      [BRIDGE_URL]: { status: 200, body: readFixture('itviec-detail.html') },
    });

    const result = await adapter.fetchJobs('itviec', new Set([BA_SLUG]));

    // Numeric suffixes repeat across companies on ITviec, so only the slug is unique.
    expect(result.listedIds).toEqual([BRIDGE_SLUG, BA_SLUG]);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      INDEX_URL,
      JOBS_URL,
      BRIDGE_URL,
    ]);
    expect(result.stoppedEarly).toBeUndefined();
    expect(result.jobs).toEqual([
      expect.objectContaining({
        externalId: BRIDGE_SLUG,
        title: 'Bridge System Engineer Japanesse speaking',
        companyName: 'ITviec Recruitment Consulting',
        location: 'Hà Nội',
        country: 'VN',
        sourceUrl: BRIDGE_URL,
        skills: ['Business Analysis', 'C#', '.NET', 'SQL'],
        expiresAt: new Date('2026-10-30'),
        salaryText: undefined,
      }),
    ]);
  });

  it('keeps numeric salaries and drops promotional salary text', async () => {
    const detail = readFixture('itviec-detail.html').replace(
      '"value": "You\'ll love it"',
      '"minValue": 1500, "maxValue": 2500',
    );
    mockRoutes({ ...SITEMAP_ROUTES, [BRIDGE_URL]: { status: 200, body: detail } });

    const result = await adapter.fetchJobs('itviec', new Set([BA_SLUG]));

    expect(result.jobs[0].salaryText).toBe('1.500 – 2.500 USD');
  });

  it('treats a large page with only a reCAPTCHA script as rejected, not blocked', async () => {
    // Every ITviec page embeds reCAPTCHA; only a small challenge page means a block.
    const expiredPage = `<html><script src="/recaptcha_controller.js"></script>${'x'.repeat(60_000)}</html>`;
    mockRoutes({ ...SITEMAP_ROUTES, [BRIDGE_URL]: { status: 200, body: expiredPage } });

    const result = await adapter.fetchJobs('itviec', new Set([BA_SLUG]));

    expect(result.stoppedEarly).toBeUndefined();
    expect(result.rejectedIds).toEqual([BRIDGE_SLUG]);
  });
});
