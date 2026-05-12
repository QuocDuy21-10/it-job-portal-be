import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { buildEmbeddedCompanyIdFilter } from 'src/companies/company-snapshot.util';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { EResumeStatus } from 'src/resumes/enums/resume-status.enum';
import { Resume, ResumeDocument } from 'src/resumes/schemas/resume.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { DATE_FORMATS, LIMITS, TIME_RANGES } from './constants/statistics.constants';
import {
  AdminDashboardStatsDto,
  HrDashboardStatsDto,
  ResumeProcessingHealthDto,
  StatusCountDto,
  TopJobApplicationsDto,
  TopSkillDemandDto,
  TrendPointDto,
} from './dto/dashboard-stats.dto';
import { StatisticsCacheService } from './statistics-cache.service';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);
  private readonly resumeStatusOrder = [
    EResumeStatus.PENDING,
    EResumeStatus.REVIEWING,
    EResumeStatus.INTERVIEWING,
    EResumeStatus.APPROVED,
    EResumeStatus.REJECTED,
  ];

  constructor(
    @InjectModel(Job.name)
    private readonly jobModel: Model<JobDocument>,
    @InjectModel(Resume.name)
    private readonly resumeModel: Model<ResumeDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly statisticsCacheService: StatisticsCacheService,
  ) {}

  async getAdminDashboardStats(): Promise<AdminDashboardStatsDto> {
    const startTime = Date.now();
    const cachedData =
      await this.statisticsCacheService.getAdminDashboard<AdminDashboardStatsDto>();

    if (cachedData) {
      this.logger.debug(`Admin dashboard stats served from cache in ${Date.now() - startTime}ms`);
      return this.hydrateCachedDashboard(cachedData);
    }

    const [
      countJobs24h,
      countActiveJobs,
      countPendingApprovalJobs,
      countHiringCompanies,
      countCompanies,
      countUsers,
      jobTrend,
      applicationTrend,
      topDemandedSkills,
      resumeProcessingHealth,
    ] = await Promise.all([
      this.getJobsLast24Hours(),
      this.getApprovedActiveJobsCount(),
      this.getPendingApprovalJobsCount(),
      this.getHiringCompaniesCount(),
      this.getCompaniesCount(),
      this.getUsersCount(),
      this.getJobTrendLast7Days(),
      this.getApplicationTrendLast7Days(),
      this.getTopDemandedSkills(),
      this.getResumeProcessingHealth(),
    ]);

    const stats: AdminDashboardStatsDto = {
      countJobs24h,
      countActiveJobs,
      countPendingApprovalJobs,
      countHiringCompanies,
      countCompanies,
      countUsers,
      jobTrend,
      applicationTrend,
      topDemandedSkills,
      resumeProcessingHealth,
      generatedAt: new Date(),
      fromCache: false,
    };

    await this.statisticsCacheService.setAdminDashboard(stats);

    this.logger.log(`Admin dashboard stats computed and cached in ${Date.now() - startTime}ms`);

    return stats;
  }

  async getHrDashboardStats(companyId?: string): Promise<HrDashboardStatsDto> {
    if (!companyId) {
      throw new ForbiddenException('HR user must be associated with a company');
    }

    const startTime = Date.now();
    const cachedData =
      await this.statisticsCacheService.getHrDashboard<HrDashboardStatsDto>(companyId);

    if (cachedData) {
      this.logger.debug(`HR dashboard stats served from cache in ${Date.now() - startTime}ms`);
      return this.hydrateCachedDashboard(cachedData);
    }

    const [
      countActiveJobs,
      countPendingApprovalJobs,
      countExpiredJobs,
      totalApplications,
      countApplications24h,
      applicationStatusDistribution,
      applicationTrend,
      topJobsByApplications,
      responseRate,
      averageFirstResponseHours,
      averageMatchingScore,
    ] = await Promise.all([
      this.getApprovedActiveJobsCount(companyId),
      this.getPendingApprovalJobsCount(companyId),
      this.getExpiredJobsCount(companyId),
      this.getTotalApplications(companyId),
      this.getApplicationsLast24Hours(companyId),
      this.getApplicationStatusDistribution(companyId),
      this.getApplicationTrendLast7Days(companyId),
      this.getTopJobsByApplications(companyId),
      this.getResponseRate(companyId),
      this.getAverageFirstResponseHours(companyId),
      this.getAverageMatchingScore(companyId),
    ]);

    const stats: HrDashboardStatsDto = {
      countActiveJobs,
      countPendingApprovalJobs,
      countExpiredJobs,
      totalApplications,
      countApplications24h,
      applicationStatusDistribution,
      applicationTrend,
      topJobsByApplications,
      responseRate,
      averageFirstResponseHours,
      averageMatchingScore,
      generatedAt: new Date(),
      fromCache: false,
    };

    await this.statisticsCacheService.setHrDashboard(companyId, stats);

    this.logger.log(`HR dashboard stats computed and cached in ${Date.now() - startTime}ms`);

    return stats;
  }

  async clearAdminDashboardCache(): Promise<void> {
    await this.statisticsCacheService.clearAdminDashboard();
  }

  async clearHrDashboardCache(companyId: string): Promise<void> {
    await this.statisticsCacheService.clearHrDashboard(companyId);
  }

  async clearScopedDashboardCaches(companyId?: string): Promise<void> {
    await this.statisticsCacheService.clearScopedDashboards(companyId);
  }

  async clearHrDashboardCaches(companyIds: string[]): Promise<void> {
    await this.statisticsCacheService.clearHrDashboards(companyIds);
  }

  private hydrateCachedDashboard<T extends { generatedAt: Date | string; fromCache: boolean }>(
    cachedData: T,
  ): T {
    return {
      ...cachedData,
      generatedAt: new Date(cachedData.generatedAt),
      fromCache: true,
    };
  }

  private async getJobsLast24Hours(companyId?: string): Promise<number> {
    const last24Hours = new Date(Date.now() - TIME_RANGES.HOURS_24 * 60 * 60 * 1000);
    const match: Record<string, any> = {
      ...this.buildNonDeletedFilter(),
      createdAt: { $gte: last24Hours },
    };

    if (companyId) {
      Object.assign(match, buildEmbeddedCompanyIdFilter(companyId));
    }

    const result = await this.jobModel.aggregate([{ $match: match }, { $count: 'total' }]);

    return result[0]?.total || 0;
  }

  private async getApprovedActiveJobsCount(companyId?: string): Promise<number> {
    const result = await this.jobModel.aggregate([
      { $match: this.buildApprovedActiveJobsMatch(companyId) },
      { $count: 'total' },
    ]);

    return result[0]?.total || 0;
  }

  private async getPendingApprovalJobsCount(companyId?: string): Promise<number> {
    const result = await this.jobModel.aggregate([
      { $match: this.buildPendingApprovalJobsMatch(companyId) },
      { $count: 'total' },
    ]);

    return result[0]?.total || 0;
  }

  private async getExpiredJobsCount(companyId: string): Promise<number> {
    const result = await this.jobModel.aggregate([
      { $match: this.buildExpiredJobsMatch(companyId) },
      { $count: 'total' },
    ]);

    return result[0]?.total || 0;
  }

  private async getHiringCompaniesCount(): Promise<number> {
    const result = await this.jobModel.aggregate([
      { $match: this.buildApprovedActiveJobsMatch() },
      {
        $group: {
          _id: '$company._id',
        },
      },
      { $count: 'total' },
    ]);

    return result[0]?.total || 0;
  }

  private async getCompaniesCount(): Promise<number> {
    return this.companyModel.countDocuments(this.buildNonDeletedFilter());
  }

  private async getUsersCount(): Promise<number> {
    return this.userModel.countDocuments(this.buildNonDeletedFilter());
  }

  private async getJobTrendLast7Days(companyId?: string): Promise<TrendPointDto[]> {
    const last7Days = new Date(Date.now() - TIME_RANGES.DAYS_7 * 24 * 60 * 60 * 1000);
    const match: Record<string, any> = {
      ...this.buildNonDeletedFilter(),
      createdAt: { $gte: last7Days },
    };

    if (companyId) {
      Object.assign(match, buildEmbeddedCompanyIdFilter(companyId));
    }

    const result = await this.jobModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: DATE_FORMATS.ISO_DATE,
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          count: 1,
        },
      },
    ]);

    return this.fillMissingDates(result, TIME_RANGES.DAYS_7);
  }

  private async getApplicationTrendLast7Days(companyId?: string): Promise<TrendPointDto[]> {
    const last7Days = new Date(Date.now() - TIME_RANGES.DAYS_7 * 24 * 60 * 60 * 1000);

    const result = await this.resumeModel.aggregate([
      {
        $match: {
          ...this.buildResumeScopeMatch(companyId),
          createdAt: { $gte: last7Days },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: DATE_FORMATS.ISO_DATE,
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          count: 1,
        },
      },
    ]);

    return this.fillMissingDates(result, TIME_RANGES.DAYS_7);
  }

  private async getTopDemandedSkills(): Promise<TopSkillDemandDto[]> {
    return this.jobModel.aggregate([
      { $match: this.buildApprovedActiveJobsMatch() },
      { $unwind: '$skills' },
      {
        $group: {
          _id: '$skills',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      { $limit: LIMITS.TOP_SKILLS },
      {
        $project: {
          _id: 0,
          skill: '$_id',
          count: 1,
        },
      },
    ]);
  }

  private async getResumeProcessingHealth(): Promise<ResumeProcessingHealthDto> {
    const [result] = await this.resumeModel.aggregate([
      { $match: this.buildResumeScopeMatch() },
      {
        $group: {
          _id: null,
          totalResumes: { $sum: 1 },
          parsedResumes: {
            $sum: {
              $cond: [{ $eq: ['$isParsed', true] }, 1, 0],
            },
          },
          parseFailedResumes: {
            $sum: {
              $cond: [
                {
                  $gt: [{ $strLenCP: { $ifNull: ['$parseError', ''] } }, 0],
                },
                1,
                0,
              ],
            },
          },
          analyzedResumes: {
            $sum: {
              $cond: [{ $eq: ['$isAnalyzed', true] }, 1, 0],
            },
          },
          analysisFailedResumes: {
            $sum: {
              $cond: [
                {
                  $gt: [{ $strLenCP: { $ifNull: ['$analysisError', ''] } }, 0],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalResumes = result?.totalResumes ?? 0;
    const parsedResumes = result?.parsedResumes ?? 0;
    const parseFailedResumes = result?.parseFailedResumes ?? 0;
    const analyzedResumes = result?.analyzedResumes ?? 0;
    const analysisFailedResumes = result?.analysisFailedResumes ?? 0;

    return {
      totalResumes,
      parsedResumes,
      parseFailedResumes,
      parseSuccessRate:
        totalResumes === 0 ? 0 : this.roundNumber((parsedResumes / totalResumes) * 100),
      analyzedResumes,
      analysisFailedResumes,
      analysisSuccessRate:
        totalResumes === 0 ? 0 : this.roundNumber((analyzedResumes / totalResumes) * 100),
    };
  }

  private async getTotalApplications(companyId: string): Promise<number> {
    return this.resumeModel.countDocuments(this.buildResumeScopeMatch(companyId));
  }

  private async getApplicationsLast24Hours(companyId: string): Promise<number> {
    const last24Hours = new Date(Date.now() - TIME_RANGES.HOURS_24 * 60 * 60 * 1000);

    return this.resumeModel.countDocuments({
      ...this.buildResumeScopeMatch(companyId),
      createdAt: { $gte: last24Hours },
    });
  }

  private async getApplicationStatusDistribution(companyId: string): Promise<StatusCountDto[]> {
    const result = await this.resumeModel.aggregate([
      { $match: this.buildResumeScopeMatch(companyId) },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: '$_id',
          count: 1,
        },
      },
    ]);

    return this.fillMissingStatuses(result);
  }

  private async getTopJobsByApplications(companyId: string): Promise<TopJobApplicationsDto[]> {
    return this.resumeModel.aggregate([
      {
        $match: {
          ...this.buildResumeScopeMatch(companyId),
          jobId: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$jobId',
          applicationsCount: { $sum: 1 },
        },
      },
      { $sort: { applicationsCount: -1, _id: 1 } },
      { $limit: LIMITS.TOP_JOBS },
      {
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: '_id',
          as: 'job',
        },
      },
      {
        $unwind: {
          path: '$job',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          jobId: { $toString: '$_id' },
          jobName: {
            $ifNull: ['$job.name', 'Deleted job'],
          },
          applicationsCount: 1,
        },
      },
    ]);
  }

  private async getResponseRate(companyId: string): Promise<number> {
    const [result] = await this.resumeModel.aggregate([
      { $match: this.buildResumeScopeMatch(companyId) },
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          respondedApplications: {
            $sum: {
              $cond: [{ $ne: ['$status', EResumeStatus.PENDING] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!result?.totalApplications) {
      return 0;
    }

    return this.roundNumber((result.respondedApplications / result.totalApplications) * 100);
  }

  private async getAverageFirstResponseHours(companyId: string): Promise<number | null> {
    const [result] = await this.resumeModel.aggregate([
      { $match: this.buildResumeScopeMatch(companyId) },
      {
        $project: {
          createdAt: 1,
          firstResponseAt: {
            $min: {
              $map: {
                input: {
                  $filter: {
                    input: '$histories',
                    as: 'history',
                    cond: {
                      $ne: ['$$history.status', EResumeStatus.PENDING],
                    },
                  },
                },
                as: 'history',
                in: '$$history.updatedAt',
              },
            },
          },
        },
      },
      {
        $match: {
          firstResponseAt: { $ne: null },
        },
      },
      {
        $project: {
          responseHours: {
            $divide: [{ $subtract: ['$firstResponseAt', '$createdAt'] }, 1000 * 60 * 60],
          },
        },
      },
      {
        $group: {
          _id: null,
          averageFirstResponseHours: { $avg: '$responseHours' },
        },
      },
    ]);

    if (typeof result?.averageFirstResponseHours !== 'number') {
      return null;
    }

    return this.roundNumber(result.averageFirstResponseHours);
  }

  private async getAverageMatchingScore(companyId: string): Promise<number | null> {
    const [result] = await this.resumeModel.aggregate([
      {
        $match: {
          ...this.buildResumeScopeMatch(companyId),
          'aiAnalysis.matchingScore': { $gte: 0 },
        },
      },
      {
        $group: {
          _id: null,
          averageMatchingScore: { $avg: '$aiAnalysis.matchingScore' },
        },
      },
    ]);

    if (typeof result?.averageMatchingScore !== 'number') {
      return null;
    }

    return this.roundNumber(result.averageMatchingScore);
  }

  private buildNonDeletedFilter(): Record<string, any> {
    return {
      isDeleted: { $ne: true },
    };
  }

  private buildApprovedActiveJobsMatch(companyId?: string): Record<string, any> {
    const match: Record<string, any> = {
      ...this.buildNonDeletedFilter(),
      approvalStatus: EJobApprovalStatus.APPROVED,
      isActive: true,
      endDate: { $gt: new Date() },
    };

    if (companyId) {
      Object.assign(match, buildEmbeddedCompanyIdFilter(companyId));
    }

    return match;
  }

  private buildPendingApprovalJobsMatch(companyId?: string): Record<string, any> {
    const match: Record<string, any> = {
      ...this.buildNonDeletedFilter(),
      approvalStatus: EJobApprovalStatus.PENDING,
    };

    if (companyId) {
      Object.assign(match, buildEmbeddedCompanyIdFilter(companyId));
    }

    return match;
  }

  private buildExpiredJobsMatch(companyId: string): Record<string, any> {
    return {
      ...this.buildNonDeletedFilter(),
      approvalStatus: EJobApprovalStatus.APPROVED,
      endDate: { $lte: new Date() },
      ...buildEmbeddedCompanyIdFilter(companyId),
    };
  }

  private buildResumeScopeMatch(companyId?: string): Record<string, any> {
    const match: Record<string, any> = {
      ...this.buildNonDeletedFilter(),
    };

    if (companyId) {
      match.companyId = this.toObjectId(companyId);
    }

    return match;
  }

  private fillMissingDates(data: TrendPointDto[], days: number): TrendPointDto[] {
    const dateMap = new Map(data.map(item => [item.date, item.count]));
    const result: TrendPointDto[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dateMap.get(dateStr) || 0,
      });
    }

    return result;
  }

  private fillMissingStatuses(data: StatusCountDto[]): StatusCountDto[] {
    const countByStatus = new Map(data.map(item => [item.status, item.count]));

    return this.resumeStatusOrder.map(status => ({
      status,
      count: countByStatus.get(status) || 0,
    }));
  }

  private roundNumber(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toObjectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }
}
