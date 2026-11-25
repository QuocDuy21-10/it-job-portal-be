import { JobSearchStats } from './job-search-stats.interface';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ApproveJobDto } from './dto/approve-job.dto';
import { EJobApprovalStatus } from './enums/job-approval-status.enum';
import { EJobListState } from './enums/job-list-state.enum';
import {
  buildJobStateFilter,
  buildPublicJobVisibilityFilter,
  isJobPubliclyVisible,
  PUBLIC_JOB_PROJECTION,
} from './job-visibility.util';
import { IUser } from 'src/users/user.interface';
import { Job, JobDocument } from './schemas/job.schema';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { ERole } from 'src/casl';
import {
  andFilter,
  buildKeywordFilter,
  buildPaginationMeta,
  parseListQuery,
  resolvePagination,
} from 'src/utils/helpers/list-query.helper';
import { Cron } from '@nestjs/schedule';
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';
import { JobExpirationQueueService } from 'src/queues/services/job-expiration-queue.service';
import {
  buildEmbeddedCompanyIdCandidates,
  buildEmbeddedCompanyIdFilter,
} from 'src/companies/company-snapshot.util';
import { JobRepository } from './repositories/job.repository';
import { CronLockService } from 'src/redis/cron-lock.service';
import { assertCompanyAccess } from 'src/companies/company-access.util';
import { SkillsService } from 'src/skills/skills.service';
import { StatisticsCacheService } from 'src/statistics/statistics-cache.service';
import { ListCacheService } from 'src/redis/list-cache.service';
import {
  LIST_CACHE_ENDPOINTS,
  LIST_CACHE_SCOPES,
  LIST_CACHE_TAGS,
  LIST_CACHE_TTL,
} from 'src/redis/list-cache.constants';
import {
  getLocationByCode,
  resolveLocationFromInput,
  resolveLocationPayload,
} from 'src/utils/location-catalog';

const EXPIRED_JOBS_CRON = 'deactivate-expired-jobs';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly ALLOWED_FILTER_FIELDS = new Set([
    'name',
    'skills',
    'location',
    'locationCode',
    'salary',
    'quantity',
    'level',
    'formOfWork',
    'isActive',
    'approvalStatus',
    'company._id',
    'startDate',
    'endDate',
    'createdAt',
  ]);

  // Fields HR may change on an approved job without sending it back to review.
  private readonly SCHEDULING_FIELDS = new Set(['isActive', 'startDate', 'endDate']);

  private readonly EXPIRED_JOBS_BATCH_SIZE = 500;
  private readonly ALLOWED_SORT_FIELDS = new Set([
    'name',
    'salary',
    'createdAt',
    'updatedAt',
    'level',
    'location',
    'startDate',
    'endDate',
  ]);

  // The status tabs replace these filters, so tab counts leave them out.
  private readonly STATE_FIELDS = ['approvalStatus', 'isActive'];
  private readonly KEYWORD_FIELDS = ['name', 'skills', 'company.name'];

  constructor(
    private readonly jobRepository: JobRepository,
    private readonly skillsService: SkillsService,
    private readonly companyFollowerQueueService: CompanyFollowerQueueService,
    private readonly jobExpirationQueueService: JobExpirationQueueService,
    private readonly statisticsCacheService: StatisticsCacheService,
    private readonly listCacheService: ListCacheService,
    private readonly cronLockService: CronLockService,
  ) {}
  async create(createJobDto: CreateJobDto, user: IUser) {
    assertCompanyAccess(
      user,
      createJobDto.company?._id,
      'You can only create jobs for your own company',
    );

    const normalizedSkills = await this.skillsService.normalizeControlledSkills(
      createJobDto.skills ?? [],
    );
    const normalizedCompany = await this.jobRepository.getCompanySnapshot(createJobDto.company._id);
    const resolvedLocation = this.resolveLocationOrThrow(
      createJobDto.locationCode,
      createJobDto.location,
    );

    const newJob = await this.jobRepository.create({
      ...createJobDto,
      location: resolvedLocation.location,
      locationCode: resolvedLocation.locationCode,
      skills: normalizedSkills,
      company: normalizedCompany,
      createdBy: { _id: user._id, email: user.email },
    });

    await this.clearJobRelatedCachesForCompanies([newJob.company._id.toString()]);

    return { _id: newJob._id, createdAt: newJob.createdAt };
  }

  async findAll(
    page?: unknown,
    limit?: unknown,
    query?: string,
    user?: IUser,
    keyword?: string,
    state?: EJobListState,
  ) {
    const { filter, clientFilter, sort, scope } = await this.buildListFilter(query, user, keyword);
    const isPublic = scope === LIST_CACHE_SCOPES.PUBLIC;
    const appliedState = isPublic ? undefined : state;
    if (appliedState) {
      andFilter(filter, buildJobStateFilter(appliedState));
    }

    const { page: safePage, limit: safeLimit, offset: safeOffset } = resolvePagination(page, limit);
    const trimmedKeyword = keyword?.trim() || undefined;

    return this.listCacheService.getOrSet({
      keyInput: {
        endpoint: LIST_CACHE_ENDPOINTS.JOBS,
        scope,
        payload: {
          filter: clientFilter,
          keyword: trimmedKeyword ?? null,
          state: appliedState ?? null,
          limit: safeLimit,
          page: safePage,
          sort,
        },
      },
      ttlMs: LIST_CACHE_TTL.JOBS,
      tags: response => this.buildJobsListCacheTags(scope, filter, trimmedKeyword, response.result),
      loader: async () => {
        const { result, totalItems } = await this.jobRepository.findPaginated(
          filter,
          safeOffset,
          safeLimit,
          sort,
          isPublic ? PUBLIC_JOB_PROJECTION : undefined,
        );

        return { result, meta: buildPaginationMeta(safePage, safeLimit, totalItems) };
      },
    });
  }

  async countByState(
    query: unknown,
    user?: IUser,
    keyword?: string,
  ): Promise<Record<string, number>> {
    const { filter } = await this.buildListFilter(query, user, keyword, this.STATE_FIELDS);
    const now = new Date();
    const states = Object.values(EJobListState);
    const [ALL, ...counts] = await Promise.all([
      this.jobRepository.countDocuments(filter),
      ...states.map(state =>
        this.jobRepository.countDocuments({ $and: [filter, buildJobStateFilter(state, now)] }),
      ),
    ]);

    return { ALL, ...Object.fromEntries(states.map((state, index) => [state, counts[index]])) };
  }

  async findOne(id: string, user?: IUser) {
    this.jobRepository.validateObjectId(id);

    const isAdmin = user?.role === ERole.SUPER_ADMIN;
    const hrCompanyId = user?.role === ERole.HR ? user.company?._id?.toString() : undefined;
    const job = await this.jobRepository.findById(
      id,
      isAdmin || hrCompanyId ? undefined : PUBLIC_JOB_PROJECTION,
    );
    const notFound = new NotFoundException(`Không tìm thấy tin tuyển dụng có ID ${id}`);

    if (!job) {
      throw notFound;
    }

    // Same 404 for "missing" and "not yours" so callers cannot probe which IDs exist.
    if (hrCompanyId) {
      if (job.company?._id?.toString() !== hrCompanyId) {
        throw notFound;
      }
      return job;
    }

    if (!isAdmin && !isJobPubliclyVisible(job)) {
      throw notFound;
    }

    return job;
  }

  async update(id: string, updateJobDto: UpdateJobDto, user: IUser) {
    this.jobRepository.validateObjectId(id);

    // Load the job first so we can enforce HR company ownership before mutating.
    const job = await this.jobRepository.findById(id);
    await this.assertHrOwnership(job, id, user);
    if (updateJobDto.company?._id) {
      assertCompanyAccess(
        user,
        updateJobDto.company._id,
        'You can only move jobs to your own company',
      );
    }

    // Destructure company out so it is not included verbatim in the update
    // payload; the snapshot is fetched below via getCompanySnapshot instead.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { company: _company, ...restUpdateJobDto } = updateJobDto;
    const updatePayload: Record<string, any> = {
      ...restUpdateJobDto,
      updatedBy: { _id: user._id, email: user.email },
    };

    // An HR edit to an approved job's content must go back through review before it is public again.
    const touchesContent = Object.keys(updateJobDto).some(key => !this.SCHEDULING_FIELDS.has(key));
    if (
      user.role === ERole.HR &&
      job?.approvalStatus === EJobApprovalStatus.APPROVED &&
      touchesContent
    ) {
      updatePayload.approvalStatus = EJobApprovalStatus.PENDING;
      updatePayload.approvedBy = null;
      updatePayload.approvedAt = null;
      updatePayload.approvalNote = null;
    }

    if (updateJobDto.skills) {
      updatePayload.skills = await this.skillsService.normalizeControlledSkills(
        updateJobDto.skills,
      );
    }

    if (updateJobDto.company?._id) {
      updatePayload.company = await this.jobRepository.getCompanySnapshot(updateJobDto.company._id);
    }

    if (
      Object.prototype.hasOwnProperty.call(updateJobDto, 'location') ||
      Object.prototype.hasOwnProperty.call(updateJobDto, 'locationCode')
    ) {
      const resolvedLocation = this.resolveLocationOrThrow(
        updateJobDto.locationCode,
        updateJobDto.location,
      );
      updatePayload.location = resolvedLocation.location;
      updatePayload.locationCode = resolvedLocation.locationCode;
    }

    const result = await this.jobRepository.updateOne({ _id: id }, updatePayload);
    const affectedCompanyIds = [
      job?.company?._id?.toString(),
      updatePayload.company?._id?.toString(),
    ].filter(Boolean);

    await this.clearJobRelatedCachesForCompanies(affectedCompanyIds);

    return result;
  }
  /**
   * Find matching jobs based on user skills
   * Used by ChatService to suggest relevant jobs
   * @param skills - Array of skill names from user's CV profile
   * @param limit - Maximum number of jobs to return (default: 3)
   * @returns Array of matching jobs
   */
  async findMatchingJobs(skills: string[], limit: number = 3): Promise<Job[]> {
    if (!skills || skills.length === 0) {
      return [];
    }

    const skillConditions = await this.buildSkillConditions(skills);

    if (skillConditions.length === 0) {
      return [];
    }

    return this.jobRepository.findLean(
      {
        ...this.buildActiveJobFilter(),
        isDeleted: false,
        skills: { $in: skillConditions },
      },
      'name company location locationCode skills level salary',
      { createdAt: -1 },
      limit,
    );
  }

  async findPublicChatCardJobsByIds(jobIds: string[]): Promise<Job[]> {
    const uniqueJobIds = [...new Set(jobIds.filter(Boolean))];

    if (uniqueJobIds.length === 0) {
      return [];
    }

    return this.jobRepository.findPublicChatCardJobsByIds(uniqueJobIds);
  }

  async approveJob(id: string, dto: ApproveJobDto, user: IUser) {
    this.jobRepository.validateObjectId(id);

    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng có ID ${id}`);
    }

    await this.jobRepository.updateOne(
      { _id: id },
      {
        approvalStatus: dto.status,
        approvalNote: dto.approvalNote ?? null,
        approvedBy: { _id: user._id, email: user.email },
        approvedAt: new Date(),
        updatedBy: { _id: user._id, email: user.email },
      },
    );

    // Followers hear about a job once it is public, never while it is PENDING or REJECTED, and only
    // on its first approval: re-approving after an HR edit must not send "new job" again.
    if (
      dto.status === EJobApprovalStatus.APPROVED &&
      job.approvalStatus !== EJobApprovalStatus.APPROVED &&
      (await this.claimFollowerNotification(id))
    ) {
      await this.queueNewJobNotification(job);
    }

    await this.clearJobRelatedCachesForCompanies([job.company?._id?.toString()].filter(Boolean));

    return { _id: id, approvalStatus: dto.status };
  }

  async remove(id: string, user: IUser) {
    this.jobRepository.validateObjectId(id);

    // Load the job first so we can enforce HR company ownership before deleting.
    const job = await this.jobRepository.findById(id);
    await this.assertHrOwnership(job, id, user);

    const result = await this.jobRepository.softDeleteById(id, {
      _id: user._id,
      email: user.email,
    });

    await this.clearJobRelatedCachesForCompanies([job?.company?._id?.toString()].filter(Boolean));

    return result;
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    const affectedCompanyIds = user.company?._id
      ? [user.company._id.toString()]
      : await this.jobRepository.findCompanyIdsByJobIds(ids);

    // HR can only delete jobs belonging to their own company
    if (user.role === ERole.HR) {
      if (!user.company?._id) {
        throw new ForbiddenException('Tài khoản HR phải được gắn với một công ty');
      }

      const ownedCount = await this.jobRepository.countJobsOwnedByCompany(ids, user.company._id);

      if (ownedCount !== ids.length) {
        throw new ForbiddenException('Bạn chỉ có thể xoá tin tuyển dụng của công ty mình');
      }
    }

    const result = await this.jobRepository.bulkSoftDelete(ids, user);

    await this.clearJobRelatedCachesForCompanies(affectedCompanyIds);

    return result;
  }

  @Cron('0 * * * *', {
    name: EXPIRED_JOBS_CRON,
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async runExpiredJobsCron(): Promise<void> {
    await this.cronLockService.runExclusive(EXPIRED_JOBS_CRON, () => this.handleExpiredJobs());
  }

  async handleExpiredJobs(): Promise<void> {
    const now = new Date();
    let deactivatedCount = 0;

    for (;;) {
      const expiredJobs = await this.jobRepository.findExpiredJobsLean(
        { isActive: true, endDate: { $ne: null, $lte: now } },
        '_id name company createdBy endDate',
        this.EXPIRED_JOBS_BATCH_SIZE,
      );

      if (expiredJobs.length === 0) {
        break;
      }

      const { modifiedCount } = await this.jobRepository.updateMany(
        { _id: { $in: expiredJobs.map(job => job._id) } },
        { isActive: false },
      );

      // Deactivated jobs drop out of the filter; if none changed, the next query would repeat forever.
      if (modifiedCount === 0) {
        this.logger.warn(
          `Stopped expired job batch: ${expiredJobs.length} job(s) were not updated`,
        );
        break;
      }

      deactivatedCount += modifiedCount;

      await this.clearJobRelatedCachesForCompanies(
        expiredJobs.map(job => job.company?._id?.toString()).filter(Boolean),
      );
      await this.notifyExpiredJobs(expiredJobs);
    }

    if (deactivatedCount > 0) {
      this.logger.log(`Deactivated ${deactivatedCount} expired job(s)`);
    }
  }

  private async notifyExpiredJobs(expiredJobs: JobDocument[]): Promise<void> {
    await Promise.allSettled(
      expiredJobs
        .filter(job => job.createdBy?.email)
        .map(job =>
          this.jobExpirationQueueService
            .addExpiredJobNotification({
              jobId: job._id.toString(),
              jobName: job.name,
              companyName: job.company?.name ?? 'Unknown Company',
              hrEmail: job.createdBy.email,
              endDate: new Date(job.endDate).toISOString(),
            })
            .catch((error: unknown) => {
              this.logger.error(
                `Failed to queue expiration notification for job ${job._id}: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error.stack : undefined,
              );
            }),
        ),
    );
  }

  async getPlatformJobStats(): Promise<{
    activeJobCount: number;
    hiringCompaniesCount: number;
    topSkills: Array<{ name: string; count: number }>;
    topCompanies: Array<{ _id: string; name: string; jobCount: number }>;
    jobsByLevel: Array<{ level: string; count: number }>;
  }> {
    const activeFilter = {
      isActive: true,
      isDeleted: { $ne: true },
      approvalStatus: EJobApprovalStatus.APPROVED,
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    };

    const [result] = await this.jobRepository.aggregate([
      { $match: activeFilter },
      {
        $facet: {
          activeJobCount: [{ $count: 'total' }],
          hiringCompaniesCount: [{ $group: { _id: '$company._id' } }, { $count: 'total' }],
          topSkills: [
            { $unwind: '$skills' },
            { $group: { _id: { $toLower: '$skills' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
            { $project: { _id: 0, name: '$_id', count: 1 } },
          ],
          topCompanies: [
            {
              $group: {
                _id: '$company._id',
                name: { $first: '$company.name' },
                jobCount: { $sum: 1 },
              },
            },
            { $sort: { jobCount: -1 } },
            { $limit: 10 },
          ],
          jobsByLevel: [
            { $group: { _id: '$level', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $project: { _id: 0, level: '$_id', count: 1 } },
          ],
        },
      },
    ]);

    return {
      activeJobCount: result.activeJobCount[0]?.total || 0,
      hiringCompaniesCount: result.hiringCompaniesCount[0]?.total || 0,
      topSkills: result.topSkills || [],
      topCompanies: (result.topCompanies || []).map((c: any) => ({
        _id: c._id?.toString() || '',
        name: c.name || 'N/A',
        jobCount: c.jobCount,
      })),
      jobsByLevel: result.jobsByLevel || [],
    };
  }

  async searchJobs(
    skills?: string[],
    level?: string,
    location?: string,
    limit: number = 10,
    sortBy: 'newest' | 'salary' = 'newest',
  ): Promise<Job[]> {
    const filter = await this.buildJobSearchFilter(skills, level, location);

    return this.jobRepository.findLean(
      filter,
      'name company location locationCode skills level salary',
      sortBy === 'salary' ? { salary: -1, createdAt: -1 } : { createdAt: -1 },
      limit,
    );
  }

  async getJobSearchStats(
    skills?: string[],
    level?: string,
    location?: string,
  ): Promise<JobSearchStats> {
    const filter = await this.buildJobSearchFilter(skills, level, location);
    const [total, [topPaid]] = await Promise.all([
      this.jobRepository.countDocuments(filter),
      this.jobRepository.findLean(
        { ...filter, salary: { $gt: 0 } },
        'name company salary',
        { salary: -1 },
        1,
      ),
    ]);

    return {
      total,
      highestSalary: topPaid
        ? {
            id: String((topPaid as any)._id),
            name: topPaid.name,
            company: topPaid.company?.name ?? 'N/A',
            salary: topPaid.salary,
          }
        : null,
    };
  }

  async getHiringCompanyNames(limit: number = 500): Promise<string[]> {
    const rows = await this.jobRepository.aggregate([
      { $match: { ...this.buildActiveJobFilter(), isDeleted: false } },
      { $group: { _id: '$company.name' } },
      { $limit: limit },
    ]);

    return rows
      .map((row: { _id?: unknown }) => row._id)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
  }

  private async buildJobSearchFilter(
    skills?: string[],
    level?: string,
    location?: string,
  ): Promise<Record<string, any>> {
    const filter: Record<string, any> = {
      ...this.buildActiveJobFilter(),
      isDeleted: false,
    };

    if (skills && skills.length > 0) {
      const skillConditions = await this.buildSkillConditions(skills);
      if (skillConditions.length > 0) {
        filter.skills = { $in: skillConditions };
      }
    }

    if (level) {
      filter.level = level.toUpperCase();
    }

    if (location) {
      const resolvedLocation = resolveLocationPayload({
        location,
        locationCode: location,
      });

      if (resolvedLocation) {
        filter.locationCode = resolvedLocation.locationCode;
      } else {
        filter.location = { $regex: this.escapeRegex(location), $options: 'i' };
      }
    }

    return filter;
  }

  // Private helpers

  // Jobs store catalog labels, so a mapped skill matches exactly (and can use the skills index).
  private async buildSkillConditions(skills: string[]): Promise<Array<string | RegExp>> {
    const { normalizedSkills, unmappedSkills } =
      await this.skillsService.normalizeExtractedSkills(skills);

    return [
      ...normalizedSkills,
      ...unmappedSkills.map(skill => new RegExp(this.escapeRegex(skill), 'i')),
    ];
  }

  private async normalizeSkillsFilter(filter: Record<string, any>): Promise<void> {
    if (typeof filter.skills === 'undefined') {
      return;
    }

    const rawSkillsFilter = filter.skills;

    if (typeof rawSkillsFilter === 'string') {
      filter.skills = {
        $in: await this.skillsService.normalizeControlledSkills([rawSkillsFilter]),
      };
      return;
    }

    if (Array.isArray(rawSkillsFilter)) {
      filter.skills = { $in: await this.skillsService.normalizeControlledSkills(rawSkillsFilter) };
      return;
    }

    if (rawSkillsFilter && Array.isArray(rawSkillsFilter.$in)) {
      filter.skills = {
        $in: await this.skillsService.normalizeControlledSkills(rawSkillsFilter.$in),
      };
      return;
    }

    throw new BadRequestException('Bộ lọc kỹ năng không đúng định dạng');
  }

  private normalizeLocationFilter(filter: Record<string, any>): void {
    if (typeof filter.locationCode === 'string') {
      const resolvedCode =
        getLocationByCode(filter.locationCode) ?? resolveLocationFromInput(filter.locationCode);

      if (resolvedCode) {
        filter.locationCode = resolvedCode.code;
      }
    }

    if (typeof filter.location === 'undefined') {
      return;
    }

    const resolvedLocation = resolveLocationFromInput(filter.location);

    if (!resolvedLocation) {
      return;
    }

    filter.locationCode = resolvedLocation.code;
    delete filter.location;
  }

  /** Atomically marks the job as announced; true only for the one caller that set the mark. */
  private async claimFollowerNotification(id: string): Promise<boolean> {
    const result = await this.jobRepository.updateOne(
      { _id: id, followersNotifiedAt: null },
      { $set: { followersNotifiedAt: new Date() } },
    );
    return result.modifiedCount === 1;
  }

  private async queueNewJobNotification(job: JobDocument): Promise<void> {
    try {
      await this.companyFollowerQueueService.addNewJobNotification({
        jobId: job._id.toString(),
        companyId: job.company._id.toString(),
        jobName: job.name,
        companyName: job.company.name,
      });
    } catch (error) {
      this.logger.error(
        `Failed to queue new-job notification for job ${job._id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async assertHrOwnership(
    job: JobDocument | null,
    jobId: string,
    user: IUser,
  ): Promise<void> {
    if (!job) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng có ID ${jobId}`);
    }

    if (user.role === ERole.HR) {
      assertCompanyAccess(
        user,
        job.company?._id,
        'You can only modify jobs that belong to your company',
      );
    }
  }

  private buildActiveJobFilter(): Record<string, unknown> {
    return buildPublicJobVisibilityFilter();
  }

  private async buildListFilter(
    query: unknown,
    user?: IUser,
    keyword?: string,
    ignoredFields: string[] = [],
  ) {
    const { filter, sort } = parseListQuery(query, {
      filterFields: new Set(
        [...this.ALLOWED_FILTER_FIELDS].filter(field => !ignoredFields.includes(field)),
      ),
      sortFields: this.ALLOWED_SORT_FIELDS,
    });
    await this.normalizeSkillsFilter(filter);
    this.normalizeLocationFilter(filter);

    if (typeof filter['company._id'] === 'string') {
      filter['company._id'] = { $in: buildEmbeddedCompanyIdCandidates(filter['company._id']) };
    }

    // The cache key: client dates must stay apart, the server's "now" below must not enter it.
    const clientFilter = { ...filter };
    const scope = this.resolveJobsListCacheScope(user);
    if (scope === LIST_CACHE_SCOPES.PUBLIC) {
      Object.assign(filter, this.buildActiveJobFilter());
    } else if (user.role === ERole.HR) {
      Object.assign(filter, buildEmbeddedCompanyIdFilter(user.company._id));
    }
    andFilter(filter, buildKeywordFilter(keyword, this.KEYWORD_FIELDS));

    return { filter, clientFilter, sort, scope };
  }

  private resolveLocationOrThrow(locationCode?: string | null, location?: string | null) {
    const resolvedLocation = resolveLocationPayload({ location, locationCode });

    if (!resolvedLocation) {
      throw new BadRequestException('Cần locationCode hoặc location hợp lệ');
    }

    return resolvedLocation;
  }

  private async clearJobRelatedCachesForCompanies(companyIds: string[]): Promise<void> {
    const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];

    await Promise.all([
      this.statisticsCacheService.clearAdminDashboard(),
      this.statisticsCacheService.clearHrDashboards(uniqueCompanyIds),
      this.statisticsCacheService.clearTopHiringCompanies(),
      this.listCacheService.reclaimByTags([
        LIST_CACHE_TAGS.jobs.all,
        ...uniqueCompanyIds.map(companyId => LIST_CACHE_TAGS.companies.company(companyId)),
      ]),
    ]);
  }

  private resolveJobsListCacheScope(user?: IUser): string {
    if (user?.role === ERole.HR && user.company?._id) {
      return LIST_CACHE_SCOPES.hr(user.company._id.toString());
    }

    if (user?.role === ERole.SUPER_ADMIN) {
      return LIST_CACHE_SCOPES.SUPER_ADMIN;
    }

    return LIST_CACHE_SCOPES.PUBLIC;
  }

  private buildJobsListCacheTags(
    scope: string,
    filter: Record<string, any>,
    keyword: string | undefined,
    jobs: any[],
  ): string[] {
    const tags = [
      LIST_CACHE_TAGS.jobs.all,
      LIST_CACHE_TAGS.jobs.scope(scope),
      ...Object.keys(filter).map(field => LIST_CACHE_TAGS.jobs.filter(field)),
    ];

    if (keyword) {
      tags.push(LIST_CACHE_TAGS.jobs.keyword);
    }

    for (const companyId of this.extractCompanyIdsFromFilter(filter['company._id'])) {
      tags.push(LIST_CACHE_TAGS.jobs.company(companyId));
    }

    for (const job of jobs) {
      const jobId = this.toIdString(job?._id);
      const companyId = this.toIdString(job?.company?._id);

      if (jobId) {
        tags.push(LIST_CACHE_TAGS.jobs.job(jobId));
      }

      if (companyId) {
        tags.push(LIST_CACHE_TAGS.jobs.company(companyId));
      }
    }

    return tags;
  }

  private extractCompanyIdsFromFilter(companyFilter: any): string[] {
    if (!companyFilter) {
      return [];
    }

    if (typeof companyFilter === 'string') {
      return [companyFilter];
    }

    if (Array.isArray(companyFilter.$in)) {
      return companyFilter.$in
        .map((companyId: unknown) => this.toIdString(companyId))
        .filter(Boolean);
    }

    const companyId = this.toIdString(companyFilter);
    return companyId ? [companyId] : [];
  }

  private toIdString(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.toString();
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
