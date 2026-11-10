import request from 'supertest';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { createJobBody, login, seedWorld, World } from './utils/fixtures';

describe('Auth (e2e)', () => {
  let t: TestApp;
  let world: World;
  let c1Token: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('login with the right password returns an access token and a refresh cookie', async () => {
    const { accessToken, refreshCookie } = await login(t.server, world.users.c1.email);
    c1Token = accessToken;

    expect(accessToken).toEqual(expect.any(String));
    expect(refreshCookie).toMatch(/^refresh_token=.+/);
  });

  it('login with a wrong password is 401', async () => {
    await request(t.server)
      .post('/api/v1/auth/login')
      .send({ email: world.users.c1.email, password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me needs a valid access token', async () => {
    await request(t.server).get('/api/v1/auth/me').expect(401);
    await request(t.server)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);

    const { accessToken } = await login(t.server, world.users.c2.email);
    const res = await request(t.server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.user.email).toBe(world.users.c2.email);
  });

  it('refresh issues a new access token, and logout revokes the refresh token', async () => {
    const { accessToken, refreshCookie } = await login(t.server, world.users.hrA.email);
    // shortcut: refresh JWT has no jti, so a token minted in the same second as login is identical; drop once jti lands.
    await new Promise(resolve => setTimeout(resolve, 1100));

    const refreshed = await request(t.server)
      .get('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    expect(refreshed.body.data.access_token).toEqual(expect.any(String));
    const rotated =
      ([].concat(refreshed.headers['set-cookie'] ?? []) as string[])
        .find(c => c.startsWith('refresh_token='))
        ?.split(';')[0] ?? refreshCookie;

    await request(t.server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', rotated)
      .expect(201);

    await request(t.server).get('/api/v1/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('a candidate cannot create a job (403)', async () => {
    // Reuses the token from the first test: each user logs in once per file (no jti, see Global Constraints).
    await request(t.server)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${c1Token}`)
      .send(createJobBody(world.companyA))
      .expect(403);
  });
});
