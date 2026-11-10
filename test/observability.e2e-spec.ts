import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';

const metricsUrl = () => `http://127.0.0.1:${process.env.METRICS_PORT}/metrics`;

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

  it('serves Prometheus metrics on METRICS_PORT with route-pattern labels', async () => {
    await request(t.server).get('/api/v1/jobs').expect(200);
    await request(t.server).get('/api/v1/does-not-exist').expect(404);
    await request(t.server).get('/api/v1/health/live').expect(200);

    const res = await fetch(metricsUrl());
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(text).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/jobs"[^}]*\} [1-9]/,
    );
    expect(text).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="unmatched"[^}]*status_code="404"[^}]*\}/,
    );
    expect(text).not.toContain('route="/api/v1/health');
    expect(text).toMatch(/bullmq_jobs\{[^}]*queue="resume-processing"/);
    expect(text).toContain('app_dependency_up{dependency="mongodb"} 1');
    expect(text).toContain('app_dependency_up{dependency="redis"} 1');
  });

  it('answers 404 for any other path on the metrics port', async () => {
    const res = await fetch(metricsUrl().replace('/metrics', '/other'));
    expect(res.status).toBe(404);
  });

  it('does not expose metrics on the public API port', async () => {
    await request(t.server).get('/api/v1/metrics').expect(404);
  });
});
