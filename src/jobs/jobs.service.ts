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
import { IUser } from 'src/users/user.interface';
import { Job, JobDocument } from './schemas/job.schema';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { ERole } from 'src/casl';
import aqp from 'api-query-params';
import { Cron } from '@nestjs/schedule';
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';
import { JobExpirationQueueService } from 'src/queues/services/job-expiration-queue.service';
import {
  buildEmbeddedCompanyIdCandidates,
  buildEmbeddedCompanyIdFilter,
} from 'src/companies/company-snapshot.util';
import { JobRepository } from './repositories/job.repository';
import { SkillsService } from 'src/skills/skills.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly ALLOWED_FILTER_FIELDS = new Set([
    'name',
    'skills',
    'location',
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

  private readonly DANGEROUS_OPERATORS = new Set([
    '$where',
    '$function',
    '$expr',
    '$accumulator',
    '$jsReduce',
  ]);

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

  constructor(
    private readonly jobRepository: JobRepository,
    private readonly skillsService: SkillsService,
    private readonly companyFollowerQueueService: CompanyFollowerQueueService,
    private readonly jobExpirationQueueService: JobExpirationQueueService,
  ) {}
  async create(createJobDto: CreateJobDto, user: IUser) {
    const normalizedSkills = await this.skillsService.normalizeControlledSkills(
      createJobDto.skills ?? [],
    );
    const normalizedCompany = await this.jobRepository.getCompanySnapshot(createJobDto.company._id);

    const newJob = await this.jobRepository.create({
      ...createJobDto,
      skills: normalizedSkills,
      company: normalizedCompany,
      createdBy: { _id: user._id, email: user.email },
    });

    // Add task to queue to notify company followers
    // This runs asynchronously without blocking the API response
    try {
      await this.companyFollowerQueueService.addNewJobNotification({
        jobId: newJob._id.toString(),
        companyId: newJob.company._id.toString(),
        jobName: newJob.name,
        companyName: newJob.company.name,
      });
    } catch (error) {
      this.logger.error(
        `Failed to queue new-job notification for job ${newJob._id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { _id: newJob._id, createdAt: newJob.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser, keyword?: string) {
    const { filter: rawFilter, sort: rawSort } = aqp(query);
    const { filter, sort } = this.sanitizeAqpQuery(rawFilter, rawSort);
    await this.normalizeSkillsFilter(filter);

    if (typeof filter['company._id'] === 'string') {
      filter['company._id'] = {
        $in: buildEmbeddedCompanyIdCandidates(filter['company._id']),
      };
    }

    if (user && user.role?.name === ERole.HR && user.company?._id) {
      Object.assign(filter, buildEmbeddedCompanyIdFilter(user.company._id));
    } else if (!user || user.role?.name !== ERole.SUPER_ADMIN) {
      Object.assign(filter, this.buildActiveJobFilter());
    }

    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      const keywordFilter = this.buildKeywordFilter(trimmedKeyword);
      if (Array.isArray(filter.$and)) {
        filter.$and.push(keywordFilter);
      } else {
        filter.$and = [keywordFilter];
      }
    }

    const safeLimit = limit > 0 ? limit : 10;
    const safeOffset = ((page > 0 ? page : 1) - 1) * safeLimit;

    const { result, totalItems, totalPages } = await this.jobRepository.findPaginated(
      filter,
      safeOffset,
      safeLimit,
      sort,
    );

    return {
      result,
      meta: {
        pagination: {
          current_page: page,
          per_page: limit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string, user?: IUser) {
    this.jobRepository.validateObjectId(id);

    const job = await this.jobRepository.findById(id);

    // Nếu user là HR, chỉ cho phép xem job của công ty họ
    if (user && user.role?.name === ERole.HR && user.company?._id) {
      if (job && job.company && job.company._id.toString() !== user.company._id.toString()) {
        throw new BadRequestException('You can only view jobs of your own company');
      }
      return job;
    }

    // Public users and NORMAL_USER can only view APPROVED, active, non-expired jobs
    if (!user || user.role?.name !== ERole.SUPER_ADMIN) {
      if (
        job &&
        (job.approvalStatus !== EJobApprovalStatus.APPROVED ||
          !job.isActive ||
          (job.endDate && new Date(job.endDate) < new Date()))
      ) {
        return null;
      }
    }

    return job;
  }

  async update(id: string, updateJobDto: UpdateJobDto, user: IUser) {
    this.jobRepository.validateObjectId(id);

    // Load the job first so we can enforce HR company ownership before mutating.
    const job = await this.jobRepository.findById(id);
    await this.assertHrOwnership(job, id, user);

    // Destructure company out so it is not included verbatim in the update
    // payload; the snapshot is fetched below via getCompanySnapshot instead.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { company: _company, ...restUpdateJobDto } = updateJobDto;
    const updatePayload: Record<string, any> = {
      ...restUpdateJobDto,
      updatedBy: { _id: user._id, email: user.email },
    };

    if (updateJobDto.skills) {
      updatePayload.skills = await this.skillsService.normalizeControlledSkills(
        updateJobDto.skills,
      );
    }

    if (updateJobDto.company?._id) {
      updatePayload.company = await this.jobRepository.getCompanySnapshot(updateJobDto.company._id);
    }

    return this.jobRepository.updateOne({ _id: id }, updatePayload);
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

    const { normalizedSkills, unmappedSkills } =
      await this.skillsService.normalizeExtractedSkills(skills);
    const searchTerms = [...normalizedSkills, ...unmappedSkills].filter(Boolean);
    const skillRegexes = searchTerms.map(skill => new RegExp(this.escapeRegex(skill), 'i'));

    if (skillRegexes.length === 0) {
      return [];
    }

    return this.jobRepository.findLean(
      {
        ...this.buildActiveJobFilter(),
        isDeleted: false,
        skills: { $in: skillRegexes },
      },
      'name company location skills level',
      { createdAt: -1 },
      limit,
    );
  }

  async approveJob(id: string, dto: ApproveJobDto, user: IUser) {
    this.jobRepository.validateObjectId(id);

    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
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

    return { _id: id, approvalStatus: dto.status };
  }

  async remove(id: string, user: IUser) {
    this.jobRepository.validateObjectId(id);

    // Load the job first so we can enforce HR company ownership before deleting.
    const job = await this.jobRepository.findById(id);
    await this.assertHrOwnership(job, id, user);

    return this.jobRepository.softDeleteById(id, { _id: user._id, email: user.email });
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    // HR can only delete jobs belonging to their own company
    if (user.role?.name === ERole.HR) {
      if (!user.company?._id) {
        throw new ForbiddenException('HR user must be associated with a company');
      }

      const ownedCount = await this.jobRepository.countJobsOwnedByCompany(ids, user.company._id);

      if (ownedCount !== ids.length) {
        throw new ForbiddenException('You can only delete jobs that belong to your company');
      }
    }

    return this.jobRepository.bulkSoftDelete(ids, user);
  }

  @Cron('0 * * * *', {
    name: 'deactivate-expired-jobs',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleExpiredJobs(): Promise<void> {
    const now = new Date();

    const expiredJobs = await this.jobRepository.findExpiredJobsLean(
      {
        isActive: true,
        endDate: { $ne: null, $lte: now },
      },
      '_id name company createdBy',
    );

    if (expiredJobs.length === 0) {
      return;
    }

    const expiredIds = expiredJobs.map(job => job._id);
    await this.jobRepository.updateMany({ _id: { $in: expiredIds } }, { isActive: false });

    this.logger.log(`Deactivated ${expiredJobs.length} expired job(s)`);

    // Dispatch notifications in parallel instead of sequentially
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
  ): Promise<Job[]> {
    const filter: Record<string, any> = {
      ...this.buildActiveJobFilter(),
      isDeleted: false,
    };

    if (skills && skills.length > 0) {
      const { normalizedSkills, unmappedSkills } =
        await this.skillsService.normalizeExtractedSkills(skills);
      const searchTerms = [...normalizedSkills, ...unmappedSkills].filter(Boolean);
      if (searchTerms.length > 0) {
        filter.skills = { $in: searchTerms.map(s => new RegExp(this.escapeRegex(s), 'i')) };
      }
    }

    if (level) {
      filter.level = level.toUpperCase();
    }

    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    return this.jobRepository.findLean(
      filter,
      'name company location skills level salary',
      { createdAt: -1 },
      limit,
    );
  }

  // Private helpers

  private sanitizeAqpQuery(
    rawFilter: Record<string, any>,
    rawSort: Record<string, any>,
  ): { filter: Record<string, any>; sort: Record<string, any> } {
    const filter: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawFilter)) {
      if (this.DANGEROUS_OPERATORS.has(key)) continue;
      if (!this.ALLOWED_FILTER_FIELDS.has(key)) continue;
      filter[key] = value;
    }

    const sort: Record<string, any> = {};
    if (rawSort && typeof rawSort === 'object') {
      for (const [key, value] of Object.entries(rawSort)) {
        if (!this.ALLOWED_SORT_FIELDS.has(key)) continue;
        if (value !== 1 && value !== -1) continue;
        sort[key] = value;
      }
    }

    return { filter, sort };
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

    throw new BadRequestException('Invalid skills filter format');
  }

  private async assertHrOwnership(
    job: JobDocument | null,
    jobId: string,
    user: IUser,
  ): Promise<void> {
    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    if (user.role?.name === ERole.HR) {
      if (!user.company?._id) {
        throw new ForbiddenException('HR user must be associated with a company');
      }
      if (job.company._id.toString() !== user.company._id.toString()) {
        throw new ForbiddenException('You can only modify jobs that belong to your company');
      }
    }
  }

  private buildActiveJobFilter(): Record<string, unknown> {
    return {
      isActive: true,
      approvalStatus: EJobApprovalStatus.APPROVED,
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    };
  }

  private buildKeywordFilter(keyword: string): Record<string, any> {
    const regex = new RegExp(this.escapeRegex(keyword), 'i');
    return { $or: [{ name: regex }, { skills: regex }, { 'company.name': regex }] };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
