import { StatisticsCacheService } from './statistics-cache.service';
import { CACHE_KEYS, CACHE_TTL } from './constants/statistics.constants';

const createCacheManager = () => {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
};

describe('StatisticsCacheService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loads on miss and stores with a jittered ttl', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const cacheManager = createCacheManager();
    const service = new StatisticsCacheService(cacheManager as any);
    const loader = jest.fn().mockResolvedValue({ total: 1 });

    const result = await service.getOrSetAdminDashboard(loader);

    expect(result).toEqual({ value: { total: 1 }, fromCache: false });
    expect(cacheManager.set).toHaveBeenCalledWith(
      CACHE_KEYS.ADMIN_DASHBOARD,
      { total: 1 },
      CACHE_TTL.ADMIN_DASHBOARD + Math.floor(0.5 * CACHE_TTL.ADMIN_DASHBOARD * 0.1),
    );
  });

  it('returns cached values without calling the loader', async () => {
    const cacheManager = createCacheManager();
    cacheManager.store.set(CACHE_KEYS.hrDashboard('company-1'), { total: 2 });
    const service = new StatisticsCacheService(cacheManager as any);
    const loader = jest.fn();

    const result = await service.getOrSetHrDashboard('company-1', loader);

    expect(result).toEqual({ value: { total: 2 }, fromCache: true });
    expect(loader).not.toHaveBeenCalled();
  });

  it('treats a cached empty array as a hit', async () => {
    const cacheManager = createCacheManager();
    cacheManager.store.set(CACHE_KEYS.topHiringCompanies(8), []);
    const service = new StatisticsCacheService(cacheManager as any);
    const loader = jest.fn();

    const result = await service.getOrSetTopHiringCompanies(8, loader);

    expect(result).toEqual({ value: [], fromCache: true });
    expect(loader).not.toHaveBeenCalled();
  });

  it('calls the loader once for concurrent misses', async () => {
    const cacheManager = createCacheManager();
    const service = new StatisticsCacheService(cacheManager as any);
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const loader = jest.fn(async () => {
      await gate;
      return [{ _id: 'company-1' }];
    });

    const calls = Array.from({ length: 10 }, () => service.getOrSetTopHiringCompanies(8, loader));
    release();
    await Promise.all(calls);

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
