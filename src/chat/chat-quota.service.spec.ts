import { ConfigService } from '@nestjs/config';
import { ChatQuotaExceededException } from './exceptions/too-many-requests.exception';
import { ChatQuotaService } from './chat-quota.service';

describe('ChatQuotaService', () => {
  let service: ChatQuotaService;
  let redisClient: { incr: jest.Mock; pexpire: jest.Mock };
  let configService: { get: jest.Mock };

  const user = {
    _id: '507f1f77bcf86cd799439011',
    role: { _id: 'role-1', name: 'NORMAL USER' },
  } as any;

  beforeEach(() => {
    redisClient = {
      incr: jest.fn(),
      pexpire: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };
    service = new ChatQuotaService(redisClient as any, configService as unknown as ConfigService);
  });

  it('consumes normal user quota and returns remaining messages', async () => {
    redisClient.incr.mockResolvedValue(1);
    redisClient.pexpire.mockResolvedValue(1);

    const status = await service.consume(user);

    expect(status.limit).toBe(30);
    expect(status.used).toBe(1);
    expect(status.remaining).toBe(29);
    expect(status.unlimited).toBe(false);
    expect(redisClient.pexpire).toHaveBeenCalled();
  });

  it('rejects requests over the daily quota', async () => {
    redisClient.incr.mockResolvedValue(31);

    await expect(service.consume(user)).rejects.toBeInstanceOf(ChatQuotaExceededException);
  });

  it('treats super admin as unlimited without touching Redis', async () => {
    const status = await service.consume({
      ...user,
      role: { _id: 'role-admin', name: 'SUPER ADMIN' },
    });

    expect(status.unlimited).toBe(true);
    expect(status.limit).toBeNull();
    expect(redisClient.incr).not.toHaveBeenCalled();
  });

  it('fails open when Redis quota storage is unavailable', async () => {
    redisClient.incr.mockRejectedValue(new Error('redis down'));

    const status = await service.consume(user);

    expect(status.unavailable).toBe(true);
    expect(status.remaining).toBe(30);
  });
});
