import 'dotenv/config';
import mongoose from 'mongoose';

interface IndexInfo {
  key: Record<string, unknown>;
  expireAfterSeconds?: number;
  unique?: boolean;
}

// Narrow view of the raw driver collection so the migration can run against a fake in tests.
export interface SessionsCollection {
  indexes(): Promise<IndexInfo[]>;
  aggregate(pipeline: object[]): { toArray(): Promise<Array<{ n?: number }>> };
}

const onlyKey = (index: IndexInfo, field: string) => Object.keys(index.key).join() === field;

/**
 * The session schema declared expiresAt and refreshTokenHash twice (`index: true` plus a TTL/unique
 * schema.index), so Mongoose built plain indexes and silently skipped the TTL and unique ones. collMod
 * changes the existing indexes in place, without a rebuild. Idempotent. Duplicate hashes are reported,
 * not deleted: making the index unique is left until a person has looked at them.
 */
export async function runSessionIndexesMigration(
  sessions: SessionsCollection,
  runCommand: (command: object) => Promise<unknown>,
) {
  const report = { ttlAdded: false, uniqueAdded: false, duplicateHashes: 0 };
  const indexes = await sessions.indexes();

  const ttl = indexes.find(index => onlyKey(index, 'expiresAt'));
  if (ttl && ttl.expireAfterSeconds === undefined) {
    await runCommand({
      collMod: 'sessions',
      index: { keyPattern: { expiresAt: 1 }, expireAfterSeconds: 0 },
    });
    report.ttlAdded = true;
  }

  const hash = indexes.find(index => onlyKey(index, 'refreshTokenHash'));
  if (hash && !hash.unique) {
    const [duplicates] = await sessions
      .aggregate([
        { $group: { _id: '$refreshTokenHash', n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $count: 'n' },
      ])
      .toArray();
    report.duplicateHashes = duplicates?.n ?? 0;
    if (report.duplicateHashes > 0) return report;

    // MongoDB 6.0+: prepareUnique blocks new duplicates, then unique converts the index.
    const keyPattern = { refreshTokenHash: 1 };
    await runCommand({ collMod: 'sessions', index: { keyPattern, prepareUnique: true } });
    await runCommand({ collMod: 'sessions', index: { keyPattern, unique: true } });
    report.uniqueAdded = true;
  }

  return report;
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const report = await runSessionIndexesMigration(
        mongoose.connection.collection('sessions') as unknown as SessionsCollection,
        command => mongoose.connection.db!.command(command as any),
      );
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
