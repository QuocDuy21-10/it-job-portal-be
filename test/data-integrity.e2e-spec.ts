import request from 'supertest';
import { Job } from 'src/jobs/schemas/job.schema';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, seedWorld, World } from './utils/fixtures';

describe('Data integrity (e2e)', () => {
  let t: TestApp;
  let world: World;
  let adminToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    adminToken = (await login(t.server, world.users.admin.email)).accessToken;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('saved jobs only list jobs the public may still see', async () => {
    const { accessToken } = await login(t.server, world.users.c1.email);
    const auth = { Authorization: `Bearer ${accessToken}` };
    await request(t.server)
      .post('/api/v1/users/save-job')
      .set(auth)
      .send({ jobId: world.jobB })
      .expect(200);

    // The job goes back to review after it was saved: it must not show up any more.
    await t
      .model(Job.name)
      .updateOne({ _id: world.jobB }, { approvalStatus: EJobApprovalStatus.PENDING });

    const res = await request(t.server).get('/api/v1/users/saved-jobs').set(auth).expect(200);
    expect(JSON.stringify(res.body.data)).not.toContain(world.jobB);
  });

  it('deleting one company also takes its jobs off the public site', async () => {
    await request(t.server).get(`/api/v1/jobs/${world.jobA}`).expect(200);

    await request(t.server)
      .delete(`/api/v1/companies/${world.companyA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const job = await t.model(Job.name).findById(world.jobA).lean();
    expect((job as any).isActive).toBe(false);
    await request(t.server).get(`/api/v1/jobs/${world.jobA}`).expect(404);
  });
});
