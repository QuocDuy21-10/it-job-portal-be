import { withTtlJitter } from './cache-ttl.util';

describe('withTtlJitter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the base ttl when random is 0', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(withTtlJitter(60_000)).toBe(60_000);
  });

  it('stays below ttl * 1.1 when random approaches 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);
    const ttl = withTtlJitter(60_000);
    expect(ttl).toBeGreaterThanOrEqual(60_000);
    expect(ttl).toBeLessThan(66_000);
  });
});
