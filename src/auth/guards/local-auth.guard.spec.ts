import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { LocalAuthGuard } from './local-auth.guard';

const contextWithBody = (body: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  }) as unknown as ExecutionContext;

describe('LocalAuthGuard', () => {
  it('rejects object-valued credentials with 401 instead of crashing', async () => {
    const guard = new LocalAuthGuard();

    await expect(
      guard.canActivate(contextWithBody({ email: { $gt: '' }, password: { $gt: '' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
