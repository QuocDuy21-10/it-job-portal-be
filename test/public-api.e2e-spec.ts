import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';

describe('Public API (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
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
});
