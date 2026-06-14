import { ListCacheService } from './list-cache.service';

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async psetex(key: string, _ttlMs: number, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return 'OK';
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
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
});
