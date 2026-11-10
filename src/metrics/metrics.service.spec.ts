import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ALL_QUEUES, RESUME_QUEUE, ACCOUNT_DELETION_QUEUE } from 'src/queues/queues.constants';
import { MetricsService } from './metrics.service';

const counts = { waiting: 3, active: 1, delayed: 0, failed: 2 };

function build(opts: { mongoState?: number; redisStatus?: string; failingQueue?: string } = {}) {
  const queues = Object.fromEntries(
    ALL_QUEUES.map(name => [
      getQueueToken(name),
      {
        name,
        getJobCounts: jest.fn(() =>
          name === opts.failingQueue
            ? Promise.reject(new Error('redis gone'))
            : Promise.resolve(counts),
        ),
      },
    ]),
  );
  const moduleRef = { get: jest.fn((token: string) => queues[token]) };
  const connection = { readyState: opts.mongoState ?? 1 };
  const redis = { status: opts.redisStatus ?? 'ready' };
  const service = new MetricsService(moduleRef as any, connection as any, redis as any);
  service.onModuleInit();
  return service;
}

async function values(service: MetricsService, name: string) {
  return (await service.registry.getSingleMetric(name)!.get()).values;
}

describe('MetricsService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('exports default Node metrics and the HTTP histogram from its own registry', async () => {
    const text = await build().registry.metrics();

    expect(text).toContain('nodejs_eventloop_lag_p99_seconds');
    expect(text).toContain('# TYPE http_request_duration_seconds histogram');
  });

  it('reports job counts per queue and state at scrape time', async () => {
    const service = build();

    const rows = await values(service, 'bullmq_jobs');

    expect(rows).toHaveLength(ALL_QUEUES.length * 4);
    expect(rows).toContainEqual(
      expect.objectContaining({ labels: { queue: RESUME_QUEUE, state: 'waiting' }, value: 3 }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ labels: { queue: RESUME_QUEUE, state: 'failed' }, value: 2 }),
    );
  });

  it('skips a queue whose counts fail and keeps the others', async () => {
    const service = build({ failingQueue: ACCOUNT_DELETION_QUEUE });

    const rows = await values(service, 'bullmq_jobs');

    expect(rows).toHaveLength((ALL_QUEUES.length - 1) * 4);
    expect(rows.some(r => r.labels.queue === ACCOUNT_DELETION_QUEUE)).toBe(false);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(ACCOUNT_DELETION_QUEUE),
    );
  });

  it('marks dependencies up only when connected', async () => {
    expect(await values(build(), 'app_dependency_up')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labels: { dependency: 'mongodb' }, value: 1 }),
        expect.objectContaining({ labels: { dependency: 'redis' }, value: 1 }),
      ]),
    );
    expect(
      await values(build({ mongoState: 0, redisStatus: 'reconnecting' }), 'app_dependency_up'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labels: { dependency: 'mongodb' }, value: 0 }),
        expect.objectContaining({ labels: { dependency: 'redis' }, value: 0 }),
      ]),
    );
  });
});
