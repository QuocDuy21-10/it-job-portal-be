import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { SessionsService } from './sessions.service';
import { Session } from './schemas/session.schema';

describe('SessionsService', () => {
  let service: SessionsService;
  let sessionModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    deleteOne: jest.Mock;
    deleteMany: jest.Mock;
    updateOne: jest.Mock;
    updateMany: jest.Mock;
    countDocuments: jest.Mock;
  };

  const refreshTokenSecret = 'refresh-secret';

  beforeEach(async () => {
    sessionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
      updateOne: jest.fn(),
      updateMany: jest.fn(),
      countDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: getModelToken(Session.name), useValue: sessionModel },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_REFRESH_EXPIRES_IN: '30d',
                JWT_REFRESH_TOKEN_SECRET: refreshTokenSecret,
              };

              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get(SessionsService);
  });

  function hashToken(refreshToken: string): string {
    return createHmac('sha256', refreshTokenSecret).update(refreshToken).digest('hex');
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('stores a refresh token hash instead of the raw refresh token', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    sessionModel.create.mockResolvedValue({ _id: 'session-1' });

    await service.createSession('user-id-123', 'raw-refresh-token', 'TestAgent', '127.0.0.1');

    expect(sessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id-123',
        refreshToken: hashToken('raw-refresh-token'),
        refreshTokenHash: hashToken('raw-refresh-token'),
        userAgent: 'TestAgent',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(1_702_592_000_000),
        isActive: true,
        lastUsedAt: expect.any(Date),
      }),
    );
  });

  it('looks up sessions by the hashed refresh token', async () => {
    const exec = jest.fn().mockResolvedValue({ _id: 'session-1' });
    const populate = jest.fn().mockReturnValue({ exec });
    sessionModel.findOne.mockReturnValue({ populate });

    await service.findSessionByToken('raw-refresh-token');

    expect(sessionModel.findOne).toHaveBeenCalledWith({
      refreshTokenHash: hashToken('raw-refresh-token'),
      isActive: true,
      expiresAt: { $gt: expect.any(Date) },
    });
    expect(populate).toHaveBeenCalledWith('userId', 'name email role company');
  });

  it('deletes sessions by the hashed refresh token', async () => {
    sessionModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const result = await service.deleteSession('raw-refresh-token');

    expect(sessionModel.deleteOne).toHaveBeenCalledWith({
      refreshTokenHash: hashToken('raw-refresh-token'),
    });
    expect(result).toBe(true);
  });

  it('updates lastUsedAt by the hashed refresh token', async () => {
    sessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await service.updateLastUsedAt('raw-refresh-token');

    expect(sessionModel.updateOne).toHaveBeenCalledWith(
      { refreshTokenHash: hashToken('raw-refresh-token') },
      { $set: { lastUsedAt: expect.any(Date) } },
    );
  });

  it('enforces the session limit by deleting the oldest hashed sessions', async () => {
    const exec = jest
      .fn()
      .mockResolvedValue([
        { refreshTokenHash: 'hash-1' },
        { refreshTokenHash: 'hash-2' },
        { refreshTokenHash: 'hash-3' },
      ]);
    const sort = jest.fn().mockReturnValue({ exec });
    sessionModel.find.mockReturnValue({ sort });
    sessionModel.deleteMany.mockResolvedValue({ deletedCount: 1 });

    await service.enforceSessionLimit('user-id-123', 2);

    expect(sessionModel.deleteMany).toHaveBeenCalledWith({
      refreshTokenHash: { $in: ['hash-1'] },
    });
  });
});
