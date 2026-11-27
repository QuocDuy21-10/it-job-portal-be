import request from 'supertest';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { Job } from 'src/jobs/schemas/job.schema';
import { seedWorld, World } from './utils/fixtures';
import { resetState } from './utils/reset';
import { createTestApp, TestApp } from './utils/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Company job counts (e2e)', () => {
  let t: TestApp;
  let world: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    // seedWorld: companies A and B, one approved open job each.
    world = await seedWorld(t);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('counts only jobs a candidate can apply to', async () => {
    const jobA = await t.model(Job.name).findById(world.jobA).lean();
    // A copy of the open job, without its identity, so only status and dates differ.
    const base = { ...(jobA as Record<string, unknown>) };
    delete base._id;
    delete base.__v;
    await t.model(Job.name).create([
      { ...base, name: 'Pending job', approvalStatus: EJobApprovalStatus.PENDING },
      {
        ...base,
        name: 'Expired job',
        startDate: new Date(Date.now() - 10 * DAY_MS),
        endDate: new Date(Date.now() - DAY_MS),
      },
    ]);

    const res = await request(t.server).get('/api/v1/companies').query({ limit: 50 }).expect(200);
    const companyA = res.body.data.result.find((c: { _id: string }) => c._id === world.companyA);

    expect(companyA.totalJobs).toBe(1);
  });
});
