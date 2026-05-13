import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { SubscribersRepository } from './subscribers.repository';
import { Subscriber } from '../schemas/subscriber.schema';

describe('SubscribersRepository', () => {
  let repository: SubscribersRepository;
  let mockSubscriberModel: any;

  function buildOwnedFilter(userId: string, extra: Record<string, any> = {}) {
    return {
      ...extra,
      'createdBy._id': {
        $in: [userId, expect.any(mongoose.Types.ObjectId)],
      },
      isDeleted: false,
    };
  }

  beforeEach(async () => {
    mockSubscriberModel = {
      countDocuments: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribersRepository,
        {
          provide: getModelToken(Subscriber.name),
          useValue: mockSubscriberModel,
        },
      ],
    }).compile();

    repository = module.get<SubscribersRepository>(SubscribersRepository);
  });

  describe('validateObjectId', () => {
    it('should not throw for a valid object id', () => {
      expect(() =>
        repository.validateObjectId(new mongoose.Types.ObjectId().toString()),
      ).not.toThrow();
    });

    it('should throw BadRequestException for an invalid object id', () => {
      expect(() => repository.validateObjectId('invalid-id')).toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('should normalize audit ids to ObjectId before inserting a subscriber', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const payload = {
        name: 'Alert A',
        email: 'user@example.com',
        skills: ['TypeScript'],
        createdBy: {
          _id: userId,
          email: 'user@example.com',
        },
      };

      mockSubscriberModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      await repository.create(payload);

      expect(mockSubscriberModel.create).toHaveBeenCalledWith({
        ...payload,
        createdBy: {
          _id: expect.any(mongoose.Types.ObjectId),
          email: 'user@example.com',
        },
      });
      expect(mockSubscriberModel.create.mock.calls[0][0].createdBy._id.toString()).toBe(userId);
    });
  });

  describe('findOwned', () => {
    function setupFindChain(result: any[]) {
      const exec = jest.fn().mockResolvedValue(result);
      const lean = jest.fn().mockReturnValue({ exec });
      const select = jest.fn().mockReturnValue({ lean });
      const sort = jest.fn().mockReturnValue({ select });
      const limit = jest.fn().mockReturnValue({ sort });
      const skip = jest.fn().mockReturnValue({ limit });

      mockSubscriberModel.find.mockReturnValue({ skip });

      return { skip, limit, sort, select, lean, exec };
    }

    it('should paginate owned subscribers with projection and computed total pages', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const filter = { locationCode: 'ha-noi' };
      const docs = [{ _id: new mongoose.Types.ObjectId(), name: 'Alert A' }];
      const chain = setupFindChain(docs);
      mockSubscriberModel.countDocuments.mockResolvedValue(3);

      const result = await repository.findOwned(userId, filter, 10, 2, { createdAt: -1 });

      expect(mockSubscriberModel.countDocuments).toHaveBeenCalledWith(
        buildOwnedFilter(userId, filter) as any,
      );
      expect(mockSubscriberModel.find).toHaveBeenCalledWith(
        buildOwnedFilter(userId, filter) as any,
      );
      expect(mockSubscriberModel.find.mock.calls[0][0]['createdBy._id'].$in[0]).toBe(userId);
      expect(mockSubscriberModel.find.mock.calls[0][0]['createdBy._id'].$in[1].toString()).toBe(
        userId,
      );
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(2);
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.select).toHaveBeenCalledWith(
        'name email skills location locationCode createdAt updatedAt',
      );
      expect(chain.lean).toHaveBeenCalled();
      expect(chain.exec).toHaveBeenCalled();
      expect(result).toEqual({
        result: docs,
        totalItems: 3,
        totalPages: 2,
      });
    });

    it('should return one total page for empty results', async () => {
      setupFindChain([]);
      mockSubscriberModel.countDocuments.mockResolvedValue(0);

      const result = await repository.findOwned(
        new mongoose.Types.ObjectId().toString(),
        {},
        0,
        10,
        { createdAt: -1 },
      );

      expect(result.totalPages).toBe(1);
      expect(result.result).toEqual([]);
      expect(result.totalItems).toBe(0);
    });
  });

  describe('findOneOwned', () => {
    it('should scope lookup by id, owner, and non-deleted state', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const userId = new mongoose.Types.ObjectId().toString();
      const subscriber = { _id: id, name: 'Alert A' };
      const exec = jest.fn().mockResolvedValue(subscriber);
      const lean = jest.fn().mockReturnValue({ exec });
      mockSubscriberModel.findOne.mockReturnValue({ lean });

      const result = await repository.findOneOwned(id, userId);

      expect(mockSubscriberModel.findOne).toHaveBeenCalledWith(
        buildOwnedFilter(userId, { _id: id }) as any,
      );
      expect(mockSubscriberModel.findOne.mock.calls[0][0]['createdBy._id'].$in[0]).toBe(userId);
      expect(mockSubscriberModel.findOne.mock.calls[0][0]['createdBy._id'].$in[1].toString()).toBe(
        userId,
      );
      expect(lean).toHaveBeenCalled();
      expect(exec).toHaveBeenCalled();
      expect(result).toBe(subscriber);
    });
  });

  describe('updateOneOwned', () => {
    it('should normalize updatedBy and match both legacy and normalized owner ids', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const userId = new mongoose.Types.ObjectId().toString();
      const update = {
        name: 'Updated Alert',
        updatedBy: {
          _id: userId,
          email: 'user@example.com',
        },
      };

      mockSubscriberModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.updateOneOwned(id, userId, update);

      expect(mockSubscriberModel.updateOne).toHaveBeenCalledWith(
        buildOwnedFilter(userId, { _id: id }) as any,
        {
          ...update,
          updatedBy: {
            _id: expect.any(mongoose.Types.ObjectId),
            email: 'user@example.com',
          },
        },
      );
      expect(mockSubscriberModel.updateOne.mock.calls[0][1].updatedBy._id.toString()).toBe(userId);
    });
  });

  describe('softDeleteOwned', () => {
    it('should update deletedBy before soft deleting the record', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const userId = new mongoose.Types.ObjectId().toString();
      const deletedBy = {
        _id: userId,
        email: 'user@example.com',
      };
      const softDeleteResult = { deleted: 1 };

      mockSubscriberModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockSubscriberModel.softDelete.mockResolvedValue(softDeleteResult);

      const result = await repository.softDeleteOwned(id, userId, deletedBy);

      expect(mockSubscriberModel.updateOne).toHaveBeenCalledWith(
        buildOwnedFilter(userId, { _id: id }) as any,
        {
          deletedBy: {
            _id: expect.any(mongoose.Types.ObjectId),
            email: 'user@example.com',
          },
        },
      );
      expect(mockSubscriberModel.updateOne.mock.calls[0][1].deletedBy._id.toString()).toBe(userId);
      expect(mockSubscriberModel.softDelete).toHaveBeenCalledWith(
        buildOwnedFilter(userId, { _id: id }) as any,
      );
      expect(result).toBe(softDeleteResult);
    });
  });
});
