import 'dotenv/config';
import mongoose from 'mongoose';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';

// Phase 3a: prefix-redundant indexes from the Phase 0 audit plus the unused jobs text index.
// Deploy the code first, then run this; old code would recreate these indexes on boot.
export const INDEX_AUDIT_DROPS: ReadonlyArray<{ collection: string; indexName: string }> = [
  { collection: 'jobs', indexName: 'approvalStatus_1' },
  { collection: 'jobs', indexName: 'approvalStatus_1_isActive_1_isDeleted_1' },
  { collection: 'jobs', indexName: 'name_text_description_text' },
  { collection: 'ai_usage_logs', indexName: 'userId_1' },
  { collection: 'ai_usage_logs', indexName: 'sessionId_1' },
  { collection: 'ai_usage_logs', indexName: 'operationType_1' },
  { collection: 'ai_usage_logs', indexName: 'cacheHit_1' },
  { collection: 'ai_usage_logs', indexName: 'quotaConsumed_1' },
  { collection: 'chat_messages', indexName: 'sessionId_1' },
  { collection: 'chat_messages', indexName: 'userId_1' },
  { collection: 'chat_sessions', indexName: 'userId_1' },
  { collection: 'chat_tool_actions', indexName: 'userId_1' },
  { collection: 'chat_tool_actions', indexName: 'sessionId_1' },
  { collection: 'chat_quota_policies', indexName: 'roleName_1' },
  { collection: 'notifications', indexName: 'userId_1' },
  { collection: 'sessions', indexName: 'userId_1' },
];

export interface IndexAuditDb {
  collection(name: string): {
    indexes(): Promise<{ name?: string }[]>;
    dropIndex(name: string): Promise<unknown>;
  };
}

export interface IndexAuditReport {
  dropped: string[];
  missing: string[];
  created: string[];
}

const NAMESPACE_NOT_FOUND = 26;

async function listIndexNames(db: IndexAuditDb, collection: string): Promise<string[]> {
  try {
    const indexes = await db.collection(collection).indexes();
    return indexes.map(index => index.name).filter((name): name is string => !!name);
  } catch (error) {
    if ((error as { code?: number }).code === NAMESPACE_NOT_FOUND) return [];
    throw error;
  }
}

export async function runIndexAuditMigration(
  db: IndexAuditDb,
  createJobIndexes: () => Promise<unknown>,
): Promise<IndexAuditReport> {
  const report: IndexAuditReport = { dropped: [], missing: [], created: [] };

  for (const { collection, indexName } of INDEX_AUDIT_DROPS) {
    const label = `${collection}.${indexName}`;
    if ((await listIndexNames(db, collection)).includes(indexName)) {
      await db.collection(collection).dropIndex(indexName);
      report.dropped.push(label);
    } else {
      report.missing.push(label);
    }
  }

  const before = new Set(await listIndexNames(db, 'jobs'));
  await createJobIndexes();
  report.created = (await listIndexNames(db, 'jobs'))
    .filter(name => !before.has(name))
    .map(name => `jobs.${name}`);

  return report;
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const jobModel = mongoose.model(Job.name, JobSchema);
      const report = await runIndexAuditMigration(mongoose.connection.db, () =>
        jobModel.createIndexes(),
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
