import request from 'supertest';
import { ExternalJob } from 'src/job-ingestion/schemas/external-job.schema';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { seedWorld } from './utils/fixtures';

describe('Public API (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    await seedWorld(t);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('GET /health reports database and redis up', async () => {
    const res = await request(t.server).get('/api/v1/health').expect(200);

    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.info.database.status).toBe('up');
    expect(res.body.data.info.redis.status).toBe('up');
  });

  it('GET /jobs clamps limit to 100 and keeps the envelope', async () => {
    const res = await request(t.server).get('/api/v1/jobs?limit=500').expect(200);

    expect(res.body).toMatchObject({ statusCode: 200, message: expect.any(String) });
    expect(res.body.data.meta.pagination.per_page).toBe(100);
    expect(res.body.data.result).toHaveLength(2);
  });

  it('GET /companies is paginated', async () => {
    const res = await request(t.server).get('/api/v1/companies').expect(200);

    expect(res.body.data.meta.pagination).toMatchObject({ current_page: 1, total: 2 });
    expect(res.body.data.result).toHaveLength(2);
  });

  // Two keyword params arrive as an array, which used to reach .trim() and answer 500.
  it.each([
    ['a repeated keyword', '/api/v1/jobs?keyword=a&keyword=b'],
    ['a keyword over 100 characters', `/api/v1/jobs?keyword=${'a'.repeat(101)}`],
    ['a page past the limit', '/api/v1/job-search?page=201'],
  ])('rejects %s with 400', async (_case, url) => {
    await request(t.server).get(url).expect(400);
  });

  it('still lists jobs with a keyword and pagination', async () => {
    await request(t.server).get('/api/v1/jobs?keyword=backend&page=1&limit=5').expect(200);
    await request(t.server).get('/api/v1/job-search?keyword=backend&page=200').expect(200);
  });

  it('job-search merges external jobs with and without publishedAt in one stable order', async () => {
    const day = (n: number) => new Date(Date.UTC(2001, 0, n));
    const external = (title: string, dates: { publishedAt?: Date; createdAt: Date }) => ({
      title,
      sourceKey: 'e2e',
      externalId: title,
      companyName: 'MergeCo',
      location: 'Ha Noi',
      isRemote: false,
      skills: [],
      status: 'ACTIVE',
      ...dates,
    });
    await t
      .model(ExternalJob.name)
      .collection.insertMany([
        external('p1', { publishedAt: day(1), createdAt: day(9) }),
        external('c2', { createdAt: day(2) }),
        external('p3', { publishedAt: day(3), createdAt: day(1) }),
        external('c4', { createdAt: day(4) }),
        external('p5', { publishedAt: day(5), createdAt: day(1) }),
      ]);
    const page = async (n: number, sort: string) =>
      (
        await request(t.server)
          .get(`/api/v1/job-search?keyword=MergeCo&limit=2&page=${n}&sort=${sort}`)
          .expect(200)
      ).body.data;
    const titles = async (sort: string) =>
      (await Promise.all([1, 2, 3].map(n => page(n, sort)))).flatMap(data =>
        data.result.map((job: { title: string }) => job.title),
      );

    expect(await titles('newest')).toEqual(['p5', 'c4', 'p3', 'c2', 'p1']);
    expect(await titles('oldest')).toEqual(['p1', 'c2', 'p3', 'c4', 'p5']);
    expect((await page(1, 'newest')).meta.pagination).toMatchObject({ total: 5, total_pages: 3 });
  });
});
