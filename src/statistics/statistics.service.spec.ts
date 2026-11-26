import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ERole } from 'src/casl/enums/role.enum';
import { Company } from 'src/companies/schemas/company.schema';
import { ExternalJob } from 'src/job-ingestion/schemas/external-job.schema';
import { JobSource } from 'src/job-ingestion/schemas/job-source.schema';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { Job } from 'src/jobs/schemas/job.schema';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { Resume } from 'src/resumes/schemas/resume.schema';
import { User } from 'src/users/schemas/user.schema';
import { StatisticsCacheService } from './statistics-cache.service';
import { StatisticsService } from './statistics.service';

describe('StatisticsService', () => {
  let service: StatisticsService;
  let jobModel: { aggregate: jest.Mock };
  let resumeModel: { aggregate: jest.Mock; countDocuments: jest.Mock };
  let companyModel: { countDocuments: jest.Mock };
  let userModel: { countDocuments: jest.Mock };
  let externalJobModel: { aggregate: jest.Mock };
  let jobSourceModel: { distinct: jest.Mock };
  let statisticsCacheService: jest.Mocked<StatisticsCacheService>;

  beforeEach(async () => {
    jobModel = {
      aggregate: jest.fn(),
    };

    resumeModel = {
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
    };

    companyModel = {
      countDocuments: jest.fn(),
    };

    userModel = {
      countDocuments: jest.fn(),
    };

    externalJobModel = {
      aggregate: jest.fn(),
    };

    jobSourceModel = {
      distinct: jest.fn(),
    };

    statisticsCacheService = {
      getOrSetAdminDashboard: jest.fn(async loader => ({
        value: await loader(),
        fromCache: false,
      })),
      getOrSetHrDashboard: jest.fn(async (_companyId, loader) => ({
        value: await loader(),
        fromCache: false,
      })),
      getOrSetPublicStats: jest.fn(async loader => ({
        value: await loader(),
        fromCache: false,
      })),
      clearAdminDashboard: jest.fn(),
      clearHrDashboard: jest.fn(),
      clearScopedDashboards: jest.fn(),
      clearHrDashboards: jest.fn(),
    } as unknown as jest.Mocked<StatisticsCacheService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        {
          provide: getModelToken(Job.name),
          useValue: jobModel,
        },
        {
          provide: getModelToken(Resume.name),
          useValue: resumeModel,
        },
        {
          provide: getModelToken(Company.name),
          useValue: companyModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: getModelToken(ExternalJob.name),
          useValue: externalJobModel,
        },
        {
          provide: getModelToken(JobSource.name),
          useValue: jobSourceModel,
        },
        {
          provide: StatisticsCacheService,
          useValue: statisticsCacheService,
        },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getAdminDashboardStats', () => {
    it('returns cached admin stats and marks them as cached', async () => {
      (statisticsCacheService.getOrSetAdminDashboard as jest.Mock).mockResolvedValue({
        value: {
          countJobs24h: 4,
          countActiveJobs: 9,
          countPendingApprovalJobs: 2,
          countHiringCompanies: 3,
          countCompanies: 7,
          countUsers: 13,
          jobTrend: [],
          applicationTrend: [],
          topDemandedSkills: [],
          resumeProcessingHealth: {
            totalResumes: 20,
            parsedResumes: 16,
            parseFailedResumes: 2,
            parseSuccessRate: 80,
            analyzedResumes: 14,
            analysisFailedResumes: 1,
            analysisSuccessRate: 70,
          },
          generatedAt: '2026-05-11T08:30:00.000Z',
          fromCache: false,
        },
        fromCache: true,
      });

      const result = await service.getAdminDashboardStats();

      expect(result.fromCache).toBe(true);
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.generatedAt.toISOString()).toBe('2026-05-11T08:30:00.000Z');
      expect(jobModel.aggregate).not.toHaveBeenCalled();
      expect(resumeModel.aggregate).not.toHaveBeenCalled();
      expect(resumeModel.countDocuments).not.toHaveBeenCalled();
    });

    it('computes admin stats on cache miss and fills missing trend days', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00.000Z'));

      jobModel.aggregate
        .mockResolvedValueOnce([{ total: 4 }])
        .mockResolvedValueOnce([{ total: 9 }])
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([{ date: '2026-05-09', count: 2 }])
        .mockResolvedValueOnce([{ skill: 'nestjs', count: 10 }]);

      resumeModel.aggregate
        .mockResolvedValueOnce([{ date: '2026-05-11', count: 5 }])
        .mockResolvedValueOnce([
          {
            totalResumes: 20,
            parsedResumes: 16,
            parseFailedResumes: 2,
            analyzedResumes: 14,
            analysisFailedResumes: 1,
          },
        ]);

      companyModel.countDocuments.mockResolvedValue(7);
      userModel.countDocuments.mockResolvedValue(13);

      const result = await service.getAdminDashboardStats();

      expect(result.countJobs24h).toBe(4);
      expect(result.countActiveJobs).toBe(9);
      expect(result.countPendingApprovalJobs).toBe(2);
      expect(result.countHiringCompanies).toBe(3);
      expect(result.countCompanies).toBe(7);
      expect(result.countUsers).toBe(13);
      expect(result.jobTrend).toHaveLength(7);
      expect(result.jobTrend.find(item => item.date === '2026-05-09')).toEqual({
        date: '2026-05-09',
        count: 2,
      });
      expect(result.jobTrend.find(item => item.date === '2026-05-10')).toEqual({
        date: '2026-05-10',
        count: 0,
      });
      expect(result.applicationTrend).toHaveLength(7);
      expect(result.applicationTrend.find(item => item.date === '2026-05-11')).toEqual({
        date: '2026-05-11',
        count: 5,
      });
      expect(result.resumeProcessingHealth.parseSuccessRate).toBe(80);
      expect(result.resumeProcessingHealth.analysisSuccessRate).toBe(70);
      expect(result.fromCache).toBe(false);
      expect(statisticsCacheService.getOrSetAdminDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHrDashboardStats', () => {
    it('throws when the HR user has no company scope', async () => {
      await expect(service.getHrDashboardStats()).rejects.toThrow(ForbiddenException);
    });

    it('computes HR stats, fills missing statuses, and rounds derived metrics', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00.000Z'));

      jobModel.aggregate
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ total: 4 }]);

      resumeModel.countDocuments.mockResolvedValueOnce(12).mockResolvedValueOnce(3);

      resumeModel.aggregate
        .mockResolvedValueOnce([
          { status: EResumeStatus.PENDING, count: 5 },
          { status: EResumeStatus.APPROVED, count: 2 },
        ])
        .mockResolvedValueOnce([{ date: '2026-05-10', count: 6 }])
        .mockResolvedValueOnce([
          { jobId: 'job-1', jobName: 'Backend Developer', applicationsCount: 8 },
        ])
        .mockResolvedValueOnce([{ totalApplications: 12, respondedApplications: 7 }])
        .mockResolvedValueOnce([{ averageFirstResponseHours: 14.236 }])
        .mockResolvedValueOnce([{ averageMatchingScore: 76.444 }]);

      const companyId = '507f1f77bcf86cd799439011';
      const result = await service.getHrDashboardStats(companyId);

      expect(statisticsCacheService.getOrSetHrDashboard).toHaveBeenCalledWith(
        companyId,
        expect.any(Function),
      );
      expect(result.countActiveJobs).toBe(2);
      expect(result.countPendingApprovalJobs).toBe(1);
      expect(result.countExpiredJobs).toBe(4);
      expect(result.totalApplications).toBe(12);
      expect(result.countApplications24h).toBe(3);
      expect(result.applicationStatusDistribution).toEqual([
        { status: EResumeStatus.PENDING, count: 5 },
        { status: EResumeStatus.REVIEWING, count: 0 },
        { status: EResumeStatus.INTERVIEWING, count: 0 },
        { status: EResumeStatus.APPROVED, count: 2 },
        { status: EResumeStatus.REJECTED, count: 0 },
      ]);
      expect(result.applicationTrend).toHaveLength(7);
      expect(result.responseRate).toBe(58.33);
      expect(result.averageFirstResponseHours).toBe(14.24);
      expect(result.averageMatchingScore).toBe(76.44);
    });
  });

  describe('getPublicStats', () => {
    const total = (n: number) => [{ total: n }];

    beforeEach(() => {
      jobSourceModel.distinct.mockResolvedValue(['hidden-src']);
      // Internal: the $group pipeline is hiring companies, a createdAt match is the 7-day window.
      jobModel.aggregate.mockImplementation(async (pipeline: any[]) => {
        if (pipeline.some(stage => '$group' in stage)) return total(2);
        return pipeline[0].$match.createdAt ? total(1) : total(3);
      });
      // External: the 7-day window adds a second $and condition.
      externalJobModel.aggregate.mockImplementation(async (pipeline: any[]) =>
        pipeline[0].$match.$and.length > 1 ? total(4) : total(5),
      );
      userModel.countDocuments.mockResolvedValue(7);
    });

    it('adds external jobs to internal ones and returns the four counts', async () => {
      await expect(service.getPublicStats()).resolves.toEqual({
        activeJobs: 8,
        newJobsThisWeek: 5,
        hiringCompanies: 2,
        candidates: 7,
      });
    });

    it('counts only publicly visible internal jobs', async () => {
      await service.getPublicStats();

      expect(jobModel.aggregate).toHaveBeenCalledTimes(3);
      for (const [pipeline] of jobModel.aggregate.mock.calls) {
        expect(pipeline[0].$match).toMatchObject({
          isActive: true,
          approvalStatus: EJobApprovalStatus.APPROVED,
          isDeleted: { $ne: true },
        });
      }
    });

    it('leaves out hidden sources and closed or removed external jobs', async () => {
      await service.getPublicStats();

      expect(externalJobModel.aggregate).toHaveBeenCalledTimes(2);
      for (const [pipeline] of externalJobModel.aggregate.mock.calls) {
        expect(pipeline[0].$match).toMatchObject({
          sourceKey: { $nin: ['hidden-src'] },
          status: { $in: ['ACTIVE', 'STALE'] },
          removedAt: null,
        });
      }
    });

    it('dates an external job by publishedAt, falling back to createdAt', async () => {
      await service.getPublicStats();

      const windowed = externalJobModel.aggregate.mock.calls
        .map(([pipeline]) => pipeline[0].$match)
        .find(match => match.$and.length > 1);

      expect(windowed.$and[windowed.$and.length - 1]).toEqual({
        $or: [
          { publishedAt: { $gte: expect.any(Date) } },
          { publishedAt: null, createdAt: { $gte: expect.any(Date) } },
        ],
      });
    });

    it('counts candidates only', async () => {
      await service.getPublicStats();

      expect(userModel.countDocuments).toHaveBeenCalledWith({
        isDeleted: { $ne: true },
        role: ERole.NORMAL_USER,
      });
    });

    it('serves a cached value without querying', async () => {
      const cached = { activeJobs: 1, newJobsThisWeek: 0, hiringCompanies: 1, candidates: 1 };
      statisticsCacheService.getOrSetPublicStats.mockResolvedValueOnce({
        value: cached,
        fromCache: true,
      });

      await expect(service.getPublicStats()).resolves.toEqual(cached);
      expect(jobModel.aggregate).not.toHaveBeenCalled();
      expect(externalJobModel.aggregate).not.toHaveBeenCalled();
    });
  });
});
