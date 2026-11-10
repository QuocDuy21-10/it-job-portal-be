import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';

describe('Observability (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('GET /health/live is up without checking dependencies', async () => {
    const res = await request(t.server).get('/api/v1/health/live').expect(200);

    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.info).toEqual({});
  });

  it('GET /health/ready checks database and redis', async () => {
    const res = await request(t.server).get('/api/v1/health/ready').expect(200);

    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.info.database.status).toBe('up');
    expect(res.body.data.info.redis.status).toBe('up');
  });
});
