import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StatisticsService } from '../statistics/statistics.service';
import { StatisticsCacheService } from '../statistics/statistics-cache.service';
import { CompaniesService } from '../companies/companies.service';
import { JobsService } from '../jobs/jobs.service';
import { SkillsService } from '../skills/skills.service';
import { ChatContextService } from '../chat/chat-context.service';
import { ListCacheService } from '../redis/list-cache.service';
import { LIST_CACHE_TAGS } from '../redis/list-cache.constants';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

async function runBenchmark() {
  console.log('='.repeat(60));
  console.log('🚀 SYSTEM PERFORMANCE & CACHING BENCHMARK RUNDOWN');
  console.log('='.repeat(60));
  console.log('Initializing NestJS application context (this may take a few seconds)...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  console.log('✨ NestJS Context Initialized Successfully.');
  console.log('Fetching database references for dynamic test parameters...');

  const companyModel = app.get<Model<CompanyDocument>>(getModelToken(Company.name));
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const cacheManager = app.get<Cache>(CACHE_MANAGER);

  const statsService = app.get(StatisticsService);
  const statsCacheService = app.get(StatisticsCacheService);
  const companiesService = app.get(CompaniesService);
  const jobsService = app.get(JobsService);
  const skillsService = app.get(SkillsService);
  const chatContextService = app.get(ChatContextService);
  const listCacheService = app.get(ListCacheService);

  // Dynamic test params
  const sampleCompany = await companyModel.findOne().lean().exec();
  const companyId = sampleCompany
    ? (sampleCompany._id as any).toString()
    : new mongoose.Types.ObjectId().toString();

  const sampleUser = await userModel.findOne().lean().exec();
  const userId = sampleUser
    ? (sampleUser._id as any).toString()
    : new mongoose.Types.ObjectId().toString();

  console.log(`Using parameters:`);
  console.log(
    `- Company ID: ${companyId} (${sampleCompany ? 'Existing from DB' : 'Generated Mock'})`,
  );
  console.log(`- User ID: ${userId} (${sampleUser ? 'Existing from DB' : 'Generated Mock'})`);
  console.log('='.repeat(60));

  interface BenchmarkResult {
    endpoint: string;
    coldMs: number;
    warmMs: number;
    improvementPercent: string;
    multiplier: string;
  }

  const results: BenchmarkResult[] = [];

  const runTest = async (
    name: string,
    clearCacheFn: () => Promise<void>,
    operationFn: () => Promise<any>,
    iterations = 5,
  ) => {
    console.log(`\n🏃 Running Benchmark: [${name}] ...`);

    // --- 1. COLD RUN (Force cold cache) ---
    await clearCacheFn();
    const startCold = performance.now();
    await operationFn();
    const coldMs = performance.now() - startCold;
    console.log(`   - Cold Run: ${coldMs.toFixed(2)} ms`);

    // --- 2. WARM RUNS (Subsequent requests) ---
    const warmTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const startWarm = performance.now();
      await operationFn();
      warmTimes.push(performance.now() - startWarm);
    }
    const avgWarmMs = warmTimes.reduce((a, b) => a + b, 0) / iterations;
    console.log(`   - Warm Runs (x${iterations} Avg): ${avgWarmMs.toFixed(2)} ms`);

    const diff = coldMs - avgWarmMs;
    const improvementPercent = coldMs > 0 ? ((diff / coldMs) * 100).toFixed(2) + '%' : '0.00%';
    const multiplier = avgWarmMs > 0 ? (coldMs / avgWarmMs).toFixed(1) + 'x' : '1.0x';

    results.push({
      endpoint: name,
      coldMs: parseFloat(coldMs.toFixed(2)),
      warmMs: parseFloat(avgWarmMs.toFixed(2)),
      improvementPercent,
      multiplier,
    });
  };

  // Benchmark Definitions
  await runTest(
    'GET /api/v1/statistics/admin-dashboard',
    async () => {
      await statsCacheService.clearAdminDashboard();
    },
    async () => {
      return statsService.getAdminDashboardStats();
    },
  );

  await runTest(
    'GET /api/v1/statistics/hr-dashboard',
    async () => {
      await statsCacheService.clearHrDashboard(companyId);
    },
    async () => {
      return statsService.getHrDashboardStats(companyId);
    },
  );

  await runTest(
    'GET /api/v1/companies/top-hiring',
    async () => {
      await statsCacheService.clearTopHiringCompanies();
    },
    async () => {
      return companiesService.findTopHiringCompanies(10);
    },
  );

  await runTest(
    'GET /api/v1/skills/catalog',
    async () => {
      await (skillsService as any).invalidateCache();
    },
    async () => {
      return skillsService.getCatalog();
    },
  );

  await runTest(
    'GET /api/v1/jobs',
    async () => {
      await listCacheService.reclaimByTags([LIST_CACHE_TAGS.jobs.all]);
    },
    async () => {
      return jobsService.findAll(1, 10, '', null, '');
    },
  );

  await runTest(
    'GET /api/v1/companies',
    async () => {
      await listCacheService.reclaimByTags([LIST_CACHE_TAGS.companies.all]);
    },
    async () => {
      return companiesService.findAll(1, 10, '', null);
    },
  );

  await runTest(
    'Internal Chat Context - Platform Context (`chat_platform_ctx`)',
    async () => {
      await cacheManager.del('chat_platform_ctx');
    },
    async () => {
      return chatContextService.buildPlatformContext();
    },
  );

  await runTest(
    'Internal Chat Context - User Context (`chat_ctx:${userId}`)',
    async () => {
      await chatContextService.invalidateUserContext(userId);
    },
    async () => {
      return chatContextService.buildUserContext(userId);
    },
  );

  console.log('\n' + '='.repeat(60));
  console.log('📊 BENCHMARK COMPARATIVE REPORT');
  console.log('='.repeat(60));

  // Build Markdown report
  let mdTable = `| API Endpoint | Cold Cache (No caching) | Redis Warm Cache | Improvement Level | Speedup Multiplier |\n`;
  mdTable += `| :--- | :---: | :---: | :---: | :---: |\n`;

  results.forEach(r => {
    mdTable += `| **${r.endpoint}** | ${r.coldMs} ms | ${r.warmMs} ms | **${r.improvementPercent}** | \`${r.multiplier}\` |\n`;
  });

  console.log(mdTable);

  const reportPath = path.join(__dirname, '../../docs/PERFORMANCE_BENCHMARK_REPORT.md');
  const dirPath = path.dirname(reportPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const reportContent = `# Performance Benchmark Audit & Caching Strategy Report

Generated automatically on **${new Date().toISOString().split('T')[0]}** at **${new Date().toLocaleTimeString()}**.

This report validates the latency metrics and performance acceleration enabled by explicit **Redis Cache** layers versus raw **MongoDB database query engine execution**.

## Cached vs. Non-Cached Performance Comparison

${mdTable}

## Architectural Design Audit

- **Explicit Service Cache Pattern**: We use explicit service-level cache-management via Redis (\`cache-manager\`/\`ioredis\`) rather than arbitrary HTTP route caching interceptors. This is required because different roles (e.g., HR) require strict parameter scoping based on JWT tenant-level keys (\\\`dashboard:hr:\\\${companyId}\\\`).
- **Proactive / Selective Cache Invalidation**: Write-paths (creation, modification, deletes, bulk soft-deletes) emit explicit eviction commands targeting only the corresponding keys. E.g., when a subscriber is mutated or a new job is created, relevant dashboard caches are immediately evicted, maintaining robust eventual-consistency.
- **Aggregation Decoupling**: Large aggregate pipelines containing statistical facets require multi-second execution windows under moderate dataset load. Setting cache thresholds up to 15-minute key TTLs guarantees high platform health metrics are held in-memory, avoiding DB thread locks or CPU bottlenecks.
`;

  fs.writeFileSync(reportPath, reportContent, 'utf8');
  console.log(
    `📝 Comparative report dynamically generated and saved to: [docs/PERFORMANCE_BENCHMARK_REPORT.md](docs/PERFORMANCE_BENCHMARK_REPORT.md)`,
  );
  console.log('='.repeat(60));

  await app.close();
}

void runBenchmark().catch(err => {
  console.error('Benchmark script execution failed:', err);
  process.exit(1);
});
