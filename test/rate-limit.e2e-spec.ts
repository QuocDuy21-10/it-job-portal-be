import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';

describe('Rate limit (e2e)', () => {
  let t: TestApp;

  const statusesOf = async (path: string, count: number): Promise<number[]> =>
    (await Promise.all(Array.from({ length: count }, () => request(t.server).get(path)))).map(
      res => res.status,
    );
  const countOf = (statuses: number[], status: number) => statuses.filter(s => s === status).length;

  beforeAll(async () => {
    t = await createTestApp({ throttle: true });
    // Also flushes the Redis DB that stores throttler counters.
    await resetState(t.app);
    // Bind once so parallel supertest calls share one port.
    await t.app.listen(0);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('throttles an ordinary public route at the baseline burst of 20 per second', async () => {
    const statuses = await statusesOf('/api/v1/companies', 60);
    // More than the strict limit of 5 got through, so this is the baseline, not STRICT_THROTTLE.
    expect(countOf(statuses, 200)).toBeGreaterThan(5);
    expect(statuses).toContain(429);
  });

  it('keeps the strict burst of 5 per second on job-search', async () => {
    const statuses = await statusesOf('/api/v1/job-search', 15);
    expect(countOf(statuses, 200)).toBeGreaterThan(0);
    expect(countOf(statuses, 200)).toBeLessThanOrEqual(5);
    expect(statuses).toContain(429);
  });

  it('never throttles health probes', async () => {
    const statuses = await statusesOf('/api/v1/health', 30);
    expect(statuses).not.toContain(429);
  });
});
