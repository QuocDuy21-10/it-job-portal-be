import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import mongoose from 'mongoose';
import { UserPreferencesService } from './user-preferences.service';
import { UserRepository } from '../repositories/user.repository';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const userId = new mongoose.Types.ObjectId().toString();
  const jobId = new mongoose.Types.ObjectId().toString();
  const companyId = new mongoose.Types.ObjectId().toString();

  beforeEach(async () => {
    mockUserRepository = {
      validateObjectId: jest.fn(),
      jobExists: jest.fn(),
      addSavedJob: jest.fn(),
      removeSavedJob: jest.fn(),
      findUserWithSavedJobs: jest.fn(),
      companyExists: jest.fn(),
      findUserCompanyFollowed: jest.fn(),
      addFollowedCompany: jest.fn(),
      removeFollowedCompany: jest.fn(),
      findUserWithFollowedCompanies: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPreferencesService,
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<UserPreferencesService>(UserPreferencesService);
  });

  describe('saveJob', () => {
    it('should validate ids and save a job for an existing user', async () => {
      mockUserRepository.jobExists.mockResolvedValue(true);
      mockUserRepository.addSavedJob.mockResolvedValue({ matchedCount: 1 } as any);

      await service.saveJob(userId, jobId);

      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(1, userId);
      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(2, jobId);
      expect(mockUserRepository.addSavedJob).toHaveBeenCalledWith(userId, jobId);
    });

    it('should reject when the job does not exist', async () => {
      mockUserRepository.jobExists.mockResolvedValue(false);

      await expect(service.saveJob(userId, jobId)).rejects.toThrow(
        new BadRequestException('Job not found or has been deleted'),
      );
    });

    it('should reject when the user is not found', async () => {
      mockUserRepository.jobExists.mockResolvedValue(true);
      mockUserRepository.addSavedJob.mockResolvedValue({ matchedCount: 0 } as any);

      await expect(service.saveJob(userId, jobId)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });
  });

  describe('unsaveJob', () => {
    it('should validate ids and unsave the job for an existing user', async () => {
      mockUserRepository.removeSavedJob.mockResolvedValue({ matchedCount: 1 } as any);

      await service.unsaveJob(userId, jobId);

      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(1, userId);
      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(2, jobId);
      expect(mockUserRepository.removeSavedJob).toHaveBeenCalledWith(userId, jobId);
    });

    it('should reject when the user is not found', async () => {
      mockUserRepository.removeSavedJob.mockResolvedValue({ matchedCount: 0 } as any);

      await expect(service.unsaveJob(userId, jobId)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });
  });

  describe('getSavedJobs', () => {
    it('should paginate saved jobs and return the expected meta shape', async () => {
      const savedJobs = [
        { _id: new mongoose.Types.ObjectId(), name: 'Job A' },
        { _id: new mongoose.Types.ObjectId(), name: 'Job B' },
        { _id: new mongoose.Types.ObjectId(), name: 'Job C' },
      ];
      mockUserRepository.findUserWithSavedJobs.mockResolvedValue({ savedJobs } as any);

      const result = await service.getSavedJobs(userId, 2, 2);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        result: [savedJobs[2]],
        meta: {
          current: 2,
          pageSize: 2,
          pages: 2,
          total: 3,
        },
      });
    });

    it('should reject when the user is not found', async () => {
      mockUserRepository.findUserWithSavedJobs.mockResolvedValue(null);

      await expect(service.getSavedJobs(userId)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });
  });

  describe('followCompany', () => {
    it('should validate ids and add a company follow for a valid request', async () => {
      mockUserRepository.companyExists.mockResolvedValue(true);
      mockUserRepository.findUserCompanyFollowed.mockResolvedValue({
        companyFollowed: [],
      } as any);
      mockUserRepository.addFollowedCompany.mockResolvedValue({ matchedCount: 1 } as any);

      await service.followCompany(userId, companyId);

      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(1, userId);
      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(2, companyId);
      expect(mockUserRepository.addFollowedCompany).toHaveBeenCalledWith(userId, companyId);
    });

    it('should reject when the company does not exist', async () => {
      mockUserRepository.companyExists.mockResolvedValue(false);

      await expect(service.followCompany(userId, companyId)).rejects.toThrow(
        new BadRequestException('Company not found or has been deleted'),
      );
    });

    it('should reject when the user is not found', async () => {
      mockUserRepository.companyExists.mockResolvedValue(true);
      mockUserRepository.findUserCompanyFollowed.mockResolvedValue(null);

      await expect(service.followCompany(userId, companyId)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });

    it('should reject duplicate follows', async () => {
      mockUserRepository.companyExists.mockResolvedValue(true);
      mockUserRepository.findUserCompanyFollowed.mockResolvedValue({
        companyFollowed: [new mongoose.Types.ObjectId(companyId)],
      } as any);

      await expect(service.followCompany(userId, companyId)).rejects.toThrow(
        new BadRequestException('You are already following this company'),
      );
    });

    it('should reject when the user already follows five companies', async () => {
      mockUserRepository.companyExists.mockResolvedValue(true);
      mockUserRepository.findUserCompanyFollowed.mockResolvedValue({
        companyFollowed: Array.from({ length: 5 }, () => new mongoose.Types.ObjectId()),
      } as any);

      await expect(service.followCompany(userId, companyId)).rejects.toThrow(
        new BadRequestException(
          'You can only follow up to 5 companies. Please unfollow a company first.',
        ),
      );
    });
  });

  describe('unfollowCompany', () => {
    it('should validate ids and unfollow a company for an existing user', async () => {
      mockUserRepository.removeFollowedCompany.mockResolvedValue({ matchedCount: 1 } as any);

      await service.unfollowCompany(userId, companyId);

      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(1, userId);
      expect(mockUserRepository.validateObjectId).toHaveBeenNthCalledWith(2, companyId);
      expect(mockUserRepository.removeFollowedCompany).toHaveBeenCalledWith(userId, companyId);
    });

    it('should reject when the user is not found', async () => {
      mockUserRepository.removeFollowedCompany.mockResolvedValue({ matchedCount: 0 } as any);

      await expect(service.unfollowCompany(userId, companyId)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });
  });

  describe('getFollowingCompanies', () => {
    it('should validate the id and return the populated companies with a total', async () => {
      const companies = [
        { _id: new mongoose.Types.ObjectId(), name: 'Company A' },
        { _id: new mongoose.Types.ObjectId(), name: 'Company B' },
      ];
      mockUserRepository.findUserWithFollowedCompanies.mockResolvedValue({
        companyFollowed: companies,
      } as any);

      const result = await service.getFollowingCompanies(userId);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        result: companies,
        total: 2,
      });
    });

    it('should reject when the user is not found', async () => {
      mockUserRepository.findUserWithFollowedCompanies.mockResolvedValue(null);

      await expect(service.getFollowingCompanies(userId)).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });
  });
});
