import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ApproveJobDto } from './dto/approve-job.dto';
import { EJobApprovalStatus } from './enums/job-approval-status.enum';
import { IUser } from 'src/users/user.interface';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Job, JobDocument } from './schemas/job.schema';
import mongoose from 'mongoose';
import aqp from 'api-query-params';
import { Cron } from '@nestjs/schedule';
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';
import { JobExpirationQueueService } from 'src/queues/services/job-expiration-queue.service';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import {
  buildCanonicalCompanySnapshot,
  buildEmbeddedCompanyIdCandidates,
  buildEmbeddedCompanyIdFilter,
  CompanySnapshotValue,
} from 'src/companies/company-snapshot.util';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(Company.name) private companyModel: SoftDeleteModel<CompanyDocument>,
    private readonly companyFollowerQueueService: CompanyFollowerQueueService,
    private readonly jobExpirationQueueService: JobExpirationQueueService,
  ) {}
  async create(createJobDto: CreateJobDto, user: IUser) {
    const normalizedCompany = await this.getCanonicalCompanySnapshot(createJobDto.company._id);

    const newJob = await this.jobModel.create({
      ...createJobDto,
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
      // Log error but don't fail the job creation
      console.error('Failed to add notification to queue:', error);
    }

    return { _id: newJob._id, createdAt: newJob.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;

    if (typeof filter['company._id'] === 'string') {
      filter['company._id'] = {
        $in: buildEmbeddedCompanyIdCandidates(filter['company._id']),
      };
    }

    // Filter theo companyId nếu user là HR
    if (user && user.role?.name === 'HR' && user.company?._id) {
      Object.assign(filter, buildEmbeddedCompanyIdFilter(user.company._id));
    } else if (!user || user.role?.name !== 'SUPER ADMIN') {
      // Public users and NORMAL_USER only see APPROVED, active, non-expired jobs
      Object.assign(filter, this.buildActiveJobFilter());
    }

    const offset = (page - 1) * limit;
    const defaultLimit = limit ? limit : 10;

    const totalItems = (await this.jobModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.jobModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .exec();
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
    this.validateObjectId(id);

    const job = await this.jobModel.findById(id).exec();

    // Nếu user là HR, chỉ cho phép xem job của công ty họ
    if (user && user.role?.name === 'HR' && user.company?._id) {
      if (job && job.company && job.company._id.toString() !== user.company._id.toString()) {
        throw new BadRequestException('You can only view jobs of your own company');
      }
      return job;
    }

    // Public users and NORMAL_USER can only view APPROVED, active, non-expired jobs
    if (!user || user.role?.name !== 'SUPER ADMIN') {
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
    this.validateObjectId(id);
    const { company: _company, ...restUpdateJobDto } = updateJobDto;
    const updatePayload: Record<string, any> = {
      ...restUpdateJobDto,
      updatedBy: { _id: user._id, email: user.email },
    };

    if (updateJobDto.company?._id) {
      updatePayload.company = await this.getCanonicalCompanySnapshot(updateJobDto.company._id);
    }

    return await this.jobModel.updateOne({ _id: id }, updatePayload);
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

    const skillRegexes = skills.map(skill => new RegExp(skill, 'i'));

    return await this.jobModel
      .find({
        ...this.buildActiveJobFilter(),
        isDeleted: false,
        skills: { $in: skillRegexes },
      })
      .select('name company location skills level') // Select only necessary fields to reduce token usage
      .sort({ createdAt: -1 }) // Prioritize newest jobs
      .limit(limit)
      .lean()
      .exec();
  }

  async approveJob(id: string, dto: ApproveJobDto, user: IUser) {
    this.validateObjectId(id);

    const job = await this.jobModel.findById(id).exec();
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    await this.jobModel.updateOne(
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
    this.validateObjectId(id);
    await this.jobModel.updateOne({ _id: id }, { deletedBy: { _id: user._id, email: user.email } });
    return this.jobModel.softDelete({ _id: id });
  }

  @Cron('0 * * * *', {
    name: 'deactivate-expired-jobs',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleExpiredJobs(): Promise<void> {
    const now = new Date();

    const expiredJobs = await this.jobModel
      .find({
        isActive: true,
        endDate: { $ne: null, $lte: now },
      })
      .select('_id name company createdBy')
      .lean()
      .exec();

    if (expiredJobs.length === 0) {
      return;
    }

    const expiredIds = expiredJobs.map(job => job._id);
    await this.jobModel.updateMany({ _id: { $in: expiredIds } }, { isActive: false });

    this.logger.log(`Deactivated ${expiredJobs.length} expired job(s)`);

    for (const job of expiredJobs) {
      if (job.createdBy?.email) {
        try {
          await this.jobExpirationQueueService.addExpiredJobNotification({
            jobId: job._id.toString(),
            jobName: job.name,
            companyName: job.company?.name ?? 'Unknown Company',
            hrEmail: job.createdBy.email,
          });
        } catch (error) {
          this.logger.error(
            `Failed to queue expiration notification for job ${job._id}: ${error.message}`,
            error.stack,
          );
        }
      }
    }
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

    const [result] = await this.jobModel.aggregate([
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
      filter.skills = { $in: skills.map(s => new RegExp(s, 'i')) };
    }

    if (level) {
      filter.level = level.toUpperCase();
    }

    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    return await this.jobModel
      .find(filter)
      .select('name company location skills level salary')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  private buildActiveJobFilter(): Record<string, unknown> {
    return {
      isActive: true,
      approvalStatus: EJobApprovalStatus.APPROVED,
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    };
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  private async getCanonicalCompanySnapshot(companyId: string): Promise<CompanySnapshotValue> {
    this.validateObjectId(companyId);

    const company = await this.companyModel
      .findOne({ _id: companyId, isDeleted: false })
      .select('_id name logo');

    if (!company) {
      throw new BadRequestException('Company not found or has been deleted');
    }

    return buildCanonicalCompanySnapshot(company);
  }
}
