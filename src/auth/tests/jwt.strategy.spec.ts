import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from '../passport/jwt.strategy';
import { User } from 'src/users/schemas/user.schema';
import { makeUser } from '../testing/auth-test-data';
import { SessionsService } from 'src/sessions/sessions.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userModel: {
    findById: jest.Mock;
  };
  let sessionsService: { isSessionActive: jest.Mock };

  beforeEach(async () => {
    userModel = {
      findById: jest.fn(),
    };
    sessionsService = { isSessionActive: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_ACCESS_TOKEN_SECRET: 'access-secret',
              };

              return config[key];
            }),
          },
        },
        { provide: SessionsService, useValue: sessionsService },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('rejects access tokens for users with pending account deletion', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue(makeUser({ scheduledDeletionAt: new Date(Date.now() + 60_000) }));
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    userModel.findById.mockReturnValue({ select });

    await expect(
      strategy.validate({ sub: 'user-id-123', type: 'access', sid: 'session-1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('password change revocation', () => {
    const mockUser = (passwordChangedAt?: Date) => {
      const exec = jest.fn().mockResolvedValue(makeUser({ passwordChangedAt }));
      userModel.findById.mockReturnValue({
        select: () => ({ lean: () => ({ exec }) }),
      });
    };
    const nowSeconds = Math.floor(Date.now() / 1000);

    it('rejects access tokens issued before the last password change', async () => {
      mockUser(new Date());

      await expect(
        strategy.validate({
          sub: 'user-id-123',
          type: 'access',
          sid: 'session-1',
          iat: nowSeconds - 60,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts access tokens issued after the last password change', async () => {
      mockUser(new Date(Date.now() - 60_000));

      await expect(
        strategy.validate({
          sub: 'user-id-123',
          type: 'access',
          sid: 'session-1',
          iat: nowSeconds,
        }),
      ).resolves.toEqual(expect.objectContaining({ email: expect.any(String) }));
    });
  });

  describe('session binding (logout / lock revocation)', () => {
    it('rejects a token whose session was deleted or deactivated', async () => {
      sessionsService.isSessionActive.mockResolvedValue(false);

      await expect(
        strategy.validate({ sub: 'user-id-123', type: 'access', sid: 'session-1' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionsService.isSessionActive).toHaveBeenCalledWith('session-1', 'user-id-123');
      expect(userModel.findById).not.toHaveBeenCalled();
    });

    it('rejects a token without a sid claim', async () => {
      await expect(strategy.validate({ sub: 'user-id-123', type: 'access' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(sessionsService.isSessionActive).not.toHaveBeenCalled();
    });
  });
});
