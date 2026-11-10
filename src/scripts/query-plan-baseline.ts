// Phase 0 baseline: run real service read paths, capture the Mongo queries they issue
// (via mongoose debug hook) and record explain('executionStats') for each.
// Usage: npx ts-node -r tsconfig-paths/register src/scripts/query-plan-baseline.ts
import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import * as mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { CompaniesService } from '../companies/companies.service';
import { ResumesService } from '../resumes/resumes.service';
import { JobSearchService } from '../job-search/job-search.service';
import { ChatService } from '../chat/chat.service';
import { StatisticsCacheService } from '../statistics/statistics-cache.service';
import { ListCacheService } from '../redis/list-cache.service';
import { LIST_CACHE_TAGS } from '../redis/list-cache.constants';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { ChatSession, ChatSessionDocument } from '../chat/schemas/chat-session.schema';
import { ERole } from '../casl/enums/role.enum';
import { IUser } from '../users/user.interface';

interface CapturedOp {
  collection: string;
  method: string;
  args: unknown[];
}

export interface PlanSummary {
  stages: string[];
  indexes: string[];
  collScan: boolean;
  nReturned: number | null;
  totalKeysExamined: number | null;
  totalDocsExamined: number | null;
  executionTimeMillis: number | null;
}

// Walks any explain shape (find, aggregate $cursor, SBE) and collects stage/index/metrics.
export function summarizeExplain(explain: unknown): PlanSummary {
  const stages = new Set<string>();
  const indexes = new Set<string>();
  const metrics = {
    nReturned: null,
    totalKeysExamined: null,
    totalDocsExamined: null,
    executionTimeMillis: null,
  };
  const add = (key: keyof typeof metrics, v: unknown) => {
    if (typeof v === 'number') metrics[key] = (metrics[key] ?? 0) + v;
  };
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const o = node as Record<string, unknown>;
    if (typeof o.stage === 'string') stages.add(o.stage);
    if (typeof o.indexName === 'string') indexes.add(o.indexName);
    if (o.executionStats && typeof o.executionStats === 'object') {
      const s = o.executionStats as Record<string, unknown>;
      add('nReturned', s.nReturned);
      add('totalKeysExamined', s.totalKeysExamined);
      add('totalDocsExamined', s.totalDocsExamined);
      add('executionTimeMillis', s.executionTimeMillis);
    }
    // rejected/trial plans would list indexes the query does not actually use
    const skip = new Set(['executionStats', 'rejectedPlans', 'allPlansExecution']);
    Object.entries(o).forEach(([k, v]) => !skip.has(k) && walk(v));
    if (o.executionStats) walk((o.executionStats as Record<string, unknown>).executionStages);
  };
  walk(explain);
  return {
    stages: [...stages],
    indexes: [...indexes],
    collScan: stages.has('COLLSCAN'),
    ...metrics,
  };
}

interface IndexInfo {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: unknown;
}

// An index is a redundancy candidate when its key is a strict prefix of another index's key
// and it carries no extra semantics (unique/TTL/sparse/partial/text) of its own.
export function findPrefixRedundant(indexes: IndexInfo[]): { name: string; coveredBy: string }[] {
  const keyStr = (k: Record<string, unknown>) => Object.entries(k).map(([f, d]) => `${f}:${d}`);
  const out: { name: string; coveredBy: string }[] = [];
  for (const a of indexes) {
    if (
      a.name === '_id_' ||
      a.unique ||
      a.sparse ||
      a.expireAfterSeconds !== undefined ||
      a.partialFilterExpression
    )
      continue;
    const ak = keyStr(a.key);
    if (ak.some(s => s.endsWith(':text'))) continue;
    const cover = indexes.find(b => {
      const bk = keyStr(b.key);
      return b !== a && bk.length > ak.length && ak.every((s, i) => bk[i] === s);
    });
    if (cover) out.push({ name: a.name, coveredBy: cover.name });
  }
  return out;
}

async function collectIndexes(conn: Connection) {
  const collections = (await conn.db.listCollections({}, { nameOnly: true }).toArray())
    .map(c => c.name)
    .sort();
  const result = [];
  for (const name of collections) {
    const coll = conn.db.collection(name);
    const indexes = (await coll.indexes()) as IndexInfo[];
    const stats = await coll
      .aggregate([{ $indexStats: {} }])
      .toArray()
      .catch(() => []);
    const ops = Object.fromEntries(stats.map(s => [s.name, Number(s.accesses?.ops ?? 0)]));
    result.push({
      collection: name,
      documents: await coll.estimatedDocumentCount(),
      indexes: indexes.map(i => ({
        name: i.name,
        key: i.key,
        unique: !!i.unique,
        accessOps: ops[i.name] ?? null,
      })),
      prefixRedundant: findPrefixRedundant(indexes),
    });
  }
  return result;
}

async function explainOp(conn: Connection, op: CapturedOp): Promise<PlanSummary | string> {
  const coll = conn.db.collection(op.collection);
  const [first, second] = op.args as [any, any];
  if (op.method === 'find' || op.method === 'findOne') {
    const { projection, sort, skip, limit } = second ?? {};
    const cursor = coll.find(first ?? {}, {
      projection,
      sort,
      skip,
      limit: op.method === 'findOne' ? 1 : limit,
    });
    return summarizeExplain(await cursor.explain('executionStats'));
  }
  // explain as a command: cursor.explain() on aggregate rejects a URI-level writeConcern
  const explainAggregate = async (pipeline: unknown[]) =>
    summarizeExplain(
      await conn.db.command({
        explain: { aggregate: op.collection, pipeline, cursor: {} },
        verbosity: 'executionStats',
      }),
    );
  if (op.method === 'aggregate') return explainAggregate(first ?? []);
  if (op.method === 'countDocuments') {
    // countDocuments is implemented as an aggregate $match + $group
    return explainAggregate([{ $match: first ?? {} }, { $group: { _id: 1, n: { $sum: 1 } } }]);
  }
  if (op.method === 'distinct') {
    const res = await conn.db.command({
      explain: { distinct: op.collection, key: first, query: second ?? {} },
      verbosity: 'executionStats',
    });
    return summarizeExplain(res);
  }
  return `not explained (${op.method})`;
}

async function run() {
  // Lazy import: AppModule validates env at load time, which would break unit tests of the helpers above.
  const { AppModule } = await import('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const conn = app.get<Connection>(getConnectionToken());
  const listCache = app.get(ListCacheService);
  const statsCache = app.get(StatisticsCacheService);
  const jobs = app.get(JobsService);
  const companies = app.get(CompaniesService);
  const resumes = app.get(ResumesService);
  const jobSearch = app.get(JobSearchService);
  const chat = app.get(ChatService);

  const company = await app
    .get<Model<CompanyDocument>>(getModelToken(Company.name))
    .findOne()
    .lean();
  const session = await app
    .get<Model<ChatSessionDocument>>(getModelToken(ChatSession.name))
    .findOne()
    .lean();
  const hrUser = {
    _id: new mongoose.Types.ObjectId().toString(),
    role: ERole.HR,
    company: { _id: String(company?._id), name: company?.name },
  } as IUser;

  const counts: Record<string, number> = {};
  for (const name of ['jobs', 'external_jobs', 'companies', 'resumes', 'users', 'chat_messages']) {
    counts[name] = await conn.db.collection(name).estimatedDocumentCount();
  }

  const scenarios: { name: string; run: () => Promise<unknown> }[] = [
    { name: 'GET /jobs (page 1)', run: () => jobs.findAll(1, 10, '', undefined, '') },
    {
      name: 'GET /jobs?keyword=developer',
      run: () => jobs.findAll(1, 10, '', undefined, 'developer'),
    },
    { name: 'GET /jobs (page 50, deep skip)', run: () => jobs.findAll(50, 10, '', undefined, '') },
    { name: 'GET /companies (page 1)', run: () => companies.findAll(1, 10, '', undefined) },
    { name: 'GET /companies/top-hiring', run: () => companies.findTopHiringCompanies(10) },
    { name: 'GET /job-search (all, newest)', run: () => jobSearch.search({}) },
    {
      name: 'GET /job-search?keyword=developer',
      run: () => jobSearch.search({ keyword: 'developer' }),
    },
    {
      name: 'GET /job-search?source=external&keyword=java',
      run: () => jobSearch.search({ source: 'external', keyword: 'java' }),
    },
    { name: 'GET /resumes (HR company scope)', run: () => resumes.findAll(1, 10, '', hrUser) },
  ];
  if (session) {
    scenarios.push({
      name: 'GET /chat/history (latest session)',
      run: () => chat.getConversationHistory(String(session.userId)),
    });
  }

  const results = [];
  for (const s of scenarios) {
    await listCache.reclaimByTags([LIST_CACHE_TAGS.jobs.all, LIST_CACHE_TAGS.companies.all]);
    await statsCache.clearTopHiringCompanies();
    const ops: CapturedOp[] = [];
    // only reads: boot-time createIndex calls run concurrently and would pollute the capture
    const reads = new Set(['find', 'findOne', 'aggregate', 'countDocuments', 'distinct']);
    mongoose.set('debug', (collection: string, method: string, ...args: unknown[]) => {
      if (reads.has(method)) ops.push({ collection, method, args });
    });
    const started = performance.now();
    let error: string | undefined;
    try {
      await s.run();
    } catch (e) {
      error = (e as Error).message;
    }
    const serviceMs = Math.round(performance.now() - started);
    mongoose.set('debug', false);

    const queries = [];
    for (const op of ops) {
      queries.push({
        collection: op.collection,
        method: op.method,
        plan: await explainOp(conn, op).catch(e => `explain failed: ${e.message}`),
      });
    }
    results.push({ scenario: s.name, serviceMs, error, queries });
    console.log(`${s.name}: ${serviceMs}ms, ${queries.length} queries`);
  }

  const outDir = path.join(process.cwd(), 'docs/review-code/baseline');
  fs.mkdirSync(outDir, { recursive: true });
  // accessOps counts since mongod start, so they only reflect usage on this dev instance
  const indexes = await collectIndexes(conn);
  const out = {
    generatedAt: new Date().toISOString(),
    mongoVersion: (await conn.db.admin().serverInfo()).version,
    collectionCounts: counts,
    results,
    indexes,
  };
  fs.writeFileSync(path.join(outDir, 'query-plans.json'), JSON.stringify(out, null, 2));
  console.log(`Saved ${path.join(outDir, 'query-plans.json')}`);
  // BullMQ/Redis handles can keep the context alive; don't let shutdown hang the script
  await Promise.race([app.close(), new Promise(r => setTimeout(r, 5000))]);
  process.exit(0);
}

if (require.main === module) {
  void run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
