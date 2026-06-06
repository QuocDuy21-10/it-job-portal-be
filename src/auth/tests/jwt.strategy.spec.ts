import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from '../passport/jwt.strategy';
import { User } from 'src/users/schemas/user.schema';
import { makeUser } from '../testing/auth-test-data';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userModel: {
    findById: jest.Mock;
  };

  beforeEach(async () => {
    userModel = {
      findById: jest.fn(),
    };

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

    await expect(strategy.validate({ sub: 'user-id-123', type: 'access' })).rejects.toThrow(
      ForbiddenException,
    );
  });
});
