import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { Job, JobDocument } from '../schemas/job.schema';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import {
  buildCanonicalCompanySnapshot,
  CompanySnapshotValue,
} from 'src/companies/company-snapshot.util';

@Injectable()
export class JobRepository {
  constructor(
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
  ) {}

  validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  async findById(id: string): Promise<JobDocument | null> {
    return this.jobModel.findById(id).exec();
  }

  async findPaginated(
    filter: Record<string, any>,
    offset: number,
    limit: number,
    sort: Record<string, any>,
  ): Promise<{ result: Job[]; totalItems: number; totalPages: number }> {
    const totalItems = await this.jobModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const result = await this.jobModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .lean()
      .exec();

    return { result: result as unknown as Job[], totalItems, totalPages };
  }

  async create(data: Record<string, any>): Promise<JobDocument> {
    return this.jobModel.create(data);
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>) {
    return this.jobModel.updateOne(filter, update);
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>) {
    return this.jobModel.updateMany(filter, update);
  }

  async softDeleteById(id: string, deletedBy: { _id: string; email: string }) {
    await this.jobModel.updateOne({ _id: id }, { deletedBy });
    return this.jobModel.softDelete({ _id: id });
  }

  async countDocuments(filter: Record<string, any>): Promise<number> {
    return this.jobModel.countDocuments(filter);
  }

  async countJobsOwnedByCompany(ids: string[], companyId: string): Promise<number> {
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
    return this.jobModel.countDocuments({
      _id: { $in: objectIds },
      'company._id': new mongoose.Types.ObjectId(companyId),
      isDeleted: { $ne: true },
    });
  }

  async bulkSoftDelete(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    return bulkSoftDelete(this.jobModel, ids, user);
  }

  async findLean(
    filter: Record<string, any>,
    select: string,
    sort: Record<string, any>,
    limit: number,
  ): Promise<Job[]> {
    return this.jobModel
      .find(filter)
      .select(select)
      .sort(sort as any)
      .limit(limit)
      .lean()
      .exec() as unknown as Job[];
  }

  async findExpiredJobsLean(filter: Record<string, any>, select: string): Promise<JobDocument[]> {
    return this.jobModel.find(filter).select(select).lean().exec() as unknown as JobDocument[];
  }

  async aggregate(pipeline: any[]): Promise<any[]> {
    return this.jobModel.aggregate(pipeline);
  }

  async getCompanySnapshot(companyId: string): Promise<CompanySnapshotValue> {
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
