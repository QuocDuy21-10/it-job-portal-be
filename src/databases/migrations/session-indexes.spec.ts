import { runSessionIndexesMigration } from './session-indexes';

const plain = [
  { name: '_id_', key: { _id: 1 } },
  { name: 'expiresAt_1', key: { expiresAt: 1 } },
  { name: 'refreshTokenHash_1', key: { refreshTokenHash: 1 } },
];
const sessions = (indexes: object[], duplicates: object[] = []) => ({
  indexes: jest.fn().mockResolvedValue(indexes),
  aggregate: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(duplicates) })),
});

describe('runSessionIndexesMigration', () => {
  it('turns the plain indexes into the TTL and unique ones the schema declares', async () => {
    const runCommand = jest.fn().mockResolvedValue({ ok: 1 });

    await expect(runSessionIndexesMigration(sessions(plain), runCommand)).resolves.toEqual({
      ttlAdded: true,
      uniqueAdded: true,
      duplicateHashes: 0,
    });
    expect(runCommand.mock.calls.map(([c]) => c)).toEqual([
      { collMod: 'sessions', index: { keyPattern: { expiresAt: 1 }, expireAfterSeconds: 0 } },
      { collMod: 'sessions', index: { keyPattern: { refreshTokenHash: 1 }, prepareUnique: true } },
      { collMod: 'sessions', index: { keyPattern: { refreshTokenHash: 1 }, unique: true } },
    ]);
  });

  it('does nothing when the indexes are already right (safe to run twice)', async () => {
    const done = [
      { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { name: 'refreshTokenHash_1', key: { refreshTokenHash: 1 }, unique: true },
    ];
    const runCommand = jest.fn();

    await expect(runSessionIndexesMigration(sessions(done), runCommand)).resolves.toEqual({
      ttlAdded: false,
      uniqueAdded: false,
      duplicateHashes: 0,
    });
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('leaves refreshTokenHash non-unique and reports duplicates instead of failing midway', async () => {
    const runCommand = jest.fn().mockResolvedValue({ ok: 1 });

    const report = await runSessionIndexesMigration(sessions(plain, [{ n: 2 }]), runCommand);

    expect(report).toEqual({ ttlAdded: true, uniqueAdded: false, duplicateHashes: 2 });
    expect(runCommand).toHaveBeenCalledTimes(1);
  });
});
