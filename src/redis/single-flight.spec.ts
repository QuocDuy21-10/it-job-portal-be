import { SingleFlight } from './single-flight';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('SingleFlight', () => {
  it('runs fn once for concurrent calls with the same key', async () => {
    const flight = new SingleFlight();
    const gate = deferred<string>();
    const fn = jest.fn(() => gate.promise);

    const calls = Array.from({ length: 100 }, () => flight.run('key', fn));
    gate.resolve('value');

    await expect(Promise.all(calls)).resolves.toEqual(Array(100).fill('value'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs fn separately for different keys', async () => {
    const flight = new SingleFlight();
    const fn = jest.fn(async () => 'value');

    await Promise.all([flight.run('a', fn), flight.run('b', fn)]);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects every waiter on failure and runs fn again on the next call', async () => {
    const flight = new SingleFlight();
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    const results = await Promise.allSettled([flight.run('key', fn), flight.run('key', fn)]);

    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
    await expect(flight.run('key', fn)).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('starts a new flight after clear while the old one finishes on its own', async () => {
    const flight = new SingleFlight();
    const oldGate = deferred<string>();
    const oldCall = flight.run('key', () => oldGate.promise);

    flight.clear();
    const fresh = jest.fn(async () => 'fresh');
    const newCall = flight.run('key', fresh);
    oldGate.resolve('old');

    await expect(oldCall).resolves.toBe('old');
    await expect(newCall).resolves.toBe('fresh');
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
