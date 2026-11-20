import request from 'supertest';
import { Types } from 'mongoose';
import { ERole } from 'src/casl/enums/role.enum';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { Job } from 'src/jobs/schemas/job.schema';
import { Notification } from 'src/notifications/schemas/notification.schema';
import { ENotificationType } from 'src/notifications/enums/notification-type.enum';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, seedWorld, World } from './utils/fixtures';

// Regression tests for docs/qa-authz-test-report-2026-11-20.md.
describe('Authorization QA regressions 2026-11-20 (e2e)', () => {
  let t: TestApp;
  let world: World;
  const token = {} as Record<'hrA' | 'hrB' | 'admin' | 'c1', string>;
  const auth = (key: keyof typeof token) => ({ Authorization: `Bearer ${token[key]}` });

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    for (const key of ['hrA', 'hrB', 'admin', 'c1'] as const) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }
    await t.model(Job.name).updateOne(
      { _id: world.jobA },
      {
        createdBy: { _id: world.users.hrA._id, email: world.users.hrA.email },
        approvedBy: { _id: world.users.admin._id, email: world.users.admin.email },
      },
    );
  });

  afterAll(async () => {
    await t?.close();
  });

  it('BUG-01: public job responses hide admin/HR emails and IDs', async () => {
    const one = await request(t.server).get(`/api/v1/jobs/${world.jobA}`).expect(200);
    const list = await request(t.server).get('/api/v1/jobs?current=1&pageSize=10').expect(200);

    for (const job of [one.body.data, ...list.body.data.result]) {
      expect(job).not.toHaveProperty('createdBy');
      expect(job).not.toHaveProperty('approvedBy');
      expect(job).not.toHaveProperty('isDeleted');
    }

    const asAdmin = await request(t.server)
      .get(`/api/v1/jobs/${world.jobA}`)
      .set(auth('admin'))
      .expect(200);
    expect(asAdmin.body.data.createdBy.email).toBe(world.users.hrA.email);
  });

  it('BUG-08: HR of another company gets 404, not 400', async () => {
    await request(t.server).get(`/api/v1/jobs/${world.jobA}`).set(auth('hrB')).expect(404);
  });

  it('BUG-02: HR editing an approved job sends it back to PENDING and off the public site', async () => {
    await request(t.server)
      .patch(`/api/v1/jobs/${world.jobA}`)
      .set(auth('hrA'))
      .send({ description: 'changed after approval' })
      .expect(200);

    const asAdmin = await request(t.server)
      .get(`/api/v1/jobs/${world.jobA}`)
      .set(auth('admin'))
      .expect(200);
    expect(asAdmin.body.data.approvalStatus).toBe(EJobApprovalStatus.PENDING);
    expect(asAdmin.body.data.approvedBy).toBeNull();

    await request(t.server).get(`/api/v1/jobs/${world.jobA}`).expect(404);
  });

  it('BUG-03: a soft-deleted job can no longer be read or edited by ID', async () => {
    await request(t.server).delete(`/api/v1/jobs/${world.jobB}`).set(auth('admin')).expect(200);

    await request(t.server).get(`/api/v1/jobs/${world.jobB}`).expect(404);
    await request(t.server).get(`/api/v1/jobs/${world.jobB}`).set(auth('admin')).expect(404);
    await request(t.server)
      .patch(`/api/v1/jobs/${world.jobB}`)
      .set(auth('hrB'))
      .send({ name: 'edit deleted job' })
      .expect(404);
  });

  it('BUG-03: a soft-deleted company can no longer be read by ID', async () => {
    await request(t.server)
      .delete(`/api/v1/companies/${world.companyB}`)
      .set(auth('admin'))
      .expect(200);

    await request(t.server).get(`/api/v1/companies/${world.companyB}`).expect(404);
  });

  it("BUG-08: someone else's notification is 404 and stays unread", async () => {
    const notification = await t.model(Notification.name).create({
      userId: new Types.ObjectId(world.users.hrA._id),
      type: Object.values(ENotificationType)[0],
      title: 'QA',
      message: 'QA',
    });

    await request(t.server)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set(auth('c1'))
      .expect(404);
    await request(t.server)
      .delete(`/api/v1/notifications/${notification._id}`)
      .set(auth('c1'))
      .expect(404);

    const stored = await t.model(Notification.name).findById(notification._id).lean();
    expect(stored).toEqual(expect.objectContaining({ isRead: false, isDeleted: false }));
  });

  it('BUG-04: the access token stops working right after logout', async () => {
    const { accessToken, refreshCookie } = await login(t.server, world.users.c2.email);
    const bearer = { Authorization: `Bearer ${accessToken}` };
    await request(t.server).get('/api/v1/auth/me').set(bearer).expect(200);

    await request(t.server)
      .post('/api/v1/auth/logout')
      .set(bearer)
      .set('Cookie', refreshCookie)
      .expect(201);

    await request(t.server).get('/api/v1/auth/me').set(bearer).expect(401);
  });

  it('BUG-07: lock then unlock does not revive an access token issued before the lock', async () => {
    const { accessToken } = await login(t.server, world.users.hrB.email);
    const bearer = { Authorization: `Bearer ${accessToken}` };

    await request(t.server)
      .patch(`/api/v1/users/${world.users.hrB._id}/lock`)
      .set(auth('admin'))
      .send({ reason: 'qa' })
      .expect(200);
    await request(t.server)
      .patch(`/api/v1/users/${world.users.hrB._id}/unlock`)
      .set(auth('admin'))
      .expect(200);

    await request(t.server).get('/api/v1/auth/me').set(bearer).expect(401);
  });

  it('R-7: an admin cannot change their own role', async () => {
    await request(t.server)
      .patch(`/api/v1/users/${world.users.admin._id}`)
      .set(auth('admin'))
      .send({ name: 'Admin', email: world.users.admin.email, role: ERole.NORMAL_USER })
      .expect(400);
  });
});
