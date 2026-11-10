import request from 'supertest';
import { Types } from 'mongoose';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { Resume } from 'src/resumes/schemas/resume.schema';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { createJobBody, login, seedWorld, World } from './utils/fixtures';

describe('Tenant authorization (e2e)', () => {
  let t: TestApp;
  let world: World;
  const token = {} as Record<'hrA' | 'hrNoCompany' | 'admin', string>;
  const auth = (key: keyof typeof token) => ({ Authorization: `Bearer ${token[key]}` });

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    for (const key of ['hrA', 'hrNoCompany', 'admin'] as const) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  it('HR cannot create a job for another company', async () => {
    await request(t.server)
      .post('/api/v1/jobs')
      .set(auth('hrA'))
      .send(createJobBody(world.companyB))
      .expect(403);
  });

  it('HR can create a job for its own company', async () => {
    await request(t.server)
      .post('/api/v1/jobs')
      .set(auth('hrA'))
      .send(createJobBody(world.companyA))
      .expect(201);
  });

  it('HR cannot move its own job to another company', async () => {
    await request(t.server)
      .patch(`/api/v1/jobs/${world.jobA}`)
      .set(auth('hrA'))
      .send({ company: { _id: world.companyB } })
      .expect(403);
  });

  it('HR cannot edit a job of another company', async () => {
    await request(t.server)
      .patch(`/api/v1/jobs/${world.jobB}`)
      .set(auth('hrA'))
      .send({ salary: 2000 })
      .expect(403);
  });

  it('HR without a company is rejected (fail closed)', async () => {
    await request(t.server)
      .post('/api/v1/jobs')
      .set(auth('hrNoCompany'))
      .send(createJobBody(world.companyA))
      .expect(403);
  });

  it('SUPER ADMIN can create a job for any company', async () => {
    await request(t.server)
      .post('/api/v1/jobs')
      .set(auth('admin'))
      .send(createJobBody(world.companyB))
      .expect(201);
  });

  it('HR only sees resumes of its own company, even when filtering by another company', async () => {
    await t.model(Resume.name).create([
      {
        email: world.users.c1.email,
        userId: new Types.ObjectId(world.users.c1._id),
        jobId: new Types.ObjectId(world.jobA),
        companyId: new Types.ObjectId(world.companyA),
        status: EResumeStatus.PENDING,
        isDeleted: false,
      },
      {
        email: world.users.c2.email,
        userId: new Types.ObjectId(world.users.c2._id),
        jobId: new Types.ObjectId(world.jobB),
        companyId: new Types.ObjectId(world.companyB),
        status: EResumeStatus.PENDING,
        isDeleted: false,
      },
    ]);

    const res = await request(t.server)
      .get(`/api/v1/resumes?companyId=${world.companyB}`)
      .set(auth('hrA'))
      .expect(200);

    const companyIds = res.body.data.result.map((r: any) => r.companyId?._id ?? r.companyId);
    expect(companyIds).toEqual([world.companyA]);
  });
});
