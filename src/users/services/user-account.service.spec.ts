import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import mongoose from 'mongoose';
import { SessionsService } from 'src/sessions/sessions.service';
import { UserAccountService } from './user-account.service';
import { UserRepository } from '../repositories/user.repository';

describe('UserAccountService', () => {
  let service: UserAccountService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockSessionsService: jest.Mocked<SessionsService>;

  const adminUser = {
    _id: new mongoose.Types.ObjectId().toString(),
    email: 'admin@example.com',
  } as any;

  beforeEach(async () => {
    mockUserRepository = {
      validateObjectId: jest.fn(),
      updateOne: jest.fn(),
      findById: jest.fn(),
      findActiveUser: jest.fn(),
    } as any;

    mockSessionsService = {
      deactivateAllUserSessions: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAccountService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: SessionsService, useValue: mockSessionsService },
      ],
    }).compile();

    service = module.get<UserAccountService>(UserAccountService);
  });

  describe('activateUser', () => {
    it('should validate the id and activate the user', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const updateResult = { matchedCount: 1 };
      mockUserRepository.updateOne.mockResolvedValue(updateResult as any);

      const result = await service.activateUser(id);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(id, {
        $set: { isActive: true },
        $unset: { verificationExpires: 1 },
      });
      expect(result).toBe(updateResult);
    });
  });

  describe('scheduleAccountDeletion', () => {
    it('should validate the id and persist scheduledDeletionAt', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const scheduledDeletionAt = new Date();

      await service.scheduleAccountDeletion(id, scheduledDeletionAt);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(id, {
        $set: { scheduledDeletionAt },
      });
    });
  });

  describe('cancelAccountDeletion', () => {
    it('should validate the id and unset scheduledDeletionAt', async () => {
      const id = new mongoose.Types.ObjectId().toString();

      await service.cancelAccountDeletion(id);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(id, {
        $unset: { scheduledDeletionAt: 1 },
      });
    });
  });

  describe('updateUserStatus', () => {
    it('should validate the id and update the active status', async () => {
      const id = new mongoose.Types.ObjectId().toString();

      await service.updateUserStatus(id, false);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(id, { isActive: false });
    });
  });

  describe('updatePassword', () => {
    it('should validate the id and update the password hash', async () => {
      const id = new mongoose.Types.ObjectId().toString();

      await service.updatePassword(id, 'new-password-hash');

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(id, {
        password: 'new-password-hash',
      });
    });
  });

  describe('updateUnverifiedUser', () => {
    it('should refresh the password hash and verification expiry before reloading the user', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const now = Date.now();
      const storedUser = { _id: id };
      mockUserRepository.findById.mockResolvedValue(storedUser as any);

      const result = await service.updateUnverifiedUser(id, {
        name: 'Updated User',
        email: 'updated@example.com',
        password: 'NewPassword123!',
      });

      const updatePayload = mockUserRepository.updateOne.mock.calls[0][1];
      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(updatePayload.name).toBe('Updated User');
      expect(updatePayload.password).not.toBe('NewPassword123!');
      expect(updatePayload.verificationExpires).toBeInstanceOf(Date);
      expect(updatePayload.verificationExpires.getTime()).toBeGreaterThan(now);
      expect(updatePayload.verificationExpires.getTime()).toBeLessThanOrEqual(
        now + 15 * 60 * 1000 + 5_000,
      );
      expect(mockUserRepository.findById).toHaveBeenCalledWith(id);
      expect(result).toBe(storedUser);
    });
  });

  describe('lockUser', () => {
    const id = new mongoose.Types.ObjectId().toString();

    it('should reject when the admin tries to lock their own account', async () => {
      await expect(service.lockUser(adminUser._id, {}, adminUser)).rejects.toThrow(
        new BadRequestException('You cannot lock your own account'),
      );
    });

    it('should reject when the target user does not exist', async () => {
      mockUserRepository.findActiveUser.mockResolvedValue(null);

      await expect(service.lockUser(id, {}, adminUser)).rejects.toThrow(
        new NotFoundException(`User with ID ${id} not found`),
      );
    });

    it('should reject when the target user is already locked', async () => {
      mockUserRepository.findActiveUser.mockResolvedValue({
        _id: id,
        email: 'user@example.com',
        isLocked: true,
      } as any);

      await expect(service.lockUser(id, {}, adminUser)).rejects.toThrow(
        new BadRequestException('User account is already locked'),
      );
    });

    it('should lock the user, record metadata, and deactivate all sessions', async () => {
      mockUserRepository.findActiveUser.mockResolvedValue({
        _id: id,
        email: 'user@example.com',
        isLocked: false,
      } as any);
      mockUserRepository.updateOne.mockResolvedValue({ matchedCount: 1 } as any);
      mockSessionsService.deactivateAllUserSessions.mockResolvedValue(undefined);

      const result = await service.lockUser(id, { reason: 'Policy violation' }, adminUser);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          isLocked: true,
          lockReason: 'Policy violation',
          lockedBy: { _id: adminUser._id, email: adminUser.email },
          lockedAt: expect.any(Date),
          updatedBy: { _id: adminUser._id, email: adminUser.email },
        }),
      );
      expect(mockSessionsService.deactivateAllUserSessions).toHaveBeenCalledWith(id);
      expect(result).toEqual({
        _id: id,
        email: 'user@example.com',
        isLocked: true,
        lockReason: 'Policy violation',
      });
    });
  });

  describe('unlockUser', () => {
    const id = new mongoose.Types.ObjectId().toString();

    it('should reject when the target user does not exist', async () => {
      mockUserRepository.findActiveUser.mockResolvedValue(null);

      await expect(service.unlockUser(id, adminUser)).rejects.toThrow(
        new NotFoundException(`User with ID ${id} not found`),
      );
    });

    it('should reject when the target user is not locked', async () => {
      mockUserRepository.findActiveUser.mockResolvedValue({
        _id: id,
        email: 'user@example.com',
        isLocked: false,
      } as any);

      await expect(service.unlockUser(id, adminUser)).rejects.toThrow(
        new BadRequestException('User account is not locked'),
      );
    });

    it('should unlock the user and clear lock metadata', async () => {
      mockUserRepository.findActiveUser.mockResolvedValue({
        _id: id,
        email: 'user@example.com',
        isLocked: true,
      } as any);
      mockUserRepository.updateOne.mockResolvedValue({ matchedCount: 1 } as any);

      const result = await service.unlockUser(id, adminUser);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(id, {
        isLocked: false,
        $unset: { lockReason: '', lockedBy: '', lockedAt: '' },
        updatedBy: { _id: adminUser._id, email: adminUser.email },
      });
      expect(result).toEqual({
        _id: id,
        email: 'user@example.com',
        isLocked: false,
      });
    });
  });
});
