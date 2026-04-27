import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobRepository } from './repositories/job.repository';
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';
import { JobExpirationQueueService } from 'src/queues/services/job-expiration-queue.service';
import { EJobApprovalStatus } from './enums/job-approval-status.enum';
import { IUser } from 'src/users/user.interface';
import { SkillsService } from 'src/skills/skills.service';

const hrUser = (companyId: string): IUser => ({
  _id: 'user-hr-1',
  name: 'Henry HR',
  email: 'henry@example.com',
  authProvider: 'local',
  hasPassword: true,
  role: { _id: 'role-hr', name: 'HR' },
  company: { _id: companyId, name: 'Acme' },
  savedJobs: [],
  companyFollowed: [],
});

const superAdminUser = (): IUser => ({
  _id: 'user-admin-1',
  name: 'Admin',
  email: 'admin@example.com',
  authProvider: 'local',
  hasPassword: true,
  role: { _id: 'role-sa', name: 'SUPER ADMIN' },
  savedJobs: [],
  companyFollowed: [],
});

const publicUser = (): IUser | undefined => undefined;

const activeApprovedJob = (companyId = 'company-1') => ({
  _id: 'job-1',
  name: 'Backend Dev',
  company: { _id: companyId, name: 'Acme' },
  approvalStatus: EJobApprovalStatus.APPROVED,
  isActive: true,
  endDate: new Date(Date.now() + 86400 * 1000), // tomorrow
  createdBy: { email: 'hr@acme.com' },
});

describe('JobsService', () => {
  let service: JobsService;
  let mockJobRepository: jest.Mocked<Partial<JobRepository>>;
  let mockSkillsService: jest.Mocked<Partial<SkillsService>>;
  let mockCompanyFollowerQueueService: jest.Mocked<Partial<CompanyFollowerQueueService>>;
  let mockJobExpirationQueueService: jest.Mocked<Partial<JobExpirationQueueService>>;

  beforeEach(async () => {
    mockJobRepository = {
      validateObjectId: jest.fn(),
      findById: jest.fn(),
      findPaginated: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
      updateMany: jest.fn(),
      softDeleteById: jest.fn(),
      countDocuments: jest.fn(),
      countJobsOwnedByCompany: jest.fn(),
      bulkSoftDelete: jest.fn(),
      findLean: jest.fn(),
      findExpiredJobsLean: jest.fn(),
      aggregate: jest.fn(),
      getCompanySnapshot: jest.fn(),
    };

    mockCompanyFollowerQueueService = {
      addNewJobNotification: jest.fn().mockResolvedValue(undefined),
    };

    mockSkillsService = {
      normalizeControlledSkills: jest.fn().mockImplementation(async skills => skills ?? []),
    };

    mockJobExpirationQueueService = {
      addExpiredJobNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: JobRepository, useValue: mockJobRepository },
        { provide: SkillsService, useValue: mockSkillsService },
        { provide: CompanyFollowerQueueService, useValue: mockCompanyFollowerQueueService },
        { provide: JobExpirationQueueService, useValue: mockJobExpirationQueueService },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  describe('findAll', () => {
    const paginatedResponse = (items: any[], total = items.length) => ({
      result: items,
      totalItems: total,
      totalPages: Math.ceil(total / 10),
    });

    it('HR users only receive jobs scoped to their own company', async () => {
      const companyId = '507f1f77bcf86cd799439041';
      mockJobRepository.findPaginated.mockResolvedValue(
        paginatedResponse([activeApprovedJob(companyId)]),
      );

      await service.findAll(1, 10, '', hrUser(companyId));

      const passedFilter = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0][0];
      // The HR company ID filter must be present
      expect(passedFilter['company._id']).toBeDefined();
    });

    it('public users receive only APPROVED active non-expired jobs filter', async () => {
      mockJobRepository.findPaginated.mockResolvedValue(paginatedResponse([]));

      await service.findAll(1, 10, '', publicUser());

      const passedFilter = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0][0];
      expect(passedFilter.isActive).toBe(true);
      expect(passedFilter.approvalStatus).toBe(EJobApprovalStatus.APPROVED);
    });

    it('SUPER_ADMIN sees all jobs without visibility filter', async () => {
      mockJobRepository.findPaginated.mockResolvedValue(paginatedResponse([]));

      await service.findAll(1, 10, '', superAdminUser());

      const passedFilter = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0][0];
      expect(passedFilter.isActive).toBeUndefined();
      expect(passedFilter.approvalStatus).toBeUndefined();
    });

    it('strips dangerous operators from the query string', async () => {
      mockJobRepository.findPaginated.mockResolvedValue(paginatedResponse([]));

      // Simulate aqp parsing that would produce a $where operator
      await service.findAll(1, 10, '$where=1==1', publicUser());

      const passedFilter = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0][0];
      expect(passedFilter['$where']).toBeUndefined();
    });

    it('strips fields not in the allowlist', async () => {
      mockJobRepository.findPaginated.mockResolvedValue(paginatedResponse([]));

      await service.findAll(1, 10, 'unknownField=xyz', publicUser());

      const passedFilter = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0][0];
      expect(passedFilter['unknownField']).toBeUndefined();
    });

    it('uses safe defaults when page/limit are not numbers', async () => {
      mockJobRepository.findPaginated.mockResolvedValue(paginatedResponse([]));

      await service.findAll(NaN, NaN, '', publicUser());

      const [, offset, limit] = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0];
      expect(offset).toBe(0);
      expect(limit).toBe(10);
    });

    it('returns correct pagination meta', async () => {
      mockJobRepository.findPaginated.mockResolvedValue({
        result: [],
        totalItems: 25,
        totalPages: 3,
      });

      const response = await service.findAll(2, 10, '', publicUser());

      expect(response.meta.pagination.total).toBe(25);
      expect(response.meta.pagination.total_pages).toBe(3);
    });

    it('normalizes skill filters through the catalog before querying', async () => {
      mockJobRepository.findPaginated.mockResolvedValue(paginatedResponse([]));
      mockSkillsService.normalizeControlledSkills.mockResolvedValue(['TypeScript']);

      await service.findAll(1, 10, 'skills=typescript', publicUser());

      expect(mockSkillsService.normalizeControlledSkills).toHaveBeenCalledWith(['typescript']);
      const passedFilter = (mockJobRepository.findPaginated as jest.Mock).mock.calls[0][0];
      expect(passedFilter.skills).toEqual({ $in: ['TypeScript'] });
    });
  });

  describe('findOne', () => {
    it('returns null for a non-approved job when viewed by a public user', async () => {
      mockJobRepository.findById.mockResolvedValue({
        ...activeApprovedJob(),
        approvalStatus: EJobApprovalStatus.PENDING,
      } as any);

      const result = await service.findOne('job-1', publicUser());
      expect(result).toBeNull();
    });

    it('returns null for an inactive job when viewed by a public user', async () => {
      mockJobRepository.findById.mockResolvedValue({
        ...activeApprovedJob(),
        isActive: false,
      } as any);

      const result = await service.findOne('job-1', publicUser());
      expect(result).toBeNull();
    });

    it('throws BadRequestException when HR views a job of another company', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('other-company') as any);

      await expect(service.findOne('job-1', hrUser('my-company'))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('SUPER_ADMIN can view any job regardless of status', async () => {
      const pendingJob = { ...activeApprovedJob(), approvalStatus: EJobApprovalStatus.PENDING };
      mockJobRepository.findById.mockResolvedValue(pendingJob as any);

      const result = await service.findOne('job-1', superAdminUser());
      expect(result).toEqual(pendingJob);
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when HR updates a job of another company', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('other-company') as any);

      await expect(
        service.update('job-1', { name: 'Updated' } as any, hrUser('my-company')),
      ).rejects.toThrow(ForbiddenException);

      expect(mockJobRepository.updateOne).not.toHaveBeenCalled();
    });

    it('allows HR to update their own company job', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('my-company') as any);
      mockJobRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);

      await service.update('job-1', { name: 'Updated' } as any, hrUser('my-company'));

      expect(mockJobRepository.updateOne).toHaveBeenCalledWith(
        { _id: 'job-1' },
        expect.objectContaining({ name: 'Updated' }),
      );
    });

    it('allows SUPER_ADMIN to update any job', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('some-company') as any);
      mockJobRepository.updateOne.mockResolvedValue({ modifiedCount: 1 } as any);

      await service.update('job-1', { name: 'Updated by admin' } as any, superAdminUser());

      expect(mockJobRepository.updateOne).toHaveBeenCalled();
    });

    it('throws NotFoundException when the job does not exist', async () => {
      mockJobRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('job-1', { name: 'X' } as any, hrUser('my-company')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException when HR deletes a job of another company', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('other-company') as any);

      await expect(service.remove('job-1', hrUser('my-company'))).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockJobRepository.softDeleteById).not.toHaveBeenCalled();
    });

    it('allows HR to delete their own company job', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('my-company') as any);
      mockJobRepository.softDeleteById.mockResolvedValue({ deleted: 1 } as any);

      await service.remove('job-1', hrUser('my-company'));

      expect(mockJobRepository.softDeleteById).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ email: 'henry@example.com' }),
      );
    });

    it('allows SUPER_ADMIN to delete any job', async () => {
      mockJobRepository.findById.mockResolvedValue(activeApprovedJob('some-company') as any);
      mockJobRepository.softDeleteById.mockResolvedValue({ deleted: 1 } as any);

      await service.remove('job-1', superAdminUser());

      expect(mockJobRepository.softDeleteById).toHaveBeenCalled();
    });

    it('throws NotFoundException when the job does not exist', async () => {
      mockJobRepository.findById.mockResolvedValue(null);

      await expect(service.remove('job-1', hrUser('my-company'))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('bulkRemove', () => {
    it('throws ForbiddenException when HR attempts to delete jobs from another company', async () => {
      // Fewer owned jobs than requested
      mockJobRepository.countJobsOwnedByCompany.mockResolvedValue(1);

      await expect(service.bulkRemove(['job-1', 'job-2'], hrUser('my-company'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows HR to bulk-delete their own jobs', async () => {
      mockJobRepository.countJobsOwnedByCompany.mockResolvedValue(2);
      mockJobRepository.bulkSoftDelete.mockResolvedValue({ deleted: 2, failed: [] } as any);

      await service.bulkRemove(['job-1', 'job-2'], hrUser('my-company'));

      expect(mockJobRepository.bulkSoftDelete).toHaveBeenCalled();
    });

    it('SUPER_ADMIN bulk-deletes without company check', async () => {
      mockJobRepository.bulkSoftDelete.mockResolvedValue({ deleted: 3, failed: [] } as any);

      await service.bulkRemove(['job-1', 'job-2', 'job-3'], superAdminUser());

      expect(mockJobRepository.countJobsOwnedByCompany).not.toHaveBeenCalled();
      expect(mockJobRepository.bulkSoftDelete).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('returns _id and createdAt on success', async () => {
      const fakeJob = { _id: 'new-job', createdAt: new Date(), company: { _id: 'c1', name: 'X' } };
      mockSkillsService.normalizeControlledSkills.mockResolvedValue(['TypeScript', 'NestJS']);
      mockJobRepository.getCompanySnapshot.mockResolvedValue({ _id: 'c1', name: 'X' } as any);
      mockJobRepository.create.mockResolvedValue(fakeJob as any);

      const result = await service.create(
        { company: { _id: 'c1' }, skills: ['typescript', 'nestjs'] } as any,
        hrUser('c1'),
      );

      expect(mockSkillsService.normalizeControlledSkills).toHaveBeenCalledWith([
        'typescript',
        'nestjs',
      ]);
      expect(mockJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ skills: ['TypeScript', 'NestJS'] }),
      );
      expect(result._id).toBe('new-job');
    });

    it('logs an error but does not reject when queue notification fails', async () => {
      const fakeJob = { _id: 'j1', createdAt: new Date(), company: { _id: 'c1', name: 'X' } };
      mockJobRepository.getCompanySnapshot.mockResolvedValue({ _id: 'c1', name: 'X' } as any);
      mockJobRepository.create.mockResolvedValue(fakeJob as any);
      mockCompanyFollowerQueueService.addNewJobNotification.mockRejectedValue(
        new Error('Queue down'),
      );

      await expect(
        service.create({ company: { _id: 'c1' } } as any, hrUser('c1')),
      ).resolves.toBeDefined();
    });
  });
});
