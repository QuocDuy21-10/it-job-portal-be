import 'dotenv/config';
import mongoose from 'mongoose';
import { ISourceRejection } from 'src/job-ingestion/interfaces/job-lifecycle.interface';
import { DAY_MS, REJECTION_RETRY_DAYS } from 'src/job-ingestion/job-ingestion.constants';

// Narrow views of the raw driver collections so the migration can run against fakes in tests.
export interface SourcesCollection {
  find(
    filter: object,
    options?: object,
  ): { toArray(): Promise<Array<{ key: string; rejections?: ISourceRejection[] }>> };
}

export interface FailuresCollection {
  bulkWrite(operations: any[]): Promise<{ upsertedCount: number }>;
}

/**
 * Copies job_sources.rejections into crawl_failures. Without it the first syncs refetch every job
 * rejected before, 150 per run. Idempotent; the old array stays so the previous release can run again.
 */
export async function runCrawlFailuresMigration(
  sources: SourcesCollection,
  failures: FailuresCollection,
) {
  const report = { sources: 0, inserted: 0 };
  const rows = await sources.find({}, { projection: { key: 1, rejections: 1 } }).toArray();

  for (const { key, rejections = [] } of rows) {
    if (rejections.length === 0) continue;

    const { upsertedCount } = await failures.bulkWrite(
      rejections.map(({ externalId, reason, retryAt }) => ({
        updateOne: {
          filter: { sourceKey: key, externalId },
          update: {
            $setOnInsert: {
              reason,
              retryAt,
              failedAt: new Date(retryAt.getTime() - REJECTION_RETRY_DAYS[reason] * DAY_MS),
            },
          },
          upsert: true,
        },
      })),
    );
    report.sources++;
    report.inserted += upsertedCount;
  }

  return report;
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const report = await runCrawlFailuresMigration(
        mongoose.connection.collection('job_sources') as unknown as SourcesCollection,
        mongoose.connection.collection('crawl_failures') as unknown as FailuresCollection,
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
