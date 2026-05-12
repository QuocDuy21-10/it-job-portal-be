import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Company } from 'src/companies/schemas/company.schema';
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

    statisticsCacheService = {
      getAdminDashboard: jest.fn(),
      setAdminDashboard: jest.fn(),
      getHrDashboard: jest.fn(),
      setHrDashboard: jest.fn(),
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
      statisticsCacheService.getAdminDashboard.mockResolvedValue({
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
      });

      const result = await service.getAdminDashboardStats();

      expect(result.fromCache).toBe(true);
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.generatedAt.toISOString()).toBe('2026-05-11T08:30:00.000Z');
      expect(jobModel.aggregate).not.toHaveBeenCalled();
      expect(resumeModel.aggregate).not.toHaveBeenCalled();
      expect(statisticsCacheService.setAdminDashboard).not.toHaveBeenCalled();
    });

    it('computes admin stats on cache miss and fills missing trend days', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00.000Z'));
      statisticsCacheService.getAdminDashboard.mockResolvedValue(undefined);

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
      expect(statisticsCacheService.setAdminDashboard).toHaveBeenCalledWith(
        expect.objectContaining({
          countJobs24h: 4,
          countActiveJobs: 9,
        }),
      );
    });
  });

  describe('getHrDashboardStats', () => {
    it('throws when the HR user has no company scope', async () => {
      await expect(service.getHrDashboardStats()).rejects.toThrow(ForbiddenException);
    });

    it('computes HR stats, fills missing statuses, and rounds derived metrics', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:00:00.000Z'));
      statisticsCacheService.getHrDashboard.mockResolvedValue(undefined);

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

      expect(statisticsCacheService.getHrDashboard).toHaveBeenCalledWith(companyId);
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
      expect(statisticsCacheService.setHrDashboard).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          responseRate: 58.33,
          averageMatchingScore: 76.44,
        }),
      );
    });
  });
});
