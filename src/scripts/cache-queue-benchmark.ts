// Phase 4: measure cache stampede, invalidation race and queue dedup against a real Redis.
// Usage: [OUT_FILE=path.json] npx ts-node -r tsconfig-paths/register src/scripts/cache-queue-benchmark.ts
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { ListCacheService } from '../redis/list-cache.service';
import {
  JobExpirationQueueService,
  JobExpiredNotificationPayload,
} from '../queues/services/job-expiration-queue.service';

const LOADER_DELAY_MS = 200;
const BENCH_ENDPOINT = 'phase4-bench';
const QUEUE_ENQUEUE_CALLS = 5;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

async function stampede(cache: ListCacheService, keys: number, callsPerKey: number) {
  const runId = Date.now();
  const tag = `${BENCH_ENDPOINT}:${runId}`;
  let loaderCalls = 0;
  const started = Date.now();

  await Promise.all(
    Array.from({ length: keys * callsPerKey }, (_, index) =>
      cache.getOrSet({
        keyInput: {
          endpoint: BENCH_ENDPOINT,
          scope: 'bench',
          payload: { runId, key: index % keys },
        },
        ttlMs: 60_000,
        tags: [tag],
        loader: async () => {
          loaderCalls += 1;
          await sleep(LOADER_DELAY_MS);
          return { key: index % keys };
        },
      }),
    ),
  );

  const totalMs = Date.now() - started;
  await cache.reclaimByTags([tag]);
  return { keys, callsPerKey, loaderCalls, totalMs };
}

async function invalidationRace(cache: ListCacheService, redis: Redis) {
  const runId = Date.now();
  const tag = `${BENCH_ENDPOINT}:race:${runId}`;
  const keyInput = { endpoint: BENCH_ENDPOINT, scope: 'bench', payload: { runId, race: true } };

  const load = cache.getOrSet({
    keyInput,
    ttlMs: 60_000,
    tags: [tag],
    loader: async () => {
      await sleep(LOADER_DELAY_MS);
      return { stale: true };
    },
  });

  await sleep(LOADER_DELAY_MS / 2);
  await cache.reclaimByTags([tag]);
  await load;

  const cacheKey = cache.buildKey(keyInput);
  const staleEntryCached = (await redis.exists(cacheKey)) === 1;
  await redis.del(cacheKey);
  return { staleEntryCached };
}

async function queueDedup() {
  const queue = new Queue(`phase4-bench-${Date.now()}`, {
    connection: { ...connection, db: Number(process.env.REDIS_QUEUE_DB ?? 0) },
  });

  try {
    const service = new JobExpirationQueueService(queue);
    // Cast keeps the script compiling before Task 5 adds endDate to the payload type.
    const payload = {
      jobId: 'bench-job',
      jobName: 'Bench job',
      companyName: 'Bench company',
      hrEmail: 'hr@example.com',
      endDate: '2026-11-01T00:00:00.000Z',
    } as JobExpiredNotificationPayload;

    for (let call = 0; call < QUEUE_ENQUEUE_CALLS; call += 1) {
      await service.addExpiredJobNotification(payload);
    }

    const counts = await queue.getJobCounts('waiting', 'prioritized', 'delayed');
    const jobsCreated = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return { enqueueCalls: QUEUE_ENQUEUE_CALLS, jobsCreated };
  } finally {
    await queue.obliterate({ force: true });
    await queue.close();
  }
}

async function main() {
  const redis = new Redis({ ...connection, db: Number(process.env.REDIS_CACHE_DB ?? 1) });
  const cache = new ListCacheService(redis);

  try {
    const out = {
      generatedAt: new Date().toISOString(),
      loaderDelayMs: LOADER_DELAY_MS,
      stampede: [await stampede(cache, 1, 100), await stampede(cache, 10, 50)],
      invalidationRace: await invalidationRace(cache, redis),
      queueDedup: await queueDedup(),
    };

    const outFile = path.resolve(
      process.env.OUT_FILE ?? 'docs/review-code/baseline/phase-4/result.json',
    );
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    console.log(`Saved ${outFile}`);
  } finally {
    await redis.quit();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
