import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { Notification } from './schemas/notification.schema';

describe('NotificationsService.findAllByUser', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  let service: NotificationsService;
  let query: Record<string, jest.Mock>;
  let model: { countDocuments: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    query = {
      skip: jest.fn(),
      limit: jest.fn(),
      sort: jest.fn(),
      populate: jest.fn(),
      select: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    for (const key of ['skip', 'limit', 'sort', 'populate', 'select']) {
      query[key].mockReturnValue(query);
    }
    model = {
      countDocuments: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockReturnValue(query),
    };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(Notification.name), useValue: model },
        { provide: NotificationsGateway, useValue: {} },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('ignores client populate/fields and filters outside the allowlist', async () => {
    await service.findAllByUser(userId, 1, 10, {
      populate: 'userId',
      fields: 'data',
      userId: 'someone-else',
      isRead: 'false',
    } as any);

    const [filter] = model.find.mock.calls[0];
    expect(filter.userId.toString()).toBe(userId);
    expect(filter.isRead).toBe(false);
    expect(query.populate).not.toHaveBeenCalled();
    expect(query.select).not.toHaveBeenCalled();
  });

  it('defaults to newest first and clamps limit to 100', async () => {
    const response = await service.findAllByUser(userId, 1, 1000, '');

    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(response.meta.pagination.per_page).toBe(100);
  });
});

describe('NotificationsService ownership errors', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const id = new mongoose.Types.ObjectId().toString();
  let service: NotificationsService;
  let model: { updateOne: jest.Mock; softDelete: jest.Mock };

  beforeEach(async () => {
    model = { updateOne: jest.fn(), softDelete: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(Notification.name), useValue: model },
        { provide: NotificationsGateway, useValue: {} },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  it("returns 404 when marking someone else's (or a missing) notification as read", async () => {
    model.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await expect(service.markAsRead(id, userId)).rejects.toThrow(NotFoundException);
  });

  it("marks the caller's own notification as read", async () => {
    model.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await expect(service.markAsRead(id, userId)).resolves.toEqual(
      expect.objectContaining({ matchedCount: 1 }),
    );
  });

  it("returns 404 when deleting someone else's (or a missing) notification", async () => {
    model.updateOne.mockResolvedValue({ matchedCount: 0 });
    model.softDelete.mockResolvedValue({ deleted: 0 });

    await expect(
      service.remove(id, { _id: userId, email: 'a@example.com' } as any),
    ).rejects.toThrow(NotFoundException);
  });
});
