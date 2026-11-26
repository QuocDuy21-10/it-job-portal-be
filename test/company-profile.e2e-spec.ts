import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { login, seedWorld, World } from './utils/fixtures';
import { resetState } from './utils/reset';
import { createTestApp, TestApp } from './utils/test-app';

// "RIFF" + 4 size bytes + "WEBP": enough for the upload signature check.
const WEBP = Buffer.from('524946460000000057454250', 'hex');
const COMPANY_DIR = path.join(process.cwd(), 'public', 'images', 'company');
const COMPANIES = '/api/v1/companies';

describe('Company profile fields (e2e)', () => {
  let t: TestApp;
  let world: World;
  const token = {} as Record<'hrA' | 'admin', string>;
  const auth = (key: keyof typeof token) => ({ Authorization: `Bearer ${token[key]}` });
  const uploaded: string[] = [];
  const exists = (name: string) => fs.existsSync(path.join(COMPANY_DIR, name));

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    // seedWorld: skill NestJS (alias "nest"), companies A and B, one open job each, hrA on A.
    world = await seedWorld(t);
    for (const key of ['hrA', 'admin'] as const) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }
  });

  afterAll(async () => {
    uploaded.forEach(name => fs.rmSync(path.join(COMPANY_DIR, name), { force: true }));
    await t?.close();
  });

  const uploadCover = async () => {
    const res = await request(t.server)
      .post('/api/v1/files/upload')
      .set(auth('hrA'))
      .set('X-Folder-Type', 'company')
      .attach('file', WEBP, { filename: 'cover.webp', contentType: 'image/webp' })
      .expect(201);
    uploaded.push(res.body.data.fileName);
    return res.body.data.fileName as string;
  };

  it('lets HR fill its own profile and shows it publicly', async () => {
    const coverImage = await uploadCover();

    await request(t.server)
      .patch(`${COMPANIES}/${world.companyA}`)
      .set(auth('hrA'))
      .send({
        coverImage,
        industry: 'FINTECH_BANKING',
        techStack: ['nest'],
        benefits: [{ type: 'REMOTE_HYBRID', note: '  2 ngày/tuần ' }, { type: 'HEALTH_INSURANCE' }],
      })
      .expect(200);

    const res = await request(t.server).get(`${COMPANIES}/${world.companyA}`).expect(200);
    expect(res.body.data).toMatchObject({
      coverImage,
      industry: 'FINTECH_BANKING',
      techStack: ['NestJS'],
      benefits: [
        { type: 'REMOTE_HYBRID', note: '2 ngày/tuần' },
        { type: 'HEALTH_INSURANCE', note: null },
      ],
    });
  });

  it('keeps HR out of another company', async () => {
    await request(t.server)
      .patch(`${COMPANIES}/${world.companyB}`)
      .set(auth('hrA'))
      .send({ industry: 'GAMING' })
      .expect(403);
  });

  it.each([
    ['an unknown skill', { techStack: ['cobol++'] }],
    ['a benefit chosen twice', { benefits: [{ type: 'PAID_LEAVE' }, { type: 'PAID_LEAVE' }] }],
    ['an unknown benefit', { benefits: [{ type: 'FREE_CAR' }] }],
    ['a benefit that is not an object', { benefits: [[]] }],
    ['an unknown industry', { industry: 'MINING' }],
    [
      'a cover that was never uploaded',
      { coverImage: '00000000-0000-4000-8000-000000000000.webp' },
    ],
    ['21 skills', { techStack: Array.from({ length: 21 }, (_, i) => `skill-${i}`) }],
  ])('rejects %s', async (_case, body) => {
    await request(t.server)
      .patch(`${COMPANIES}/${world.companyA}`)
      .set(auth('admin'))
      .send(body)
      .expect(400);
  });

  it('deletes the old cover file when the cover is replaced', async () => {
    const before = (await request(t.server).get(`${COMPANIES}/${world.companyA}`)).body.data
      .coverImage as string;
    const next = await uploadCover();

    await request(t.server)
      .patch(`${COMPANIES}/${world.companyA}`)
      .set(auth('admin'))
      .send({ coverImage: next })
      .expect(200);

    expect(exists(before)).toBe(false);
    expect(exists(next)).toBe(true);
  });

  it('refuses a cover another company already uses', async () => {
    const taken = (await request(t.server).get(`${COMPANIES}/${world.companyA}`)).body.data
      .coverImage as string;

    await request(t.server)
      .patch(`${COMPANIES}/${world.companyB}`)
      .set(auth('admin'))
      .send({ coverImage: taken })
      .expect(409);
  });

  it('filters the public list by industry', async () => {
    const res = await request(t.server).get(`${COMPANIES}?industry=FINTECH_BANKING`).expect(200);

    expect(res.body.data.result.map((company: { name: string }) => company.name)).toEqual([
      'Company A',
    ]);
  });

  it('returns industry and cover in the top hiring list', async () => {
    const res = await request(t.server).get(`${COMPANIES}/top-hiring`).expect(200);
    const companyA = res.body.data.find(
      (company: { _id: string }) => company._id === world.companyA,
    );

    expect(companyA).toMatchObject({ industry: 'FINTECH_BANKING', coverImage: expect.any(String) });
  });
});
