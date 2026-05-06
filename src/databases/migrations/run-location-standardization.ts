import 'dotenv/config';
import mongoose, { Model, Schema } from 'mongoose';
import { Job, JobSchema } from 'src/jobs/schemas/job.schema';
import { Subscriber, SubscriberSchema } from 'src/subscribers/schemas/subscriber.schema';
import { planLocationBackfill } from 'src/utils/location-catalog';

type LocationLikeDocument = {
  _id: mongoose.Types.ObjectId | string;
  location?: string | null;
  locationCode?: string | null;
};

type MigrationReport = {
  collection: string;
  scanned: number;
  updated: number;
  unmapped: Array<{
    _id: string;
    location?: string | null;
    locationCode?: string | null;
    normalizedInput: string | null;
  }>;
};

const ensureMongoUrl = () => {
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error('Missing MONGO_URL environment variable');
  }

  return mongoUrl;
};

const getModel = <T>(name: string, schema: Schema<T>) => {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model(name, schema);
};

const migrateCollection = async <T extends LocationLikeDocument>(
  collection: string,
  model: Model<T>,
): Promise<MigrationReport> => {
  const documents = await model
    .find({}, { location: 1, locationCode: 1 })
    .lean()
    .exec();

  const bulkOperations: Array<{
    updateOne: {
      filter: { _id: T['_id'] };
      update: {
        $set: {
          location: string;
          locationCode: string;
        };
      };
    };
  }> = [];
  const unmapped: MigrationReport['unmapped'] = [];

  for (const document of documents) {
    const plan = planLocationBackfill(document.locationCode, document.location);

    if (plan.status === 'unresolved') {
      unmapped.push({
        _id: document._id.toString(),
        location: document.location ?? null,
        locationCode: document.locationCode ?? null,
        normalizedInput: plan.normalizedInput,
      });
      continue;
    }

    if (
      document.location === plan.location &&
      document.locationCode === plan.locationCode
    ) {
      continue;
    }

    bulkOperations.push({
      updateOne: {
        filter: { _id: document._id },
        update: {
          $set: {
            location: plan.location,
            locationCode: plan.locationCode,
          },
        },
      },
    });
  }

  if (bulkOperations.length > 0) {
    await model.bulkWrite(bulkOperations as any, { ordered: false });
  }

  return {
    collection,
    scanned: documents.length,
    updated: bulkOperations.length,
    unmapped,
  };
};

async function run() {
  const mongoUrl = ensureMongoUrl();
  await mongoose.connect(mongoUrl);

  try {
    const jobModel = getModel<Job>('Job', JobSchema);
    const subscriberModel = getModel<Subscriber>('Subscriber', SubscriberSchema);

    const [jobsReport, subscribersReport] = await Promise.all([
      migrateCollection('jobs', jobModel as unknown as Model<LocationLikeDocument>),
      migrateCollection(
        'subscribers',
        subscriberModel as unknown as Model<LocationLikeDocument>,
      ),
    ]);

    for (const report of [jobsReport, subscribersReport]) {
      console.log(
        `[location-standardization] ${report.collection}: scanned=${report.scanned}, updated=${report.updated}, unmapped=${report.unmapped.length}`,
      );

      if (report.unmapped.length > 0) {
        console.warn(
          `[location-standardization] ${report.collection} unmapped records:`,
          JSON.stringify(report.unmapped, null, 2),
        );
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(error => {
  console.error('[location-standardization] migration failed', error);
  process.exitCode = 1;
});
