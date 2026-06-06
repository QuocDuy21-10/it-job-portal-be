import { ConfigService } from '@nestjs/config';
import { ERole } from 'src/casl/enums/role.enum';
import { ChatQuotaExceededException } from './exceptions/too-many-requests.exception';
import { ChatQuotaService } from './chat-quota.service';

describe('ChatQuotaService', () => {
  let service: ChatQuotaService;
  let redisClient: { eval: jest.Mock; get: jest.Mock };
  let configService: { get: jest.Mock };
  let chatQuotaPolicyModel: { findOne: jest.Mock };

  const user = {
    _id: '507f1f77bcf86cd799439011',
    role: ERole.NORMAL_USER,
  } as any;

  const createPolicyQuery = (value: unknown = null) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-12-01T10:00:00.000Z'));

    redisClient = {
      eval: jest.fn(),
      get: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };
    chatQuotaPolicyModel = {
      findOne: jest.fn().mockReturnValue(createPolicyQuery()),
    };
    service = new ChatQuotaService(
      redisClient as any,
      configService as unknown as ConfigService,
      chatQuotaPolicyModel as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reserves normal user quota and returns remaining messages', async () => {
    redisClient.eval.mockResolvedValue([1, 1, 29]);

    const reservation = await service.reserve(user);

    expect(reservation.consumed).toBe(true);
    expect(reservation.status.limit).toBe(30);
    expect(reservation.status.used).toBe(1);
    expect(reservation.status.remaining).toBe(29);
    expect(reservation.status.resetAt).toEqual(new Date('2024-12-01T17:00:00.000Z'));
    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call'),
      1,
      'chat:quota:v1:20241201:role:NORMAL USER:user:507f1f77bcf86cd799439011',
      30,
      25_200_000,
    );
  });

  it('uses HR quota limit', async () => {
    redisClient.eval.mockResolvedValue([1, 1, 99]);

    const reservation = await service.reserve({
      ...user,
      role: ERole.HR,
    });

    expect(reservation.status.limit).toBe(100);
    expect(reservation.status.remaining).toBe(99);
  });

  it('rejects requests over the daily quota without consuming another message', async () => {
    redisClient.eval.mockResolvedValue([0, 30, 0]);

    await expect(service.reserve(user)).rejects.toBeInstanceOf(ChatQuotaExceededException);
  });

  it('treats super admin as unlimited without touching Redis', async () => {
    const reservation = await service.reserve({
      ...user,
      role: ERole.SUPER_ADMIN,
    });

    expect(reservation.consumed).toBe(false);
    expect(reservation.status.unlimited).toBe(true);
    expect(reservation.status.limit).toBeNull();
    expect(redisClient.eval).not.toHaveBeenCalled();
  });

  it('fails open when Redis quota storage is unavailable', async () => {
    redisClient.eval.mockRejectedValue(new Error('redis down'));

    const reservation = await service.reserve(user);

    expect(reservation.consumed).toBe(false);
    expect(reservation.status.unavailable).toBe(true);
    expect(reservation.status.remaining).toBe(30);
  });

  it('rolls back consumed reservations', async () => {
    await service.rollback({
      key: 'chat:quota:v1:20241201:role:NORMAL USER:user:507f1f77bcf86cd799439011',
      consumed: true,
      status: {
        limit: 30,
        used: 1,
        remaining: 29,
        resetAt: new Date('2024-12-01T17:00:00.000Z'),
        unlimited: false,
      },
    });

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('DECR'),
      1,
      'chat:quota:v1:20241201:role:NORMAL USER:user:507f1f77bcf86cd799439011',
    );
  });

  it('does not rollback unlimited, denied, or unavailable reservations', async () => {
    await service.rollback({
      consumed: false,
      status: {
        limit: null,
        used: 0,
        remaining: null,
        resetAt: new Date('2024-12-01T17:00:00.000Z'),
        unlimited: true,
      },
    });

    expect(redisClient.eval).not.toHaveBeenCalled();
  });

  it('reads active database policy before falling back to env limits', async () => {
    chatQuotaPolicyModel.findOne.mockReturnValue(
      createPolicyQuery({
        dailyLimit: 12,
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    );
    redisClient.eval.mockResolvedValue([1, 1, 11]);

    const reservation = await service.reserve(user);

    expect(reservation.status.limit).toBe(12);
    expect(reservation.status.remaining).toBe(11);
  });

  it('serializes public quota metadata in camelCase', () => {
    expect(
      service.serializePublicStatus({
        limit: 30,
        used: 2,
        remaining: 28,
        resetAt: new Date('2024-12-01T17:00:00.000Z'),
        unlimited: false,
      }),
    ).toEqual({
      remainingQuota: 28,
      nextResetTime: 1733072400,
    });
  });
});
