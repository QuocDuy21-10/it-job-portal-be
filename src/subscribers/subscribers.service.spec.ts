import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { SubscribersService } from './subscribers.service';
import { SubscribersRepository } from './repositories/subscribers.repository';

describe('SubscribersService', () => {
  let service: SubscribersService;
  let mockSubscribersRepository: jest.Mocked<SubscribersRepository>;

  const user = {
    _id: new mongoose.Types.ObjectId().toString(),
    email: 'user@example.com',
    name: 'Test User',
  } as any;

  beforeEach(async () => {
    mockSubscribersRepository = {
      validateObjectId: jest.fn(),
      countActiveByEmail: jest.fn(),
      create: jest.fn(),
      findOwned: jest.fn(),
      findOneOwned: jest.fn(),
      updateOneOwned: jest.fn(),
      softDeleteOwned: jest.fn(),
      findSkillsByEmail: jest.fn(),
      findActiveByEmail: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribersService,
        { provide: SubscribersRepository, useValue: mockSubscribersRepository },
      ],
    }).compile();

    service = module.get<SubscribersService>(SubscribersService);
  });

  describe('create', () => {
    const dto = {
      name: 'Nguyen Van Duy',
      skills: ['TypeScript', 'NestJS'],
      location: 'Hanoi',
    };

    it('should create a subscriber below the active subscription limit', async () => {
      const createdAt = new Date('2026-04-23T10:00:00.000Z');
      mockSubscribersRepository.countActiveByEmail.mockResolvedValue(2);
      mockSubscribersRepository.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        createdAt,
      } as any);

      const result = await service.create(dto, user);

      expect(mockSubscribersRepository.countActiveByEmail).toHaveBeenCalledWith(user.email);
      expect(mockSubscribersRepository.create).toHaveBeenCalledWith({
        name: dto.name,
        email: user.email,
        skills: dto.skills,
        location: dto.location,
        createdBy: {
          _id: user._id,
          email: user.email,
        },
      });
      expect(result).toEqual({
        _id: expect.any(mongoose.Types.ObjectId),
        createdAt,
      });
    });

    it('should throw BadRequestException when the limit is reached', async () => {
      mockSubscribersRepository.countActiveByEmail.mockResolvedValue(3);

      await expect(service.create(dto, user)).rejects.toThrow(BadRequestException);
      expect(mockSubscribersRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should normalize pagination, scope ownership, and build filters safely', async () => {
      mockSubscribersRepository.findOwned.mockResolvedValue({
        result: [{ _id: new mongoose.Types.ObjectId(), name: 'Alert A' }] as any,
        totalItems: 1,
        totalPages: 1,
      });

      const result = await service.findAll(
        0,
        500,
        {
          page: 0,
          limit: 500,
          location: 'Hanoi (Remote)+',
          skill: 'TypeScript',
          sortBy: 'name',
          sortOrder: 'asc',
        } as any,
        user,
      );

      const [filter, offset, limit, sort] = mockSubscribersRepository.findOwned.mock.calls[0];

      expect(offset).toBe(0);
      expect(limit).toBe(100);
      expect(sort).toEqual({ name: 1 });
      expect(filter.isDeleted).toBe(false);
      expect(filter.skills).toEqual({ $in: ['TypeScript'] });
      expect(filter.location).toEqual({
        $regex: 'Hanoi \\(Remote\\)\\+',
        $options: 'i',
      });
      expect(filter['createdBy._id']).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(filter['createdBy._id'].toString()).toBe(user._id);
      expect(result.meta.pagination).toEqual({
        current_page: 1,
        per_page: 100,
        total_pages: 1,
        total: 1,
      });
    });

    it('should apply default page, limit, and sort values', async () => {
      mockSubscribersRepository.findOwned.mockResolvedValue({
        result: [],
        totalItems: 0,
        totalPages: 1,
      });

      await service.findAll(undefined as any, undefined as any, {} as any, user);

      const [, offset, limit, sort] = mockSubscribersRepository.findOwned.mock.calls[0];
      expect(offset).toBe(0);
      expect(limit).toBe(10);
      expect(sort).toEqual({ createdAt: -1 });
    });
  });

  describe('findOne', () => {
    it('should validate id and return an owned subscriber', async () => {
      const subscriber = { _id: new mongoose.Types.ObjectId(), name: 'Alert A' } as any;
      mockSubscribersRepository.findOneOwned.mockResolvedValue(subscriber);

      const result = await service.findOne(subscriber._id.toString(), user);

      expect(mockSubscribersRepository.validateObjectId).toHaveBeenCalledWith(
        subscriber._id.toString(),
      );
      expect(mockSubscribersRepository.findOneOwned).toHaveBeenCalledWith(
        subscriber._id.toString(),
        user._id,
      );
      expect(result).toBe(subscriber);
    });

    it('should throw NotFoundException when the subscriber is missing', async () => {
      mockSubscribersRepository.findOneOwned.mockResolvedValue(null);

      await expect(service.findOne(new mongoose.Types.ObjectId().toString(), user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an owned subscriber and return the refreshed record', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const existing = { _id: id, name: 'Old Name' } as any;
      const updated = { _id: id, name: 'New Name' } as any;

      mockSubscribersRepository.findOneOwned
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);

      const result = await service.update(id, { name: 'New Name' }, user);

      expect(mockSubscribersRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockSubscribersRepository.updateOneOwned).toHaveBeenCalledWith(
        id,
        user._id,
        expect.objectContaining({
          name: 'New Name',
          updatedBy: {
            _id: user._id,
            email: user.email,
          },
        }),
      );
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException when updating an unowned or missing subscriber', async () => {
      mockSubscribersRepository.findOneOwned.mockResolvedValue(null);

      await expect(
        service.update(new mongoose.Types.ObjectId().toString(), { name: 'New Name' }, user),
      ).rejects.toThrow(NotFoundException);

      expect(mockSubscribersRepository.updateOneOwned).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete an owned subscriber with deletedBy metadata', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const softDeleteResult = { deleted: 1 };
      mockSubscribersRepository.findOneOwned.mockResolvedValue({ _id: id } as any);
      mockSubscribersRepository.softDeleteOwned.mockResolvedValue(softDeleteResult as any);

      const result = await service.remove(id, user);

      expect(mockSubscribersRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockSubscribersRepository.softDeleteOwned).toHaveBeenCalledWith(id, user._id, {
        _id: user._id,
        email: user.email,
      });
      expect(result).toBe(softDeleteResult);
    });

    it('should throw NotFoundException when deleting an unowned or missing subscriber', async () => {
      mockSubscribersRepository.findOneOwned.mockResolvedValue(null);

      await expect(service.remove(new mongoose.Types.ObjectId().toString(), user)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockSubscribersRepository.softDeleteOwned).not.toHaveBeenCalled();
    });
  });

  describe('getUserSkills', () => {
    it('should return subscriber skills for the current user email', async () => {
      const skillsResult = { skills: ['TypeScript'], createdAt: new Date() } as any;
      mockSubscribersRepository.findSkillsByEmail.mockResolvedValue(skillsResult);

      const result = await service.getUserSkills(user);

      expect(mockSubscribersRepository.findSkillsByEmail).toHaveBeenCalledWith(user.email);
      expect(result).toBe(skillsResult);
    });
  });

  describe('getMySubscriptions', () => {
    it('should return active subscriptions with summary metadata', async () => {
      const subscriptions = [
        { _id: new mongoose.Types.ObjectId(), name: 'Alert A' },
        { _id: new mongoose.Types.ObjectId(), name: 'Alert B' },
      ] as any;
      mockSubscribersRepository.findActiveByEmail.mockResolvedValue(subscriptions);

      const result = await service.getMySubscriptions(user);

      expect(mockSubscribersRepository.findActiveByEmail).toHaveBeenCalledWith(user.email);
      expect(result).toEqual({
        subscriptions,
        total: 2,
        maxAllowed: 3,
      });
    });
  });
});
