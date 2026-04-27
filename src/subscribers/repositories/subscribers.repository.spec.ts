import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { SubscribersRepository } from './subscribers.repository';
import { Subscriber } from '../schemas/subscriber.schema';

describe('SubscribersRepository', () => {
  let repository: SubscribersRepository;
  let mockSubscriberModel: any;

  beforeEach(async () => {
    mockSubscriberModel = {
      countDocuments: jest.fn(),
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
      const filter = {
        'createdBy._id': new mongoose.Types.ObjectId(),
        isDeleted: false,
      };
      const docs = [{ _id: new mongoose.Types.ObjectId(), name: 'Alert A' }];
      const chain = setupFindChain(docs);
      mockSubscriberModel.countDocuments.mockResolvedValue(3);

      const result = await repository.findOwned(filter, 10, 2, { createdAt: -1 });

      expect(mockSubscriberModel.countDocuments).toHaveBeenCalledWith(filter);
      expect(mockSubscriberModel.find).toHaveBeenCalledWith(filter);
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(2);
      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.select).toHaveBeenCalledWith('name email skills location createdAt updatedAt');
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

      const result = await repository.findOwned({ isDeleted: false }, 0, 10, { createdAt: -1 });

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

      expect(mockSubscriberModel.findOne).toHaveBeenCalledWith({
        _id: id,
        'createdBy._id': expect.any(mongoose.Types.ObjectId),
        isDeleted: false,
      });
      expect(mockSubscriberModel.findOne.mock.calls[0][0]['createdBy._id'].toString()).toBe(userId);
      expect(lean).toHaveBeenCalled();
      expect(exec).toHaveBeenCalled();
      expect(result).toBe(subscriber);
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
        {
          _id: id,
          'createdBy._id': expect.any(mongoose.Types.ObjectId),
          isDeleted: false,
        },
        { deletedBy },
      );
      expect(mockSubscriberModel.updateOne.mock.calls[0][0]['createdBy._id'].toString()).toBe(
        userId,
      );
      expect(mockSubscriberModel.softDelete).toHaveBeenCalledWith({ _id: id });
      expect(result).toBe(softDeleteResult);
    });
  });
});
