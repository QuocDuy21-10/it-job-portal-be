import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { withTtlJitter } from 'src/redis/cache-ttl.util';
import { SingleFlight } from 'src/redis/single-flight';
import { CACHE_KEYS, CACHE_TTL, LIMITS } from './constants/statistics.constants';

export interface CachedResult<T> {
  value: T;
  fromCache: boolean;
}

@Injectable()
export class StatisticsCacheService {
  private readonly singleFlight = new SingleFlight();

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  getOrSetAdminDashboard<T>(loader: () => Promise<T>): Promise<CachedResult<T>> {
    return this.getOrSet(CACHE_KEYS.ADMIN_DASHBOARD, CACHE_TTL.ADMIN_DASHBOARD, loader);
  }

  getOrSetHrDashboard<T>(companyId: string, loader: () => Promise<T>): Promise<CachedResult<T>> {
    return this.getOrSet(CACHE_KEYS.hrDashboard(companyId), CACHE_TTL.HR_DASHBOARD, loader);
  }

  getOrSetTopHiringCompanies<T>(limit: number, loader: () => Promise<T>): Promise<CachedResult<T>> {
    return this.getOrSet(
      CACHE_KEYS.topHiringCompanies(limit),
      CACHE_TTL.TOP_HIRING_COMPANIES,
      loader,
    );
  }

  // shortcut: no epoch guard, so a load racing an invalidation can cache stale stats for one TTL (3-15 min); port ListCacheService's epoch write if dashboards must be exact.
  private async getOrSet<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    const cached = await this.cacheManager.get<T>(key);
    if (cached !== undefined && cached !== null) {
      return { value: cached, fromCache: true };
    }

    return this.singleFlight.run(key, async () => {
      const value = await loader();
      await this.cacheManager.set(key, value, withTtlJitter(ttlMs));
      return { value, fromCache: false };
    });
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
