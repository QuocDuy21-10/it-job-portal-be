import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { Banner } from 'src/site-content/schemas/banner.schema';
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
  const addBanner = async (extra: Record<string, unknown> = {}) => {
    const fileName = await upload();
    const res = await request(t.server)
      .post(BANNERS)
      .set(auth('admin'))
      .send({ name: 'Banner', fileName, ...extra })
      .expect(201);
    return { id: res.body.data._id as string, fileName };
  };
  const show = (id: string, isActive = true) =>
    request(t.server).patch(`${BANNERS}/${id}/visibility`).set(auth('admin')).send({ isActive });
  const publicSlides = async () =>
    (await request(t.server).get(`${BANNERS}/public`).expect(200)).body.data;
  const exists = (name: string) => fs.existsSync(path.join(BANNER_DIR, name));

  it.each(['hrA', 'c1'] as const)('%s gets 403 on every admin route', async key => {
    const id = '6720a1b2c3d4e5f6a7b8c9d0';
    await request(t.server).get(BANNERS).set(auth(key)).expect(403);
    await request(t.server).post(BANNERS).set(auth(key)).send({}).expect(403);
    await request(t.server).patch(`${BANNERS}/${id}/activate`).set(auth(key)).expect(403);
    await request(t.server).patch(`${BANNERS}/${id}`).set(auth(key)).send({}).expect(403);
    await request(t.server)
      .patch(`${BANNERS}/${id}/visibility`)
      .set(auth(key))
      .send({ isActive: true })
      .expect(403);
    await request(t.server).put(`${BANNERS}/order`).set(auth(key)).send({ ids: [] }).expect(403);
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

  describe('banner slides', () => {
    beforeEach(async () => {
      await t.model(Banner.name).deleteMany({});
    });

    it('shows visible slides in order, without admin fields', async () => {
      const content = {
        vi: { title: 'Tết', ctaLabel: 'Xem', ctaUrl: '/viec-lam' },
        en: { title: 'Tet', ctaLabel: 'View', ctaUrl: '/en/jobs' },
      };
      const first = await addBanner({ content });
      const second = await addBanner();
      const hidden = await addBanner();
      const future = await addBanner({
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      for (const slide of [first, second, future]) await show(slide.id).expect(200);

      await request(t.server)
        .put(`${BANNERS}/order`)
        .set(auth('admin'))
        .send({ ids: [second.id, first.id, hidden.id, future.id] })
        .expect(200);

      const slides = await publicSlides();
      expect(slides.map((slide: { id: string }) => slide.id)).toEqual([second.id, first.id]);
      expect(slides[1]).toEqual({
        id: first.id,
        imageUrl: expect.stringContaining(`/images/banner/${first.fileName}`),
        mobileImageUrl: null,
        content: {
          vi: { ...content.vi, description: null },
          en: { ...content.en, description: null },
        },
      });
      expect((await request(t.server).get(`${BANNERS}/active`).expect(200)).body.data).toEqual({
        imageUrl: expect.stringContaining(second.fileName),
      });

      const all = (await request(t.server).get(BANNERS).set(auth('admin')).expect(200)).body.data;
      expect(all.map((banner: { status: string }) => banner.status)).toEqual([
        'live',
        'live',
        'hidden',
        'scheduled',
      ]);
    });

    it('allows at most 5 slides on, through both visibility routes', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) ids.push((await addBanner()).id);
      for (const id of ids.slice(0, 5)) await show(id).expect(200);

      await show(ids[5]).expect(409);
      await request(t.server).patch(`${BANNERS}/${ids[5]}/activate`).set(auth('admin')).expect(409);

      await show(ids[0], false).expect(200);
      await request(t.server).patch(`${BANNERS}/${ids[5]}/activate`).set(auth('admin')).expect(200);

      await request(t.server).delete(`${BANNERS}/active`).set(auth('admin')).expect(200);
      expect(await publicSlides()).toEqual([]);
    });

    it('deletes a replaced image, then both files with the slide', async () => {
      const slide = await addBanner();
      const mobile = await upload();
      const replacement = await upload();

      await request(t.server)
        .patch(`${BANNERS}/${slide.id}`)
        .set(auth('admin'))
        .send({ fileName: replacement, mobileFileName: mobile })
        .expect(200);
      expect(exists(slide.fileName)).toBe(false);

      await show(slide.id).expect(200);
      await request(t.server).delete(`${BANNERS}/${slide.id}`).set(auth('admin')).expect(200);
      expect(exists(replacement)).toBe(false);
      expect(exists(mobile)).toBe(false);
    });

    it.each([
      ['text in one language only', { content: { vi: { title: 'Tết' } } }],
      [
        'a CTA label without a link',
        { content: { vi: { title: 'a', ctaLabel: 'Xem' }, en: { title: 'b' } } },
      ],
      [
        'a protocol-relative link',
        {
          content: { vi: { title: 'a', ctaLabel: 'x', ctaUrl: '//evil.com' }, en: { title: 'b' } },
        },
      ],
      [
        'an http link',
        {
          content: {
            vi: { title: 'a', ctaLabel: 'x', ctaUrl: 'http://example.com' },
            en: { title: 'b' },
          },
        },
      ],
      [
        'a title over 80 characters',
        { content: { vi: { title: 'a'.repeat(81) }, en: { title: 'b' } } },
      ],
      [
        'an end before the start',
        { startAt: '2027-02-01T00:00:00+07:00', endAt: '2027-01-01T00:00:00+07:00' },
      ],
    ])('rejects %s', async (_case, extra) => {
      const fileName = await upload();
      await request(t.server)
        .post(BANNERS)
        .set(auth('admin'))
        .send({ name: 'x', fileName, ...extra })
        .expect(400);
    });

    it('rejects an order that leaves a slide out', async () => {
      const first = await addBanner();
      await addBanner();

      await request(t.server)
        .put(`${BANNERS}/order`)
        .set(auth('admin'))
        .send({ ids: [first.id] })
        .expect(400);
    });
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
