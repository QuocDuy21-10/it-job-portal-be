import { ConflictException } from '@nestjs/common';
import { ChatIdempotencyService } from './chat-idempotency.service';

describe('ChatIdempotencyService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const clientMessageId = '3f1c2b8e-9a4d-4c1e-8f2a-1b2c3d4e5f60';
  let redisClient: { set: jest.Mock; del: jest.Mock };
  let service: ChatIdempotencyService;

  beforeEach(() => {
    redisClient = { set: jest.fn(), del: jest.fn() };
    service = new ChatIdempotencyService(redisClient as any);
  });

  it('claims the key with SET PX NX and returns it', async () => {
    redisClient.set.mockResolvedValue('OK');

    const key = await service.acquire(userId, clientMessageId);

    expect(key).toBe(`chat_idem:${userId}:${clientMessageId}`);
    expect(redisClient.set).toHaveBeenCalledWith(key, '1', 'PX', 300000, 'NX');
  });

  it('rejects a duplicate clientMessageId', async () => {
    redisClient.set.mockResolvedValue(null);

    await expect(service.acquire(userId, clientMessageId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('skips the check without a clientMessageId', async () => {
    await expect(service.acquire(userId)).resolves.toBeUndefined();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it('lets the request through when Redis fails', async () => {
    redisClient.set.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.acquire(userId, clientMessageId)).resolves.toBeUndefined();
  });

  it('releases an owned key and swallows Redis errors', async () => {
    redisClient.del.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(service.release('chat_idem:k')).resolves.toBeUndefined();
    await service.release(undefined);

    expect(redisClient.del).toHaveBeenCalledTimes(1);
    expect(redisClient.del).toHaveBeenCalledWith('chat_idem:k');
  });
});
