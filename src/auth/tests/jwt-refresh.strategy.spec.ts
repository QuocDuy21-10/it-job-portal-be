import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from 'src/sessions/sessions.service';
import { User } from 'src/users/schemas/user.schema';
import { JwtRefreshStrategy } from '../passport/jwt-refresh.strategy';
import { makeUser } from '../testing/auth-test-data';

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;
  let sessionsService: {
    findSessionByToken: jest.Mock;
    updateLastUsedAt: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
  };

  beforeEach(async () => {
    sessionsService = {
      findSessionByToken: jest.fn(),
      updateLastUsedAt: jest.fn().mockResolvedValue(undefined),
    };

    userModel = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtRefreshStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_REFRESH_TOKEN_SECRET: 'refresh-secret',
              };

              return config[key];
            }),
          },
        },
        {
          provide: SessionsService,
          useValue: sessionsService,
        },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
      ],
    }).compile();

    strategy = module.get(JwtRefreshStrategy);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('rejects refresh tokens for users with pending account deletion', async () => {
    const req = {
      cookies: {
        refresh_token: 'raw-refresh-token',
      },
    } as any;

    sessionsService.findSessionByToken.mockResolvedValue({
      userId: { _id: { toString: () => 'user-id-123' } },
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const exec = jest
      .fn()
      .mockResolvedValue(makeUser({ scheduledDeletionAt: new Date(Date.now() + 60_000) }));
    const lean = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ lean });
    userModel.findById.mockReturnValue({ select });

    await expect(
      strategy.validate(req, {
        sub: 'user-id-123',
        type: 'refresh',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(sessionsService.findSessionByToken).toHaveBeenCalledWith('raw-refresh-token');
    expect(sessionsService.updateLastUsedAt).toHaveBeenCalledWith('raw-refresh-token');
  });
});
