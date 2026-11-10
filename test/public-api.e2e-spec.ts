import request from 'supertest';
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
});
