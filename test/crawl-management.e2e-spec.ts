import request from 'supertest';
import { ExternalJobRepository } from 'src/job-ingestion/external-job.repository';
import { CrawlFailure } from 'src/job-ingestion/schemas/crawl-failure.schema';
import { ExternalJob } from 'src/job-ingestion/schemas/external-job.schema';
import { JobSource } from 'src/job-ingestion/schemas/job-source.schema';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, seedWorld, World } from './utils/fixtures';

const API = '/api/v1';
const KEY = 'lever-e2e';

describe('Crawl management (e2e)', () => {
  let t: TestApp;
  let world: World;
  let jobId: string;
  const token = {} as Record<'hrA' | 'admin' | 'c1', string>;
  const auth = (key: keyof typeof token) => ({ Authorization: `Bearer ${token[key]}` });

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    for (const key of ['hrA', 'admin', 'c1'] as const) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }
    await t.model(JobSource.name).create({
      key: KEY,
      provider: 'LEVER',
      boardToken: 'e2e',
      companyName: 'E2E',
      enabled: false,
      displayPolicy: 'FULL',
    });
    const job = await t.model(ExternalJob.name).create({
      sourceKey: KEY,
      externalId: '1',
      sourceUrl: 'https://jobs.lever.co/e2e/1',
      title: 'Zebra Platform Engineer',
      companyName: 'E2E',
      location: 'Ho Chi Minh City',
      descriptionHtml: '<p>old</p>',
      status: 'ACTIVE',
      lastSeenAt: new Date(),
      publishedAt: new Date(),
    });
    jobId = job._id.toString();
    await t.model(CrawlFailure.name).create([
      {
        sourceKey: KEY,
        externalId: '2',
        reason: 'FETCH_ERROR',
        detail: 'timeout',
        failedAt: new Date(),
        retryAt: new Date(),
      },
      {
        sourceKey: KEY,
        externalId: '3',
        reason: 'NOT_IT',
        failedAt: new Date(),
        retryAt: new Date(Date.now() + 86_400_000),
      },
    ]);
  });

  afterAll(async () => {
    await t?.close();
  });

  const searchIds = async () =>
    (
      await request(t.server).get(`${API}/job-search?source=external&keyword=Zebra`).expect(200)
    ).body.data.result.map((item: any) => item.id);
  const states = async (state: string) =>
    (
      await request(t.server)
        .get(`${API}/crawled-jobs?sourceKey=${KEY}&state=${state}`)
        .set(auth('admin'))
        .expect(200)
    ).body.data.result.map((item: any) => item._id);

  it.each(['hrA', 'c1'] as const)('%s gets 403 on every route', async key => {
    const body = { ids: [jobId], reason: 'x' };
    await request(t.server).get(`${API}/crawled-jobs`).set(auth(key)).expect(403);
    await request(t.server)
      .post(`${API}/crawled-jobs/remove`)
      .set(auth(key))
      .send(body)
      .expect(403);
    await request(t.server)
      .post(`${API}/crawled-jobs/restore`)
      .set(auth(key))
      .send(body)
      .expect(403);
    await request(t.server).get(`${API}/crawl-failures`).set(auth(key)).expect(403);
    await request(t.server)
      .post(`${API}/crawl-failures/retry`)
      .set(auth(key))
      .send(body)
      .expect(403);
    await request(t.server).post(`${API}/job-sources`).set(auth(key)).send({}).expect(403);
    await request(t.server).delete(`${API}/job-sources/${KEY}`).set(auth(key)).expect(403);
  });

  it('a taken down job leaves search and detail, survives a sync, and can be restored', async () => {
    expect(await searchIds()).toEqual([jobId]);

    await request(t.server)
      .post(`${API}/crawled-jobs/remove`)
      .set(auth('admin'))
      .send({ ids: [jobId] })
      .expect(400);
    const res = await request(t.server)
      .post(`${API}/crawled-jobs/remove`)
      .set(auth('admin'))
      .send({ ids: [jobId], reason: 'Khiếu nại' })
      .expect(200);
    expect(res.body.data).toEqual({ modified: 1 });

    // What a sync does when the source still lists the job.
    const repository = t.app.get(ExternalJobRepository, { strict: false });
    await repository.upsertFetched(
      [
        {
          sourceKey: KEY,
          externalId: '1',
          sourceUrl: 'https://jobs.lever.co/e2e/1',
          applyUrl: 'https://jobs.lever.co/e2e/1',
          title: 'Zebra Platform Engineer',
          companyName: 'E2E',
          location: 'Ho Chi Minh City',
          isRemote: false,
          skills: [],
          descriptionHtml: '<p>new</p>',
        },
      ],
      await repository.loadKnownStates(KEY),
      new Date(),
    );

    expect(await searchIds()).toEqual([]);
    await request(t.server).get(`${API}/job-search/external/${jobId}`).expect(404);
    expect(await states('REMOVED')).toEqual([jobId]);
    expect(await states('ACTIVE')).toEqual([]);

    await request(t.server)
      .post(`${API}/crawled-jobs/restore`)
      .set(auth('admin'))
      .send({ ids: [jobId] })
      .expect(200);
    expect(await searchIds()).toEqual([jobId]);
    await request(t.server).get(`${API}/job-search/external/${jobId}`).expect(200);
  });

  it('separates errors from filtered jobs and reports both per source', async () => {
    const errors = await request(t.server)
      .get(`${API}/crawl-failures`)
      .set(auth('admin'))
      .expect(200);
    expect(errors.body.data.result.map((item: any) => item.externalId)).toEqual(['2']);
    const filtered = await request(t.server)
      .get(`${API}/crawl-failures?group=filtered`)
      .set(auth('admin'))
      .expect(200);
    const [failure] = filtered.body.data.result;
    expect(failure.externalId).toBe('3');

    await request(t.server)
      .post(`${API}/crawl-failures/retry`)
      .set(auth('admin'))
      .send({ ids: [failure._id] })
      .expect(200);
    const updated = await t.model(CrawlFailure.name).findById(failure._id).lean<any>();
    expect(updated.retryAt.getTime()).toBeLessThanOrEqual(Date.now());

    const sources = await request(t.server)
      .get(`${API}/job-sources`)
      .set(auth('admin'))
      .expect(200);
    expect(sources.body.data.find((item: any) => item.key === KEY).counts).toEqual({
      total: 1,
      active: 1,
      stale: 0,
      closed: 0,
      removed: 0,
      errors: 1,
      filtered: 1,
    });
  });

  it('rejects providers without a board and duplicate sources', async () => {
    const body = { provider: 'TOPDEV', boardToken: 'x', companyName: 'X' };
    await request(t.server).post(`${API}/job-sources`).set(auth('admin')).send(body).expect(400);
    await request(t.server)
      .post(`${API}/job-sources`)
      .set(auth('admin'))
      .send({ ...body, provider: 'LEVER', boardToken: 'e2e' })
      .expect(409);
  });

  it('deletes a disabled source, its failures and the public detail of its jobs', async () => {
    await t.model(JobSource.name).updateOne({ key: KEY }, { enabled: true });
    await request(t.server).delete(`${API}/job-sources/${KEY}`).set(auth('admin')).expect(409);
    await t.model(JobSource.name).updateOne({ key: KEY }, { enabled: false });

    const res = await request(t.server)
      .delete(`${API}/job-sources/${KEY}`)
      .set(auth('admin'))
      .expect(200);

    expect(res.body.data).toEqual({ key: KEY, closed: 1 });
    expect(await t.model(CrawlFailure.name).countDocuments({ sourceKey: KEY })).toBe(0);
    await request(t.server).get(`${API}/job-search/external/${jobId}`).expect(404);
    await request(t.server).delete(`${API}/job-sources/${KEY}`).set(auth('admin')).expect(404);
  });
});
