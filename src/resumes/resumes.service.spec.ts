import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ResumesService } from './resumes.service';
import { ResumeRepository } from './repositories/resume.repository';
import { ApplicationNotificationService } from './services/application-notification.service';
import { StatisticsCacheService } from 'src/statistics/statistics-cache.service';
import { ERole } from 'src/casl/enums/role.enum';
import { IUser } from 'src/users/user.interface';

const RESUME_ID = '507f1f77bcf86cd799439011';
const baseUser = {
  name: 'U',
  email: 'u@example.com',
  authProvider: 'local',
  hasPassword: true,
  savedJobs: [],
  companyFollowed: [],
};
const hr = (companyId?: string): IUser => ({
  ...baseUser,
  _id: 'hr-1',
  role: ERole.HR,
  company: companyId ? { _id: companyId, name: 'Acme' } : undefined,
});
const admin: IUser = { ...baseUser, _id: 'admin-1', role: ERole.SUPER_ADMIN };
const candidate = (id = 'cand-1'): IUser => ({ ...baseUser, _id: id, role: ERole.NORMAL_USER });
const resumeOf = (companyId: string, userId = 'cand-1') => ({
  _id: RESUME_ID,
  companyId: { toString: () => companyId },
  userId: { toString: () => userId },
});

describe('ResumesService', () => {
  let service: ResumesService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findPaginated: jest.fn().mockResolvedValue({ result: [], totalItems: 0, totalPages: 0 }),
      updateOne: jest.fn(),
      softDeleteById: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumesService,
        { provide: ResumeRepository, useValue: repo },
        { provide: ApplicationNotificationService, useValue: {} },
        {
          provide: StatisticsCacheService,
          useValue: { clearScopedDashboards: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(ResumesService);
  });

  describe('findAll', () => {
    it('rejects HR without a company instead of returning every resume', async () => {
      await expect(service.findAll(1, 10, {} as any, hr())).rejects.toThrow(ForbiddenException);
      expect(repo.findPaginated).not.toHaveBeenCalled();
    });

    it('drops filters outside the allowlist and forces the HR company', async () => {
      await service.findAll(
        1,
        10,
        { status: 'PENDING', companyId: 'other', password: 'x', $where: '1' } as any,
        hr('c1'),
      );

      const [filter] = repo.findPaginated.mock.calls[0];
      expect(filter).toEqual({ status: 'PENDING', companyId: 'c1' });
    });

    it('ignores client populate/fields and always populates company and job names', async () => {
      await service.findAll(
        1,
        10,
        { populate: 'userId', fields: 'parsedData,cvStructuredData' } as any,
        admin,
      );

      const [, , , , population, projection] = repo.findPaginated.mock.calls[0];
      expect(population).toEqual([
        { path: 'companyId', select: { name: 1 } },
        { path: 'jobId', select: { name: 1 } },
      ]);
      expect(projection).toBeUndefined();
    });

    it('keeps score range filters and escapes regex filters', async () => {
      await service.findAll(
        1,
        10,
        {
          email: '/(a+)+$/i',
          'aiAnalysis.matchingScore>': '50',
          'aiAnalysis.matchingScore<': '80',
        } as any,
        admin,
      );

      const [filter] = repo.findPaginated.mock.calls[0];
      // FE sends `aiAnalysis.matchingScore>=50`; Express splits it into key `...>` and value `50`.
      expect(filter['aiAnalysis.matchingScore']).toEqual({ $gte: 50, $lte: 80 });
      expect(filter.email).toBeInstanceOf(RegExp);
      expect(filter.email.source).toBe('\\(a\\+\\)\\+\\$');
      expect(filter.email.flags).toBe('i');
    });

    it('drops non-comparison operators and top-level operators from the JSON filter param', async () => {
      await service.findAll(
        1,
        10,
        {
          filter: JSON.stringify({ status: { $regex: '(a+)+$', $gte: 'A' }, $or: [{ x: 1 }] }),
        } as any,
        admin,
      );

      const [filter] = repo.findPaginated.mock.calls[0];
      expect(filter).toEqual({ status: { $gte: 'A' } });
    });
  });

  describe('findOne', () => {
    it('rejects HR without a company', async () => {
      repo.findById.mockResolvedValue(resumeOf('c1'));
      await expect(service.findOne(RESUME_ID, hr())).rejects.toThrow(ForbiddenException);
    });

    it('rejects HR of another company', async () => {
      repo.findById.mockResolvedValue(resumeOf('c2'));
      await expect(service.findOne(RESUME_ID, hr('c1'))).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update / remove', () => {
    it('rejects HR without a company on update', async () => {
      repo.findById.mockResolvedValue(resumeOf('c1'));
      await expect(service.update(RESUME_ID, { status: 'APPROVED' } as any, hr())).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.updateOne).not.toHaveBeenCalled();
    });

    it('rejects HR without a company on remove', async () => {
      repo.findById.mockResolvedValue(resumeOf('c1'));
      await expect(service.remove(RESUME_ID, hr())).rejects.toThrow(ForbiddenException);
      expect(repo.softDeleteById).not.toHaveBeenCalled();
    });
  });

  describe('findOneForRead', () => {
    beforeEach(() => repo.findById.mockResolvedValue(resumeOf('c1', 'cand-1')));

    it('allows the owner', async () => {
      await expect(service.findOneForRead(RESUME_ID, candidate('cand-1'))).resolves.toBeDefined();
    });

    it('allows HR of the same company', async () => {
      await expect(service.findOneForRead(RESUME_ID, hr('c1'))).resolves.toBeDefined();
    });

    it('allows SUPER_ADMIN', async () => {
      await expect(service.findOneForRead(RESUME_ID, admin)).resolves.toBeDefined();
    });

    it('rejects HR of another company', async () => {
      await expect(service.findOneForRead(RESUME_ID, hr('c2'))).rejects.toThrow(ForbiddenException);
    });

    it('rejects another candidate', async () => {
      await expect(service.findOneForRead(RESUME_ID, candidate('cand-2'))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
