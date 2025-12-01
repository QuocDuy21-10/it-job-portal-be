import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { IUser } from 'src/users/users.interface';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Job, JobDocument } from './schemas/job.schema';
import mongoose from 'mongoose';
import aqp from 'api-query-params';
import { CompanyFollowerQueueService } from 'src/queues/services/company-follower-queue.service';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
    private readonly companyFollowerQueueService: CompanyFollowerQueueService,
  ) {}
  async create(createJobDto: CreateJobDto, user: IUser) {
    const newJob = await this.jobModel.create({
      ...createJobDto,
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

    // Filter theo companyId nếu user là HR
    if (user && user.role?.name === 'HR' && user.company?._id) {
      filter['company._id'] = user.company._id;
    }

    let offset = (page - 1) * limit;
    let defaultLimit = limit ? limit : 10;

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

    // Lấy job theo id và populate thông tin công ty (name, numberOfEmployees, address)
    const job = await this.jobModel.findById(id)
      .populate({
        path: 'company',
        select: {
          name: 1,
          numberOfEmployees: 1,
          address: 1,
        },
        model: 'Company',
      })
      .exec();

    // Nếu user là HR, chỉ cho phép xem job của công ty họ
    if (user && user.role?.name === 'HR' && user.company?._id) {
      if (job && job.company && job.company._id.toString() !== user.company._id.toString()) {
        throw new BadRequestException('You can only view jobs of your own company');
      }
    }

    return job;
  }

  async update(id: string, updateJobDto: UpdateJobDto, user: IUser) {
    this.validateObjectId(id);
    return await this.jobModel.updateOne(
      { _id: id },
      { ...updateJobDto, updatedBy: { _id: user._id, email: user.email } },
    );
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
    const skillRegexes = skills.map((skill) => new RegExp(skill, 'i'));

    return await this.jobModel
      .find({
        isActive: true,
        isDeleted: false,
        // Find jobs that have at least one matching skill
        skills: { $in: skillRegexes },
        // Filter out expired jobs
        $or: [
          { endDate: { $gte: new Date() } },
          { endDate: null },
        ],
      })
      .select('name company location skills level') // Select only necessary fields to reduce token usage
      .populate('company', 'name') // Populate company name
      .sort({ createdAt: -1 }) // Prioritize newest jobs
      .limit(limit)
      .lean()
      .exec();
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
}
