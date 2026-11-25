import request from 'supertest';
import { Types } from 'mongoose';
import { Job } from 'src/jobs/schemas/job.schema';
import { EJobListState } from 'src/jobs/enums/job-list-state.enum';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { User } from 'src/users/schemas/user.schema';
import { Resume } from 'src/resumes/schemas/resume.schema';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, seedWorld, World } from './utils/fixtures';

const API = '/api/v1';
const DAY_MS = 86_400_000;

describe('Admin list filters (e2e)', () => {
  let t: TestApp;
  let world: World;
  const token = {} as Record<'hrA' | 'admin' | 'c1', string>;
  type Caller = keyof typeof token;

  const get = async (caller: Caller | null, path: string, query: Record<string, string> = {}) => {
    const req = request(t.server).get(`${API}${path}`).query(query);
    return caller ? req.set({ Authorization: `Bearer ${token[caller]}` }) : req;
  };
  const total = async (caller: Caller, path: string, query: Record<string, string>) => {
    const res = await get(caller, path, query);
    expect(res.status).toBe(200);
    return res.body.data.meta.pagination.total as number;
  };
  const counts = async (caller: Caller, path: string, query: Record<string, string> = {}) => {
    const res = await get(caller, `${path}/status-counts`, query);
    expect(res.status).toBe(200);
    return res.body.data as Record<string, number>;
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    for (const key of ['hrA', 'admin', 'c1'] as const) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }

    const base: any = await t.model(Job.name).findById(world.jobA).lean();
    delete base._id;
    const past = new Date(Date.now() - DAY_MS);
    await t.model(Job.name).create([
      { ...base, name: 'Pending C++ (Qt) job', approvalStatus: 'PENDING' },
      { ...base, name: 'Rejected job', approvalStatus: 'REJECTED' },
      { ...base, name: 'Paused job', isActive: false },
      { ...base, name: 'Expired job', isActive: false, endDate: past },
      { ...base, name: 'Expired job before the cron', endDate: past },
      { ...base, name: 'Deleted job', approvalStatus: 'PENDING', isDeleted: true },
    ]);
    await t.model(Resume.name).create(
      Object.values(EResumeStatus).flatMap(status =>
        [world.companyA, world.companyB].map((companyId, i) => ({
          email: `${status.toLowerCase()}-${i}@e2e.test`,
          url: `${status}-${i}.pdf`,
          status,
          companyId: new Types.ObjectId(companyId),
          parsedData: { fullName: 'Nguyễn Văn A' },
        })),
      ),
    );
  });

  afterAll(async () => {
    await t?.close();
  });

  it.each(['admin', 'hrA'] as const)('%s: job counts equal the list totals', async caller => {
    const result = await counts(caller, '/jobs');

    for (const state of Object.values(EJobListState)) {
      expect([state, result[state]]).toEqual([state, await total(caller, '/jobs', { state })]);
    }
    expect(result.ALL).toBe(await total(caller, '/jobs', {}));
    expect(result).toMatchObject({ PENDING: 1, REJECTED: 1, PAUSED: 1, EXPIRED: 2 });
    expect(result.ACTIVE).toBe(caller === 'admin' ? 2 : 1);
  });

  it.each(['admin', 'hrA'] as const)('%s: resume counts equal the list totals', async caller => {
    const result = await counts(caller, '/resumes');

    for (const status of Object.values(EResumeStatus)) {
      expect(result[status]).toBe(caller === 'admin' ? 2 : 1);
      expect(await total(caller, '/resumes', { status })).toBe(result[status]);
    }
  });

  it('HR cannot count or search resumes of another company', async () => {
    const result = await counts('hrA', '/resumes', { companyId: world.companyB });
    expect(result.ALL).toBe(Object.values(EResumeStatus).length);
    expect(await total('hrA', '/resumes', { keyword: '-1@e2e.test' })).toBe(0);
  });

  it('admin: user counts equal the list totals', async () => {
    const result = await counts('admin', '/users');

    for (const role of ['SUPER ADMIN', 'HR', 'NORMAL USER']) {
      expect(result[role]).toBe(await total('admin', '/users', { role }));
    }
    expect(result.LOCKED).toBe(await total('admin', '/users', { isLocked: 'true' }));
  });

  // Users seeded together share createdAt; without a tie-break pages repeated some and hid others.
  it.each(['-createdAt', 'createdAt'])('pages through every user once, sort %s', async sort => {
    await t.model(User.name).updateMany({}, { createdAt: new Date() }, { timestamps: false });
    const ids: string[] = [];
    const all = await total('admin', '/users', {});
    for (let page = 1; page <= all; page++) {
      const res = await get('admin', '/users', { sort, page: String(page), limit: '1' });
      ids.push(...res.body.data.result.map((user: any) => user._id));
    }
    expect(new Set(ids).size).toBe(all);
  });

  it('searches special characters as plain text', async () => {
    expect(await total('admin', '/jobs', { keyword: 'C++ (Qt)' })).toBe(1);
    expect(await total('admin', '/jobs', { keyword: '/c++/i' })).toBe(0);
    expect(await total('admin', '/resumes', { keyword: 'nguyễn văn' })).toBe(10);
    expect(await total('admin', '/resumes', { keyword: 'Nguyen Van' })).toBe(10);
    expect(await total('admin', '/users', { keyword: 'HRA@e2e' })).toBe(1);
    expect(await total('admin', '/companies', { keyword: 'company a' })).toBe(1);
  });

  it('keeps different date ranges apart despite the cache', async () => {
    const old = new Date(Date.now() - 3650 * DAY_MS).toISOString();
    const future = new Date(Date.now() + DAY_MS).toISOString();
    expect(await total('admin', '/jobs', { 'createdAt>': future })).toBe(0);
    expect(await total('admin', '/jobs', { 'createdAt>': old })).toBeGreaterThan(0);
  });

  it('answers 400 for a bad regex filter and an unknown state', async () => {
    expect((await get('admin', '/jobs', { name: '/c++/i' })).status).toBe(400);
    expect((await get('admin', '/jobs', { state: 'DRAFT' })).status).toBe(400);
  });

  it('ignores state for guests and candidates', async () => {
    for (const caller of [null, 'c1'] as const) {
      const res = await get(caller, '/jobs', { state: 'PENDING' });
      expect(res.status).toBe(200);
      expect(res.body.data.result.map((job: any) => job.name).sort()).toEqual([
        'Backend at Company A',
        'Backend at Company B',
      ]);
    }
  });

  it('keeps counts away from callers without the role', async () => {
    expect((await get(null, '/jobs/status-counts')).status).toBe(401);
    for (const path of ['/jobs', '/resumes', '/users']) {
      expect((await get('c1', `${path}/status-counts`)).status).toBe(403);
    }
    expect((await get('hrA', '/users/status-counts')).status).toBe(403);
  });

  it('limits crawl lists by date and rejects a bad one', async () => {
    for (const path of ['/crawled-jobs', '/crawl-failures']) {
      const future = new Date(Date.now() + DAY_MS).toISOString();
      expect(await total('admin', path, { from: future })).toBe(0);
      expect((await get('admin', path, { from: 'yesterday' })).status).toBe(400);
    }
  });
});
