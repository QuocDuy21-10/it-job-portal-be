import 'dotenv/config';
import mongoose, { Model } from 'mongoose';
import { Resume, ResumeSchema } from 'src/resumes/schemas/resume.schema';

const LEGACY_INDEX = 'userId_1_jobId_1_isDeleted_1';
const DEDUPE_ACTOR = { email: 'system:dedupe-migration' };

export async function runApplicationUniqueIndexMigration(model: Model<Resume>) {
  const collection = model.collection;

  // Raw collection calls: the soft-delete plugin rewrites isDeleted filters on model queries.
  const { modifiedCount: backfilled } = await collection.updateMany(
    { isDeleted: { $exists: false } },
    { $set: { isDeleted: false } },
  );

  const duplicates = await collection
    .aggregate<{
      ids: mongoose.Types.ObjectId[];
    }>([
      { $match: { isDeleted: false, jobId: { $type: 'objectId' } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: { userId: '$userId', jobId: '$jobId' }, ids: { $push: '$_id' } } },
      { $match: { 'ids.1': { $exists: true } } },
    ])
    .toArray();

  // Keep the newest application of each pair (first after the sort), soft-delete the rest.
  const staleIds = duplicates.flatMap(group => group.ids.slice(1));
  let softDeleted = 0;
  if (staleIds.length > 0) {
    const result = await collection.updateMany(
      { _id: { $in: staleIds } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: DEDUPE_ACTOR } },
    );
    softDeleted = result.modifiedCount;
  }

  await model.createIndexes();

  const indexes = await collection.indexes();
  const droppedLegacyIndex = indexes.some(index => index.name === LEGACY_INDEX);
  if (droppedLegacyIndex) await collection.dropIndex(LEGACY_INDEX);

  return { backfilled, softDeleted, droppedLegacyIndex };
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const model = mongoose.model(Resume.name, ResumeSchema);
      const report = await runApplicationUniqueIndexMigration(model);
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
