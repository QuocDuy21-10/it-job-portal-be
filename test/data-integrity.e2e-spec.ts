import request from 'supertest';
import { Types } from 'mongoose';
import { CvProfile } from 'src/cv-profiles/schemas/cv-profile.schema';
import { Job } from 'src/jobs/schemas/job.schema';
import { ProfileIdentitySyncService } from 'src/profile-identity/profile-identity-sync.service';
import { Resume } from 'src/resumes/schemas/resume.schema';
import { User } from 'src/users/schemas/user.schema';
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

  it('renaming a company updates the snapshot embedded in its jobs and HR users only', async () => {
    const embedded = async () => ({
      jobA: ((await t.model(Job.name).findById(world.jobA).lean()) as any).company.name,
      jobB: ((await t.model(Job.name).findById(world.jobB).lean()) as any).company.name,
      hrA: ((await t.model(User.name).findById(world.users.hrA._id).lean()) as any).company.name,
    });
    const before = await embedded();

    await request(t.server)
      .patch(`/api/v1/companies/${world.companyA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed Co' })
      .expect(200);

    expect(await embedded()).toEqual({ jobA: 'Renamed Co', jobB: before.jobB, hrA: 'Renamed Co' });
  });

  it('the avatar cleanup keeps files used by users, CV profiles and submitted applications', async () => {
    const url = (file: string) => `https://api.example.test/images/avatar/${file}`;
    const userId = new Types.ObjectId(world.users.c1._id);
    await t.model(User.name).updateOne({ _id: userId }, { avatar: url('user.jpg') });
    await t
      .model(CvProfile.name)
      .updateOne({ userId }, { $set: { 'personalInfo.avatar': url('cv.jpg') } });
    await t.model(Resume.name).create({
      userId,
      email: world.users.c1.email,
      jobId: new Types.ObjectId(world.jobB),
      cvStructuredData: { personalInfo: { avatar: url('sent.jpg') } },
    });

    const names = await t.app.get(ProfileIdentitySyncService).findReferencedAvatarFileNames();

    expect([...names]).toEqual(expect.arrayContaining(['user.jpg', 'cv.jpg', 'sent.jpg']));
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
