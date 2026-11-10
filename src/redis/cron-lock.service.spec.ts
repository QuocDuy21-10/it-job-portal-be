import { CronLockService } from './cron-lock.service';
import { CRON_LOCK_KEY_PREFIX, CRON_LOCK_TTL_MS } from './redis.constants';

describe('CronLockService', () => {
  const createService = (set: jest.Mock) => new CronLockService({ set } as any);

  afterEach(() => jest.useRealTimers());

  it('runs fn when the slot lock is acquired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T03:00:00.200Z'));
    const set = jest.fn().mockResolvedValue('OK');
    const fn = jest.fn().mockResolvedValue(undefined);

    await createService(set).runExclusive('deactivate-expired-jobs', fn);

    const slot = Math.round(Date.parse('2026-11-10T03:00:00.200Z') / 60_000);
    expect(set).toHaveBeenCalledWith(
      `${CRON_LOCK_KEY_PREFIX}:deactivate-expired-jobs:${slot}`,
      expect.any(String),
      'PX',
      CRON_LOCK_TTL_MS,
      'NX',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('maps a slightly early and a late firing to the same slot', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const service = createService(set);

    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T02:59:59.990Z'));
    await service.runExclusive('job', jest.fn());
    jest.setSystemTime(new Date('2026-11-10T03:00:20.000Z'));
    await service.runExclusive('job', jest.fn());

    expect(set.mock.calls[0][0]).toBe(set.mock.calls[1][0]);
  });

  it('skips fn when another instance holds the slot', async () => {
    const fn = jest.fn();

    await createService(jest.fn().mockResolvedValue(null)).runExclusive('job', fn);

    expect(fn).not.toHaveBeenCalled();
  });

  it('skips fn when Redis is unavailable', async () => {
    const fn = jest.fn();

    await createService(jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))).runExclusive(
      'job',
      fn,
    );

    expect(fn).not.toHaveBeenCalled();
  });
});
