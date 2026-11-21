import 'dotenv/config';
import mongoose from 'mongoose';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';

// Narrow view of the raw driver collection so the migration can run against a fake in tests.
export interface JobCollection {
  updateMany(filter: object, update: object[]): Promise<{ modifiedCount: number }>;
}

/**
 * Marks every job that is approved today as already announced to followers, so re-approving it after an
 * HR edit does not send "new job" again. Idempotent. A job that was approved, then edited back to
 * PENDING before this ran, leaves no trace of the approval and will notify once more when approved.
 */
export async function runJobFollowersNotifiedMigration(jobs: JobCollection) {
  // Raw collection: the soft-delete plugin rewrites model queries, and deleted jobs need the mark too.
  const { modifiedCount } = await jobs.updateMany(
    { approvalStatus: EJobApprovalStatus.APPROVED, followersNotifiedAt: null },
    [{ $set: { followersNotifiedAt: { $ifNull: ['$approvedAt', '$updatedAt', '$$NOW'] } } }],
  );
  return { jobsMarked: modifiedCount };
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const model = mongoose.model(Job.name, JobSchema);
      const report = await runJobFollowersNotifiedMigration(
        model.collection as unknown as JobCollection,
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
