// Phase 0 baseline: closed-loop HTTP load test against a running backend (npm run dev).
// Usage: BASE_URL=http://localhost:8081 [TOKEN=<admin jwt>] [DURATION_S=15] \
//   npx ts-node src/scripts/http-load-baseline.ts
// shortcut: closed-loop client hides coordinated omission, switch to k6 arrival-rate for capacity tests
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';
const TOKEN = process.env.TOKEN;
const DURATION_MS = Number(process.env.DURATION_S ?? 15) * 1000;
const CONCURRENCY_LEVELS = [1, 10, 25, 50];

const TARGETS: { name: string; path: string; auth?: boolean }[] = [
  { name: 'GET /jobs', path: '/api/v1/jobs?page=1&limit=10' },
  { name: 'GET /jobs?keyword', path: '/api/v1/jobs?page=1&limit=10&keyword=developer' },
  { name: 'GET /companies', path: '/api/v1/companies?page=1&limit=10' },
  { name: 'GET /companies/top-hiring', path: '/api/v1/companies/top-hiring' },
  { name: 'GET /job-search', path: '/api/v1/job-search' },
  { name: 'GET /job-search?keyword', path: '/api/v1/job-search?keyword=developer' },
  {
    name: 'GET /statistics/admin-dashboard',
    path: '/api/v1/statistics/admin-dashboard',
    auth: true,
  },
];

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function runLevel(url: string, headers: Record<string, string>, concurrency: number) {
  const latencies: number[] = [];
  const statuses: Record<string, number> = {};
  const deadline = Date.now() + DURATION_MS;
  const worker = async () => {
    while (Date.now() < deadline) {
      const t = performance.now();
      let status = 'network_error';
      try {
        const res = await fetch(url, { headers });
        await res.arrayBuffer();
        status = String(res.status);
      } catch {
        // counted as network_error
      }
      // latency only from 2xx: fast 429s from the throttler would otherwise hide real query cost
      if (status.startsWith('2')) latencies.push(performance.now() - t);
      statuses[status] = (statuses[status] ?? 0) + 1;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  latencies.sort((a, b) => a - b);
  const total = Object.values(statuses).reduce((n, c) => n + c, 0);
  const errors = total - latencies.length;
  const r = (v: number) => Math.round(v);
  return {
    concurrency,
    requests: total,
    ok: latencies.length,
    rps: Math.round((total / DURATION_MS) * 1000),
    p50: r(percentile(latencies, 50)),
    p95: r(percentile(latencies, 95)),
    p99: r(percentile(latencies, 99)),
    max: r(latencies[latencies.length - 1] ?? 0),
    errorRate: total ? Number(((errors / total) * 100).toFixed(2)) : 0,
    statuses,
  };
}

async function run() {
  const results = [];
  for (const t of TARGETS) {
    if (t.auth && !TOKEN) {
      console.log(`${t.name}: skipped (no TOKEN)`);
      continue;
    }
    const headers: Record<string, string> = t.auth ? { Authorization: `Bearer ${TOKEN}` } : {};
    for (const c of CONCURRENCY_LEVELS) {
      const level = await runLevel(BASE_URL + t.path, headers, c);
      console.log(
        `${t.name} c=${c}: p50=${level.p50} p95=${level.p95} p99=${level.p99}ms rps=${level.rps} err=${level.errorRate}%`,
      );
      results.push({ target: t.name, path: t.path, ...level });
    }
  }
  const outDir = path.join(process.cwd(), 'docs/review-code/baseline');
  fs.mkdirSync(outDir, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    durationSeconds: DURATION_MS / 1000,
    results,
  };
  fs.writeFileSync(path.join(outDir, 'http-load.json'), JSON.stringify(out, null, 2));
  console.log(`Saved ${path.join(outDir, 'http-load.json')}`);
}

if (require.main === module) {
  void run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
