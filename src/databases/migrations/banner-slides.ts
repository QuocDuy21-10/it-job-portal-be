import 'dotenv/config';
import mongoose, { Model } from 'mongoose';
import { Banner, BannerSchema } from 'src/site-content/schemas/banner.schema';

// Allowed only one shown banner; slides allow up to five.
const LEGACY_INDEX = 'isActive_1';
const NULL_DEFAULTS = ['mobileFileName', 'content', 'startAt', 'endAt'] as const;

export async function runBannerSlidesMigration(model: Model<Banner>) {
  // Waits for Mongoose to create the collection; listing indexes of a missing one throws.
  await model.init();
  const collection = model.collection;

  const droppedLegacyIndex = (await collection.indexes()).some(
    index => index.name === LEGACY_INDEX,
  );
  if (droppedLegacyIndex) await collection.dropIndex(LEGACY_INDEX);

  // Newest first, as the admin list showed them before slides had an order.
  const unordered = await collection
    .find({ order: { $exists: false } }, { projection: { _id: 1 } })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
  const [last] = await collection
    .find({ order: { $exists: true } }, { projection: { order: 1 } })
    .sort({ order: -1 })
    .limit(1)
    .toArray();
  const start = ((last?.order as number | undefined) ?? -1) + 1;
  if (unordered.length > 0) {
    await collection.bulkWrite(
      unordered.map((doc, index) => ({
        updateOne: { filter: { _id: doc._id }, update: { $set: { order: start + index } } },
      })),
    );
  }

  for (const field of NULL_DEFAULTS) {
    await collection.updateMany({ [field]: { $exists: false } }, { $set: { [field]: null } });
  }

  await model.createIndexes();

  return { droppedLegacyIndex, backfilled: unordered.length };
}

if (require.main === module) {
  (async () => {
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

    await mongoose.connect(mongoUrl, { autoIndex: false });
    try {
      const model = mongoose.model(Banner.name, BannerSchema);
      const report = await runBannerSlidesMigration(model);
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
