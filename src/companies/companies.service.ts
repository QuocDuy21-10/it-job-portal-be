import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { IUser } from 'src/users/users.interface';
import aqp from 'api-query-params';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';

@Injectable()
export class CompaniesService {
  constructor(@InjectModel(Company.name) private companyModel: SoftDeleteModel<CompanyDocument>, @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,) {}
  async create(createCompanyDto: CreateCompanyDto, user: IUser) {
    const isExistName = await this.companyModel.find({
      name: createCompanyDto.name,
      isDeleted: false,
    });

    if (isExistName && isExistName.length > 0) {
      throw new BadRequestException(`Company with name = ${createCompanyDto.name} already exists`);
    }

    return await this.companyModel.create({
      ...createCompanyDto,
      createdBy: { _id: user._id, email: user.email },
    });
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;

    // Filter theo companyId nếu user là HR
    if (user && user.role?.name === 'HR' && user.company?._id) {
      filter._id = user.company._id;
    }

    const offset = (page - 1) * limit;
    let defaultLimit = limit ? limit : 10;

    const totalItems = (await this.companyModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.companyModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .exec();

    // OPTIMIZED: Batch query for job counts using aggregation
    // Instead of N queries (one per company), use single aggregation query
    const companyIdStrings = result.map((company) => company._id.toString());
    
    const jobCounts = await this.jobModel.aggregate([
      {
        $match: {
          'company._id': { $in: companyIdStrings },
          isActive: true,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$company._id',
          totalJobs: { $sum: 1 },
        },
      },
    ]);
    
    // Create lookup map for O(1) access
    const jobCountMap = new Map<string, number>();
    jobCounts.forEach((item) => {
      jobCountMap.set(item._id, item.totalJobs);
    });

    const resultWithCount = result.map((company) => ({
      ...company.toObject(),
      totalJobs: jobCountMap.get(company._id.toString()) || 0,
    }));

    return {
      result: resultWithCount,
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

    // Nếu user là HR, chỉ cho phép xem company của chính họ
    if (user && user.role?.name === 'HR' && user.company?._id) {
      if (id !== user.company._id.toString()) {
        throw new BadRequestException('You can only view your own company');
      }
    }

    return await this.companyModel.findById(id);
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: IUser) {
    this.validateObjectId(id);
    return await this.companyModel.updateOne(
      { _id: id },
      { ...updateCompanyDto, updatedBy: { _id: user._id, email: user.email } },
    );
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    await this.companyModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.companyModel.softDelete({ _id: id });
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Company with id = ${id}`);
    }
  }
}
