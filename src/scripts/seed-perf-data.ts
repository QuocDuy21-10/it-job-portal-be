// Phase 3: bulk synthetic data for index/query measurements on a dedicated *_perf database.
// Usage: MONGO_URL=<...>/job_portal_perf?authSource=admin \
//   npx ts-node -r tsconfig-paths/register src/scripts/seed-perf-data.ts
// Run `npm run seed` against the same database first (skills, roles, job sources).
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { JOB_SOURCES_SEED_DATA } from '../databases/seeds/data/job-sources.data';
import { SKILLS_SEED_DATA } from '../databases/seeds/data/skills.data';
import { EExternalJobStatus } from '../job-ingestion/enums/external-job-status.enum';
import { DAY_MS } from '../job-ingestion/job-ingestion.constants';
import { ExternalJob, ExternalJobSchema } from '../job-ingestion/schemas/external-job.schema';
import { EJobApprovalStatus } from '../jobs/enums/job-approval-status.enum';
import { EJobFormOfWork } from '../jobs/enums/job-form-of-work.enum';
import { EJobLevel } from '../jobs/enums/job-level.enum';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { LOCATION_CATALOG } from '../utils/location-catalog';

export type Rng = () => number;

// mulberry32: deterministic, so before/after runs measure the same data shape.
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

const pickMany = <T>(rng: Rng, items: readonly T[], count: number): T[] => {
  const picked = new Set<T>();
  while (picked.size < Math.min(count, items.length)) picked.add(pick(rng, items));
  return [...picked];
};

const TWO_YEARS_MS = 730 * DAY_MS;
const pastDate = (rng: Rng, now: Date, rangeMs: number) =>
  new Date(now.getTime() - rng() * rangeMs);
const futureDate = (rng: Rng, now: Date) => new Date(now.getTime() + (1 + rng() * 89) * DAY_MS);

const TITLES = [
  'Backend Developer',
  'Frontend Developer',
  'Fullstack Developer',
  'Mobile Developer',
  'Java Developer',
  'DevOps Engineer',
  'Data Engineer',
  'QA Engineer',
  'Business Analyst',
  'Product Manager',
];
const SKILLS = SKILLS_SEED_DATA.map(skill => skill.label);
const LEVELS = Object.values(EJobLevel);
const FORMS_OF_WORK = Object.values(EJobFormOfWork);

export const PERF_COMPANY_PREFIX = 'Perf Company ';
export const VISIBLE_JOB_RATIO = 0.6;
// A third of the visible jobs are open-ended, which is about 20% of all jobs.
const OPEN_ENDED_SHARE_OF_VISIBLE = 1 / 3;

export interface PerfCompanyRef {
  _id: Types.ObjectId;
  name: string;
  logo: string | null;
}

export interface PerfCompany extends PerfCompanyRef {
  address: string;
  description: string;
  website: null;
  numberOfEmployees: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerfJob {
  name: string;
  skills: string[];
  company: PerfCompanyRef;
  location: string;
  locationCode: string;
  salary: number;
  quantity: number;
  level: string;
  formOfWork: string;
  description: string;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  approvalStatus: EJobApprovalStatus;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerfExternalJob {
  sourceKey: string;
  externalId: string;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  companyName: string;
  location: string;
  locationCode: string;
  isRemote: boolean;
  skills: string[];
  level: EJobLevel;
  descriptionHtml: string;
  publishedAt: Date;
  expiresAt: Date | null;
  status: EExternalJobStatus;
  lastSeenAt: Date;
  lastFetchedAt: Date;
  staleSince?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function buildPerfCompany(rng: Rng, index: number, now: Date): PerfCompany {
  const createdAt = pastDate(rng, now, TWO_YEARS_MS);
  return {
    _id: new Types.ObjectId(),
    name: `${PERF_COMPANY_PREFIX}${index}`,
    address: pick(rng, LOCATION_CATALOG).label,
    description: 'Synthetic company for performance measurements.',
    website: null,
    numberOfEmployees: 10 + Math.floor(rng() * 990),
    logo: null,
    isDeleted: false,
    createdAt,
    updatedAt: createdAt,
  };
}

type HiddenBucket = 'expired' | 'unapproved' | 'inactive' | 'deleted';
const HIDDEN_BUCKETS: HiddenBucket[] = ['expired', 'unapproved', 'inactive', 'deleted'];

export function buildPerfJob(
  rng: Rng,
  index: number,
  companies: PerfCompanyRef[],
  now: Date,
): PerfJob {
  const bucket = rng() < VISIBLE_JOB_RATIO ? 'visible' : pick(rng, HIDDEN_BUCKETS);
  const createdAt = pastDate(rng, now, TWO_YEARS_MS);
  let endDate: Date | null = futureDate(rng, now);
  if (bucket === 'expired') endDate = new Date(now.getTime() - (1 + rng() * 364) * DAY_MS);
  if (bucket === 'visible' && rng() < OPEN_ENDED_SHARE_OF_VISIBLE) endDate = null;

  const company = pick(rng, companies);
  const location = pick(rng, LOCATION_CATALOG);

  return {
    name: `${pick(rng, TITLES)} #${index}`,
    skills: pickMany(rng, SKILLS, 3),
    company: { _id: company._id, name: company.name, logo: company.logo },
    location: location.label,
    locationCode: location.code,
    salary: 8_000_000 + Math.floor(rng() * 72) * 1_000_000,
    quantity: 1 + Math.floor(rng() * 5),
    level: pick(rng, LEVELS),
    formOfWork: pick(rng, FORMS_OF_WORK),
    description: 'Synthetic job for performance measurements.',
    startDate: createdAt,
    endDate,
    isActive: bucket !== 'inactive',
    approvalStatus:
      bucket === 'unapproved'
        ? pick(rng, [EJobApprovalStatus.PENDING, EJobApprovalStatus.REJECTED])
        : EJobApprovalStatus.APPROVED,
    isDeleted: bucket === 'deleted',
    ...(bucket === 'deleted' && { deletedAt: now }),
    createdAt,
    updatedAt: createdAt,
  };
}

const pickExternalStatus = (rng: Rng): EExternalJobStatus => {
  const r = rng();
  if (r < 0.85) return EExternalJobStatus.ACTIVE;
  if (r < 0.9) return EExternalJobStatus.STALE;
  return EExternalJobStatus.CLOSED;
};

export function buildPerfExternalJob(
  rng: Rng,
  index: number,
  sourceKeys: string[],
  now: Date,
): PerfExternalJob {
  const status = pickExternalStatus(rng);
  const publishedAt = pastDate(rng, now, TWO_YEARS_MS);
  const location = pick(rng, LOCATION_CATALOG);
  const url = `https://example.com/perf-jobs/${index}`;

  return {
    sourceKey: pick(rng, sourceKeys),
    externalId: `perf-${index}`,
    sourceUrl: url,
    applyUrl: url,
    title: `${pick(rng, TITLES)} #${index}`,
    companyName: `${PERF_COMPANY_PREFIX}${Math.floor(rng() * 500)}`,
    location: location.label,
    locationCode: location.code,
    isRemote: rng() < 0.1,
    skills: pickMany(rng, SKILLS, 3),
    level: pick(rng, LEVELS),
    descriptionHtml: '',
    publishedAt,
    expiresAt: rng() < 0.5 ? null : futureDate(rng, now),
    status,
    lastSeenAt: now,
    lastFetchedAt: now,
    ...(status === EExternalJobStatus.STALE && { staleSince: now }),
    ...(status === EExternalJobStatus.CLOSED && { closedAt: now }),
    createdAt: publishedAt,
    updatedAt: now,
  };
}

const BATCH_SIZE = 5_000;
const RNG_SEED = 42;

const readCount = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

async function insertInBatches<T>(
  collection: mongoose.mongo.Collection,
  total: number,
  build: (index: number) => T,
): Promise<void> {
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const docs = Array.from({ length: Math.min(BATCH_SIZE, total - start) }, (_, i) =>
      build(start + i),
    );
    await collection.insertMany(docs as mongoose.mongo.OptionalId<mongoose.mongo.Document>[], {
      ordered: false,
    });
    console.log(`${collection.collectionName}: ${start + docs.length}/${total}`);
  }
}

async function run(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed perf data with NODE_ENV=production');
  }
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) throw new Error('Missing MONGO_URL environment variable');

  await mongoose.connect(mongoUrl, { autoIndex: false });
  try {
    const db = mongoose.connection.db;
    // Bulk fake data must never land in a shared dev or production database.
    if (!db.databaseName.endsWith('_perf')) {
      throw new Error(`Database "${db.databaseName}" must end with _perf`);
    }
    const alreadySeeded = await db
      .collection('companies')
      .countDocuments({ name: { $regex: `^${PERF_COMPANY_PREFIX}` } }, { limit: 1 });
    if (alreadySeeded > 0) throw new Error('Perf data already seeded; drop the database to reseed');

    const rng = createRng(RNG_SEED);
    const now = new Date();
    const companies: PerfCompanyRef[] = [];
    const sourceKeys = JOB_SOURCES_SEED_DATA.map(source => source.key);

    await insertInBatches(db.collection('companies'), readCount('PERF_COMPANIES', 2_000), i => {
      const company = buildPerfCompany(rng, i, now);
      companies.push(company);
      return company;
    });
    await insertInBatches(db.collection('jobs'), readCount('PERF_JOBS', 50_000), i =>
      buildPerfJob(rng, i, companies, now),
    );
    await insertInBatches(
      db.collection('external_jobs'),
      readCount('PERF_EXTERNAL_JOBS', 200_000),
      i => buildPerfExternalJob(rng, i, sourceKeys, now),
    );

    // Build indexes now: autoIndex at app boot runs in the background and would race the measurements.
    for (const model of [
      mongoose.model(Company.name, CompanySchema),
      mongoose.model(Job.name, JobSchema),
      mongoose.model(ExternalJob.name, ExternalJobSchema),
    ]) {
      await model.createIndexes();
      console.log(`indexes ready: ${model.collection.collectionName}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
