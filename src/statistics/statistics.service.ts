import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { DashboardStatsDto, SalaryDistributionDto, JobTrendDto } from './dto/dashboard-stats.dto';
import {
  CACHE_KEYS,
  CACHE_TTL,
  SALARY_RANGES,
  TIME_RANGES,
  DATE_FORMATS,
} from './constants/statistics.constants';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(
    @InjectModel(Job.name)
    private jobModel: Model<JobDocument>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {}

  /**
   * Get comprehensive dashboard statistics
   * Implements caching strategy with 15-minute TTL
   */
  async getDashboardStats(): Promise<DashboardStatsDto> {
    const startTime = Date.now();

    // Step 1: Check cache
    const cachedData = await this.cacheManager.get<DashboardStatsDto>(
      CACHE_KEYS.DASHBOARD_STATS,
    );

    if (cachedData) {
      this.logger.debug(
        `Dashboard stats served from cache in ${Date.now() - startTime}ms`,
      );
      return {
        ...cachedData,
        fromCache: true,
      };
    }

    // Step 2: Compute statistics using parallel aggregations
    this.logger.log('Computing dashboard statistics...');

    const [
      countJobs24h,
      countActiveJobs,
      countHiringCompanies,
      salaryDistribution,
      jobTrend,
    ] = await Promise.all([
      this.getJobsLast24Hours(),
      this.getActiveJobsCount(),
      this.getHiringCompaniesCount(),
      this.getSalaryDistribution(),
      this.getJobTrendLast7Days(),
    ]);

    const stats: DashboardStatsDto = {
      countJobs24h,
      countActiveJobs,
      countHiringCompanies,
      salaryDistribution,
      jobTrend,
      generatedAt: new Date(),
      fromCache: false,
    };

    // Step 3: Cache the result
    await this.cacheManager.set(
      CACHE_KEYS.DASHBOARD_STATS,
      stats,
      CACHE_TTL.DASHBOARD,
    );

    this.logger.log(
      `Dashboard stats computed and cached in ${Date.now() - startTime}ms`,
    );

    return stats;
  }

  /**
   * Count jobs created in last 24 hours
   * Uses aggregation with $match on createdAt
   */
  private async getJobsLast24Hours(): Promise<number> {
    const last24Hours = new Date(Date.now() - TIME_RANGES.HOURS_24 * 60 * 60 * 1000);

    const result = await this.jobModel.aggregate([
      {
        $match: {
          createdAt: { $gte: last24Hours },
          isDeleted: { $ne: true },
        },
      },
      {
        $count: 'total',
      },
    ]);

    return result[0]?.total || 0;
  }

  /**
   * Count active jobs (isActive=true AND endDate > now)
   * Uses compound index on isActive + endDate
   */
  private async getActiveJobsCount(): Promise<number> {
    const now = new Date();

    const result = await this.jobModel.aggregate([
      {
        $match: {
          isActive: true,
          endDate: { $gt: now },
          isDeleted: { $ne: true },
        },
      },
      {
        $count: 'total',
      },
    ]);

    return result[0]?.total || 0;
  }

  /**
   * Count distinct companies currently hiring
   * Uses $group to get unique company IDs
   */
  private async getHiringCompaniesCount(): Promise<number> {
    const now = new Date();

    const result = await this.jobModel.aggregate([
      {
        $match: {
          isActive: true,
          endDate: { $gt: now },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$company._id',
        },
      },
      {
        $count: 'total',
      },
    ]);

    return result[0]?.total || 0;
  }

  /**
   * Get salary distribution using $bucket aggregation
   * Creates predefined salary ranges for chart visualization
   */
  private async getSalaryDistribution(): Promise<SalaryDistributionDto[]> {
    const result = await this.jobModel.aggregate([
      {
        $match: {
          isActive: true,
          isDeleted: { $ne: true },
        },
      },
      {
        $bucket: {
          groupBy: '$salary',
          boundaries: SALARY_RANGES.BOUNDARIES,
          default: 'other',
          output: {
            count: { $sum: 1 },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Map bucket results to labeled ranges
    return result
      .filter((item) => item._id !== 'other')
      .map((item, index) => ({
        range: SALARY_RANGES.LABELS[index],
        count: item.count,
      }));
  }

  /**
   * Get job creation trend for last 7 days
   * Uses $group with $dateToString for daily aggregation
   */
  private async getJobTrendLast7Days(): Promise<JobTrendDto[]> {
    const last7Days = new Date(
      Date.now() - TIME_RANGES.DAYS_7 * 24 * 60 * 60 * 1000,
    );

    const result = await this.jobModel.aggregate([
      {
        $match: {
          createdAt: { $gte: last7Days },
          isDeleted: { $ne: true },
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
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          count: 1,
        },
      },
    ]);

    // Fill missing dates with 0 count
    return this.fillMissingDates(result, TIME_RANGES.DAYS_7);
  }

  /**
   * Helper: Fill missing dates in trend data
   * Ensures all 7 days are represented even if no jobs created
   */
  private fillMissingDates(
    data: JobTrendDto[],
    days: number,
  ): JobTrendDto[] {
    const dateMap = new Map(data.map((item) => [item.date, item.count]));
    const result: JobTrendDto[] = [];

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

  /**
   * Clear dashboard cache manually
   * Useful for admin triggers or after bulk job updates
   */
  async clearDashboardCache(): Promise<void> {
    await this.cacheManager.del(CACHE_KEYS.DASHBOARD_STATS);
    this.logger.log('Dashboard cache cleared');
  }
}
