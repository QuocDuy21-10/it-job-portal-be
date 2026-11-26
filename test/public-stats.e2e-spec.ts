import request from 'supertest';
import { ERole } from 'src/casl/enums/role.enum';
import { ExternalJob } from 'src/job-ingestion/schemas/external-job.schema';
import { JobSource } from 'src/job-ingestion/schemas/job-source.schema';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { Job } from 'src/jobs/schemas/job.schema';
import { User } from 'src/users/schemas/user.schema';
import { seedWorld } from './utils/fixtures';
import { resetState } from './utils/reset';
import { createTestApp, TestApp } from './utils/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Public stats (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    // seedWorld: 2 visible jobs created now (companies A and B), candidates c1 and c2.
    const world = await seedWorld(t);
    const now = Date.now();

    const jobFields: any = { ...(await t.model(Job.name).findById(world.jobA).lean()) };
    delete jobFields._id;
    delete jobFields.createdAt;
    delete jobFields.updatedAt;
    // The raw collection keeps the createdAt we set (create() would stamp it with now).
    await t.model(Job.name).collection.insertMany([
      { ...jobFields, name: 'Old but open', createdAt: new Date(now - 10 * DAY_MS) },
      { ...jobFields, name: 'Expired', endDate: new Date(now - DAY_MS), createdAt: new Date(now) },
      {
        ...jobFields,
        name: 'Pending',
        approvalStatus: EJobApprovalStatus.PENDING,
        createdAt: new Date(now),
      },
    ]);

    await t.model(JobSource.name).create({
      key: 'hidden-src',
      provider: 'LEVER',
      boardToken: 'hidden',
      companyName: 'Hidden Co',
      displayPolicy: 'HIDDEN',
    });
    const external = (title: string, fields: Record<string, unknown> = {}) => ({
      title,
      sourceKey: 'visible-src',
      externalId: title,
      sourceUrl: `https://example.com/${title}`,
      companyName: 'ExtCo',
      location: 'Ha Noi',
      isRemote: false,
      skills: [],
      descriptionHtml: '',
      status: 'ACTIVE',
      lastSeenAt: new Date(now),
      createdAt: new Date(now),
      ...fields,
    });
    await t
      .model(ExternalJob.name)
      .collection.insertMany([
        external('new', { publishedAt: new Date(now - DAY_MS) }),
        external('published-long-ago', { publishedAt: new Date(now - 10 * DAY_MS) }),
        external('closed', { status: 'CLOSED' }),
        external('hidden', { sourceKey: 'hidden-src' }),
      ]);

    await t.model(User.name).collection.insertOne({
      name: 'gone',
      email: 'gone@e2e.test',
      role: ERole.NORMAL_USER,
      isActive: true,
      isDeleted: true,
    });
  });

  afterAll(async () => {
    await t?.close();
  });

  it('answers without a token with the counts the public can see', async () => {
    const res = await request(t.server).get('/api/v1/statistics/public').expect(200);

    // Jobs: 2 seeded + "Old but open" + external "new" and "published-long-ago".
    // New this week: 2 seeded + external "new". Companies: A and B. Candidates: c1 and c2.
    expect(res.body.data).toEqual({
      activeJobs: 5,
      newJobsThisWeek: 3,
      hiringCompanies: 2,
      candidates: 2,
    });
  });

  it('counts the same active jobs as the public job list', async () => {
    const res = await request(t.server).get('/api/v1/job-search?limit=1').expect(200);

    expect(res.body.data.meta.pagination.total).toBe(5);
  });
});
