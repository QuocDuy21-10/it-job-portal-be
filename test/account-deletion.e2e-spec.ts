import request from 'supertest';
import { MailerService } from '@nestjs-modules/mailer';
import { User } from 'src/users/schemas/user.schema';
import { createTestApp, TestApp } from './utils/test-app';
import { resetState } from './utils/reset';
import { login, PASSWORD, seedWorld, World } from './utils/fixtures';

describe('Account deletion (e2e)', () => {
  let t: TestApp;
  let world: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t.app);
    world = await seedWorld(t);
  });

  afterAll(async () => {
    await t?.close();
  });

  it('the emailed cancel link still works after the backend restarts', async () => {
    const { accessToken } = await login(t.server, world.users.c1.email);
    await request(t.server)
      .delete('/api/v1/auth/account')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: PASSWORD })
      .expect(200);

    const sendMail = t.app.get(MailerService).sendMail as jest.Mock;
    const mail = sendMail.mock.calls.find(([m]) => m?.context?.cancelUrl)?.[0];
    const token = new URL(mail.context.cancelUrl).searchParams.get('token');

    // A deploy restarts the process; the token used to live only in that process's memory.
    await t.close();
    t = await createTestApp();

    await request(t.server)
      .post('/api/v1/auth/account/cancel-deletion-by-token')
      .send({ token })
      .expect(201);
    const user = await t.model(User.name).findById(world.users.c1._id).lean();
    expect((user as any).scheduledDeletionAt).toBeFalsy();
  });
});
