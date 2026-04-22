import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { Company, CompanyDocument } from '../schemas/company.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import { buildEmbeddedCompanyIdsInCondition } from '../company-snapshot.util';

@Injectable()
export class CompanyRepository {
  constructor(
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
  ) {}

  validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Company with id = ${id}`);
    }
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.companyModel.countDocuments({ name });
    return count > 0;
  }

  async create(data: Record<string, any>): Promise<CompanyDocument> {
    return this.companyModel.create(data);
  }

  async findPaginated(
    filter: Record<string, any>,
    offset: number,
    limit: number,
    sort: Record<string, any>,
  ): Promise<{ result: Company[]; totalItems: number; totalPages: number }> {
    const totalItems = await this.companyModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const result = await this.companyModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .lean()
      .exec();

    return { result: result as unknown as Company[], totalItems, totalPages };
  }

  async findById(id: string): Promise<CompanyDocument | null> {
    return this.companyModel.findById(id).exec();
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>) {
    return this.companyModel.updateOne(filter, update);
  }

  async softDeleteById(id: string, deletedBy: { _id: any; email: string }) {
    await this.companyModel.updateOne({ _id: id }, { deletedBy });
    return this.companyModel.softDelete({ _id: id });
  }

  async bulkSoftDelete(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    return bulkSoftDelete(this.companyModel, ids, user);
  }

  async deactivateJobsForCompanies(ids: string[]): Promise<number> {
    const result = await this.jobModel.updateMany(
      {
        'company._id': buildEmbeddedCompanyIdsInCondition(ids),
        isActive: true,
        isDeleted: { $ne: true },
      },
      { isActive: false },
    );
    return result.modifiedCount;
  }

  async getJobCountsForCompanies(
    companyIds: Array<string | mongoose.Types.ObjectId>,
  ): Promise<Map<string, number>> {
    if (companyIds.length === 0) return new Map();

    const jobCounts = await this.jobModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      totalJobs: number;
    }>([
      {
        $match: {
          'company._id': buildEmbeddedCompanyIdsInCondition(companyIds),
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

    const map = new Map<string, number>();
    jobCounts.forEach(item => {
      map.set(item._id.toString(), item.totalJobs);
    });
    return map;
  }

  async findLogoReferences(): Promise<string[]> {
    const [activeCompanies, deletedCompanies] = await Promise.all([
      this.companyModel
        .find({ logo: { $ne: null } })
        .select('logo')
        .lean(),
      this.companyModel
        .find({ isDeleted: true, logo: { $ne: null } })
        .select('logo')
        .lean(),
    ]);

    return [...activeCompanies, ...deletedCompanies]
      .map(c => (c as any).logo)
      .filter((logo): logo is string => Boolean(logo));
  }

  async findByNameRegex(
    escapedName: string,
    limit: number,
  ): Promise<
    Array<{
      _id: mongoose.Types.ObjectId;
      name: string;
      address: string;
      description: string;
      website?: string;
      numberOfEmployees?: number;
    }>
  > {
    return this.companyModel
      .find({
        name: { $regex: escapedName, $options: 'i' },
        isDeleted: { $ne: true },
      })
      .select('_id name address description website numberOfEmployees')
      .limit(limit)
      .lean()
      .exec() as unknown as Array<{
      _id: mongoose.Types.ObjectId;
      name: string;
      address: string;
      description: string;
      website?: string;
      numberOfEmployees?: number;
    }>;
  }
}
