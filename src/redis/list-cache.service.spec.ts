import { ListCacheService } from './list-cache.service';

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  readonly calls: string[] = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async psetex(key: string, _ttlMs: number, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, String(next));
    return next;
  }

  // Emulates the epoch-guarded PSETEX script: KEYS = [epochKey, cacheKey], ARGV = [epoch, ttl, value].
  async eval(
    _script: string,
    _numKeys: number,
    epochKey: string,
    cacheKey: string,
    expectedEpoch: string,
    _ttlMs: string,
    value: string,
  ): Promise<number> {
    this.calls.push('eval');
    if ((this.values.get(epochKey) ?? '0') !== expectedEpoch) {
      return 0;
    }
    this.values.set(cacheKey, value);
    return 1;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.calls.push('sadd');
    const set = this.sets.get(key) ?? new Set<string>();
    let added = 0;

    for (const member of members) {
      if (!set.has(member)) {
        added += 1;
      }
      set.add(member);
    }

    this.sets.set(key, set);
    return added;
  }

  async pexpire(): Promise<number> {
    return 1;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async del(key: string): Promise<number> {
    const deletedValue = this.values.delete(key) ? 1 : 0;
    const deletedSet = this.sets.delete(key) ? 1 : 0;
    return deletedValue + deletedSet;
  }

  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set?.has(member)) {
      return 0;
    }

    set.delete(member);
    return 1;
  }
}

describe('ListCacheService', () => {
  let redis: FakeRedis;
  let service: ListCacheService;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new ListCacheService(redis as any);
  });

  it('builds stable keys independent of object key order', () => {
    const firstKey = service.buildKey({
      endpoint: 'jobs',
      scope: 'public',
      payload: {
        filter: { name: 'Backend', skills: { $in: ['NestJS'] } },
        page: 1,
      },
    });
    const secondKey = service.buildKey({
      endpoint: 'jobs',
      scope: 'public',
      payload: {
        page: 1,
        filter: { skills: { $in: ['NestJS'] }, name: 'Backend' },
      },
    });

    expect(firstKey).toBe(secondKey);
  });

  it('returns cached data without calling the loader', async () => {
    const keyInput = { endpoint: 'jobs', scope: 'public', payload: { page: 1 } };
    const cacheKey = service.buildKey(keyInput);
    redis.values.set(cacheKey, JSON.stringify({ result: ['cached'] }));
    const loader = jest.fn();

    const result = await service.getOrSet<{ result: Array<{ _id: string }> }>({
      keyInput,
      ttlMs: 1000,
      tags: ['tag:a'],
      loader,
    });

    expect(result).toEqual({ result: ['cached'] });
    expect(loader).not.toHaveBeenCalled();
  });

  it('stores cache misses and registers tag indexes', async () => {
    const keyInput = { endpoint: 'companies', scope: 'public', payload: { page: 1 } };
    const value = { result: [{ _id: 'company-1' }] };

    const result = await service.getOrSet<{ result: Array<{ _id: string }> }>({
      keyInput,
      ttlMs: 1000,
      tags: response => ['tag:a', `company:${response.result[0]._id}`],
      loader: jest.fn().mockResolvedValue(value),
    });

    const cacheKey = service.buildKey(keyInput);
    const indexedKeys = [...redis.sets.values()].flatMap(set => [...set]);

    expect(result).toEqual(value);
    expect(redis.values.get(cacheKey)).toBe(JSON.stringify(value));
    expect(indexedKeys).toContain(cacheKey);
  });

  it('reclaims only cache keys registered under the requested tags', async () => {
    const firstInput = { endpoint: 'jobs', scope: 'public', payload: { page: 1 } };
    const secondInput = { endpoint: 'jobs', scope: 'public', payload: { page: 2 } };

    await service.getOrSet({
      keyInput: firstInput,
      ttlMs: 1000,
      tags: ['tag:a'],
      loader: jest.fn().mockResolvedValue({ result: ['first'] }),
    });
    await service.getOrSet({
      keyInput: secondInput,
      ttlMs: 1000,
      tags: ['tag:b'],
      loader: jest.fn().mockResolvedValue({ result: ['second'] }),
    });

    await service.reclaimByTags(['tag:a']);

    expect(redis.values.has(service.buildKey(firstInput))).toBe(false);
    expect(redis.values.has(service.buildKey(secondInput))).toBe(true);
  });

  it('calls the loader once for concurrent misses on the same key', async () => {
    const keyInput = { endpoint: 'jobs', scope: 'public', payload: { page: 1 } };
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const loader = jest.fn(async () => {
      await gate;
      return { result: ['fresh'] };
    });

    const calls = Array.from({ length: 20 }, () =>
      service.getOrSet({ keyInput, ttlMs: 1000, tags: ['tag:a'], loader }),
    );
    release();
    const results = await Promise.all(calls);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(20).fill({ result: ['fresh'] }));
  });

  it('does not cache a value whose load raced with an invalidation', async () => {
    const keyInput = { endpoint: 'jobs', scope: 'public', payload: { page: 1 } };
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));

    const pending = service.getOrSet({
      keyInput,
      ttlMs: 1000,
      tags: ['tag:a'],
      loader: async () => {
        await gate;
        return { result: ['stale'] };
      },
    });

    await new Promise(resolve => setImmediate(resolve));
    await service.reclaimByTags(['tag:a']);
    release();

    await expect(pending).resolves.toEqual({ result: ['stale'] });
    expect(redis.values.has(service.buildKey(keyInput))).toBe(false);
  });

  it('indexes tags before writing the value', async () => {
    await service.getOrSet({
      keyInput: { endpoint: 'jobs', scope: 'public', payload: { page: 1 } },
      ttlMs: 1000,
      tags: ['tag:a'],
      loader: jest.fn().mockResolvedValue({ result: [] }),
    });

    expect(redis.calls.indexOf('sadd')).toBeGreaterThanOrEqual(0);
    expect(redis.calls.indexOf('sadd')).toBeLessThan(redis.calls.indexOf('eval'));
  });

  it('returns the loader value without caching when Redis reads fail', async () => {
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('redis down'));
    const loader = jest.fn().mockResolvedValue({ result: ['db'] });

    const result = await service.getOrSet({
      keyInput: { endpoint: 'jobs', scope: 'public', payload: { page: 1 } },
      ttlMs: 1000,
      tags: ['tag:a'],
      loader,
    });

    expect(result).toEqual({ result: ['db'] });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.calls).not.toContain('eval');
  });
});
