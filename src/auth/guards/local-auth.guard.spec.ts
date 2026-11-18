import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { LocalAuthGuard } from './local-auth.guard';

const contextWithBody = (body: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  }) as unknown as ExecutionContext;

const rejectionOf = (body: unknown) =>
  new LocalAuthGuard().canActivate(contextWithBody(body)).catch(error => error);

describe('LocalAuthGuard', () => {
  it('rejects object-valued credentials with 400 instead of crashing', async () => {
    const error = await rejectionOf({ email: { $gt: '' }, password: { $gt: '' } });

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('never echoes submitted values (such as the password) in the validation error', async () => {
    const error = await rejectionOf({ email: 'not-an-email', password: 'Secret#123' });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(error.getResponse())).not.toContain('Secret#123');
  });

  it.each(['{"email":"a@b.co","password":"Secret#123"', null, ['a']])(
    'rejects a non-object body %p without echoing it',
    async body => {
      const error = await rejectionOf(body);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify(error.getResponse())).not.toContain('Secret#123');
    },
  );
});
