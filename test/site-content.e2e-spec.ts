import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, seedWorld, World } from './utils/fixtures';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const BANNER_DIR = path.join(process.cwd(), 'public', 'images', 'banner');
const LEGAL = '/api/v1/site-content/legal/terms/vi';
const BANNERS = '/api/v1/site-content/banners';
const BODY = {
  title: 'Điều khoản',
  description: 'Mô tả',
  contentHtml: '<p>Nội dung</p>',
  isPublished: false,
};

describe('Site content (e2e)', () => {
  let t: TestApp;
  let world: World;
  const token = {} as Record<'hrA' | 'admin' | 'c1', string>;
  const auth = (key: keyof typeof token) => ({ Authorization: `Bearer ${token[key]}` });
  const uploaded: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
    for (const key of ['hrA', 'admin', 'c1'] as const) {
      token[key] = (await login(t.server, world.users[key].email)).accessToken;
    }
  });

  afterAll(async () => {
    uploaded.forEach(name => fs.rmSync(path.join(BANNER_DIR, name), { force: true }));
    await t?.close();
  });

  const upload = async () => {
    const res = await request(t.server)
      .post('/api/v1/files/upload')
      .set(auth('admin'))
      .set('X-Folder-Type', 'banner')
      .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })
      .expect(201);
    uploaded.push(res.body.data.fileName);
    return res.body.data.fileName as string;
  };
  const addBanner = async () => {
    const fileName = await upload();
    const res = await request(t.server)
      .post(BANNERS)
      .set(auth('admin'))
      .send({ name: 'Banner', fileName })
      .expect(201);
    return { id: res.body.data._id as string, fileName };
  };
  const active = async () =>
    (await request(t.server).get(`${BANNERS}/active`).expect(200)).body.data;

  it.each(['hrA', 'c1'] as const)('%s gets 403 on every admin route', async key => {
    const id = '6720a1b2c3d4e5f6a7b8c9d0';
    await request(t.server).get(BANNERS).set(auth(key)).expect(403);
    await request(t.server).post(BANNERS).set(auth(key)).send({}).expect(403);
    await request(t.server).patch(`${BANNERS}/${id}/activate`).set(auth(key)).expect(403);
    await request(t.server).delete(`${BANNERS}/active`).set(auth(key)).expect(403);
    await request(t.server).delete(`${BANNERS}/${id}`).set(auth(key)).expect(403);
    await request(t.server).put(LEGAL).set(auth(key)).send(BODY).expect(403);
    await request(t.server)
      .post('/api/v1/files/upload')
      .set(auth(key))
      .set('X-Folder-Type', 'banner')
      .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' })
      .expect(403);
  });

  it('shows one banner at a time and protects the shown one', async () => {
    expect(await active()).toBeNull();
    const first = await addBanner();
    const second = await addBanner();

    await request(t.server).patch(`${BANNERS}/${first.id}/activate`).set(auth('admin')).expect(200);
    await request(t.server)
      .patch(`${BANNERS}/${second.id}/activate`)
      .set(auth('admin'))
      .expect(200);

    expect((await active()).imageUrl).toContain(`/images/banner/${second.fileName}`);
    await request(t.server).delete(`${BANNERS}/${second.id}`).set(auth('admin')).expect(409);
    await request(t.server).delete(`${BANNERS}/${first.id}`).set(auth('admin')).expect(200);
    expect(fs.existsSync(path.join(BANNER_DIR, first.fileName))).toBe(false);

    await request(t.server).delete(`${BANNERS}/active`).set(auth('admin')).expect(200);
    expect(await active()).toBeNull();
  });

  it('rejects a banner whose file was not uploaded', async () => {
    await request(t.server)
      .post(BANNERS)
      .set(auth('admin'))
      .send({ name: 'x', fileName: '00000000-0000-4000-8000-000000000000.png' })
      .expect(400);
  });

  it('legal page: 404 until written, then public without the editor', async () => {
    await request(t.server).get(LEGAL).expect(404);
    await request(t.server).put(LEGAL).set(auth('admin')).send(BODY).expect(200);

    const res = await request(t.server).get(LEGAL).expect(200);
    expect(res.body.data).toMatchObject({ page: 'terms', locale: 'vi', ...BODY });
    expect(res.body.data.updatedBy).toBeUndefined();

    await request(t.server)
      .put(LEGAL)
      .set(auth('admin'))
      .send({ ...BODY, isPublished: true })
      .expect(200);
    expect((await request(t.server).get(LEGAL)).body.data.isPublished).toBe(true);
  });

  it.each(['/api/v1/site-content/legal/cookies/vi', '/api/v1/site-content/legal/terms/fr'])(
    'rejects %s with 400',
    async url => {
      await request(t.server).get(url).expect(400);
    },
  );
});
