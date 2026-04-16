import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import {
  buildCanonicalCompanySnapshot,
  buildEmbeddedCompanyIdCandidates,
  buildEmbeddedCompanyIdFilter,
  CompanySnapshotValue,
} from 'src/companies/company-snapshot.util';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(Company.name) private companyModel: SoftDeleteModel<CompanyDocument>,
    private readonly companyFollowerQueueService: CompanyFollowerQueueService,
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
      // Public users and NORMAL_USER only see APPROVED jobs
      filter.approvalStatus = EJobApprovalStatus.APPROVED;
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

    // Public users and NORMAL_USER can only view APPROVED jobs
    if (!user || user.role?.name !== 'SUPER ADMIN') {
      if (job && job.approvalStatus !== EJobApprovalStatus.APPROVED) {
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

    // Create case-insensitive regex for each skill
    const skillRegexes = skills.map(skill => new RegExp(skill, 'i'));

    return await this.jobModel
      .find({
        isActive: true,
        isDeleted: false,
        approvalStatus: EJobApprovalStatus.APPROVED,
        // Find jobs that have at least one matching skill
        skills: { $in: skillRegexes },
        // Filter out expired jobs
        $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
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
