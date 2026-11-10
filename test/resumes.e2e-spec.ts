import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Types } from 'mongoose';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { RESUME_STORAGE_DIR } from 'src/resumes/resume-storage.util';
import { Resume } from 'src/resumes/schemas/resume.schema';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, seedWorld, UserKey, World } from './utils/fixtures';

describe('Resumes & applications (e2e)', () => {
  let t: TestApp;
  let world: World;
  let resumeA: string;
  const fileName = `${randomUUID()}.pdf`;
  const filePath = path.join(RESUME_STORAGE_DIR, fileName);
  const token = {} as Record<'hrA' | 'hrB' | 'admin' | 'c1' | 'c2', string>;
  const auth = (key: keyof typeof token) => ({ Authorization: `Bearer ${token[key]}` });

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    for (const key of ['hrA', 'hrB', 'admin', 'c1', 'c2'] as Array<keyof typeof token & UserKey>) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }

    fs.mkdirSync(RESUME_STORAGE_DIR, { recursive: true });
    fs.writeFileSync(filePath, '%PDF-1.4 e2e');

    // c2 → job A: parsed, with a private file. c1 has no application yet (used by the 409 test).
    const doc = await t.model(Resume.name).create({
      email: world.users.c2.email,
      userId: new Types.ObjectId(world.users.c2._id),
      jobId: new Types.ObjectId(world.jobA),
      companyId: new Types.ObjectId(world.companyA),
      status: EResumeStatus.PENDING,
      url: fileName,
      isParsed: true,
      parsedData: { fullName: 'c2', skills: ['NestJS'] },
      isDeleted: false,
    });
    resumeA = doc._id.toString();
  });

  afterAll(async () => {
    fs.rmSync(filePath, { force: true });
    await t?.close();
  });

  it('two concurrent applications to the same job: one 201, one 409', async () => {
    const apply = () =>
      request(t.server)
        .post('/api/v1/resumes/cv-online')
        .set(auth('c1'))
        .send({ jobId: world.jobB });

    const statuses = (await Promise.all([apply(), apply()])).map(res => res.status).sort();

    expect(statuses).toEqual([201, 409]);
  });

  it('list ignores client populate, projection and unknown operators', async () => {
    const res = await request(t.server)
      .get('/api/v1/resumes?populate=userId&fields=email&$where=1')
      .set(auth('admin'))
      .expect(200);

    const rows = res.body.data.result;
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(typeof row.userId).toBe('string');
      expect(row).toHaveProperty('status');
    }
  });

  it('reanalyze checks company scope', async () => {
    await request(t.server)
      .post(`/api/v1/resumes/${resumeA}/reanalyze`)
      .set(auth('hrB'))
      .expect(403);
    await request(t.server)
      .post(`/api/v1/resumes/${resumeA}/reanalyze`)
      .set(auth('hrA'))
      .expect(202);
  });

  it('CV file is served only to the owner and the owning company', async () => {
    const res = await request(t.server)
      .get(`/api/v1/resumes/${resumeA}/file`)
      .set(auth('c2'))
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');

    await request(t.server).get(`/api/v1/resumes/${resumeA}/file`).set(auth('c1')).expect(403);
    await request(t.server).get(`/api/v1/resumes/${resumeA}/file`).set(auth('hrB')).expect(403);
  });

  it('CV file is not reachable through the static file server', async () => {
    await request(t.server).get(`/images/resumes/${fileName}`).expect(404);
  });
});
