import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_KEYS, CACHE_TTL, LIMITS } from './constants/statistics.constants';

@Injectable()
export class StatisticsCacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async getAdminDashboard<T>(): Promise<T | undefined> {
    return this.cacheManager.get<T>(CACHE_KEYS.ADMIN_DASHBOARD);
  }

  async setAdminDashboard<T>(value: T): Promise<void> {
    await this.cacheManager.set(CACHE_KEYS.ADMIN_DASHBOARD, value, CACHE_TTL.ADMIN_DASHBOARD);
  }

  async getHrDashboard<T>(companyId: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(CACHE_KEYS.hrDashboard(companyId));
  }

  async setHrDashboard<T>(companyId: string, value: T): Promise<void> {
    await this.cacheManager.set(CACHE_KEYS.hrDashboard(companyId), value, CACHE_TTL.HR_DASHBOARD);
  }

  async getTopHiringCompanies<T>(limit: number): Promise<T | undefined> {
    return this.cacheManager.get<T>(CACHE_KEYS.topHiringCompanies(limit));
  }

  async setTopHiringCompanies<T>(limit: number, value: T): Promise<void> {
    await this.cacheManager.set(
      CACHE_KEYS.topHiringCompanies(limit),
      value,
      CACHE_TTL.TOP_HIRING_COMPANIES,
    );
  }

  async clearAdminDashboard(): Promise<void> {
    await this.cacheManager.del(CACHE_KEYS.ADMIN_DASHBOARD);
  }

  async clearHrDashboard(companyId: string): Promise<void> {
    await this.cacheManager.del(CACHE_KEYS.hrDashboard(companyId));
  }

  async clearScopedDashboards(companyId?: string): Promise<void> {
    const tasks: Promise<void>[] = [this.clearAdminDashboard()];

    if (companyId) {
      tasks.push(this.clearHrDashboard(companyId));
    }

    await Promise.all(tasks);
  }

  async clearHrDashboards(companyIds: string[]): Promise<void> {
    const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];

    await Promise.all(uniqueCompanyIds.map(companyId => this.clearHrDashboard(companyId)));
  }

  async clearTopHiringCompanies(): Promise<void> {
    const tasks = Array.from({ length: LIMITS.TOP_HIRING_COMPANIES }, (_, index) =>
      this.cacheManager.del(CACHE_KEYS.topHiringCompanies(index + 1)),
    );

    await Promise.all(tasks);
  }
}
