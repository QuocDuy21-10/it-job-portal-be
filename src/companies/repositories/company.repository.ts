import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { Company, CompanyDocument } from '../schemas/company.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import { buildEmbeddedCompanyIdsInCondition } from '../company-snapshot.util';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { TopHiringCompanyDto } from '../dto/top-hiring-company.dto';

@Injectable()
export class CompanyRepository {
  constructor(
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<UserDocument>,
  ) {}

  validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Không tìm thấy công ty có id = ${id}`);
    }
  }

  async existsByName(name: string): Promise<boolean> {
    const count = await this.companyModel.countDocuments({ name });
    return count > 0;
  }

  async isLogoUsedByAnotherCompany(logo: string, exceptCompanyId?: string): Promise<boolean> {
    const filter = exceptCompanyId ? { logo, _id: { $ne: exceptCompanyId } } : { logo };
    return (await this.companyModel.countDocuments(filter)) > 0;
  }

  async create(data: Record<string, any>): Promise<CompanyDocument> {
    return this.companyModel.create(data);
  }

  async findPaginated(
    filter: Record<string, any>,
    offset: number,
    limit: number,
    sort: Record<string, any>,
    projection?: string,
  ): Promise<{ result: Company[]; totalItems: number; totalPages: number }> {
    const totalItems = await this.companyModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const result = await this.companyModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .select(projection ?? '')
      .lean()
      .exec();

    return { result: result as unknown as Company[], totalItems, totalPages };
  }

  // Soft-deleted companies are invisible to every by-ID read and update.
  async findById(id: string, projection?: string): Promise<CompanyDocument | null> {
    return this.companyModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .select(projection ?? '')
      .exec();
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>) {
    return this.companyModel.updateOne({ ...filter, isDeleted: { $ne: true } }, update);
  }

  async softDeleteById(id: string, deletedBy: { _id: any; email: string }) {
    await this.companyModel.updateOne({ _id: id }, { deletedBy });
    return this.companyModel.softDelete({ _id: id });
  }

  async bulkSoftDelete(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    return bulkSoftDelete(this.companyModel, ids, user);
  }

  /** Copies a company's current name and logo into the snapshot that jobs and HR users embed. */
  async syncCompanySnapshot(
    companyId: string,
    snapshot: { name: string; logo: string | null },
  ): Promise<void> {
    const filter = { 'company._id': buildEmbeddedCompanyIdsInCondition([companyId]) };
    const update = { $set: { 'company.name': snapshot.name, 'company.logo': snapshot.logo } };
    await Promise.all([
      this.jobModel.updateMany(filter, update),
      this.userModel.updateMany(filter, update),
    ]);
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

  async findTopHiringCompanies(limit: number): Promise<TopHiringCompanyDto[]> {
    const now = new Date();

    return this.jobModel.aggregate<TopHiringCompanyDto>([
      {
        $match: {
          isActive: true,
          isDeleted: { $ne: true },
          approvalStatus: EJobApprovalStatus.APPROVED,
          $or: [{ endDate: { $gte: now } }, { endDate: null }],
        },
      },
      {
        $addFields: {
          companyIdString: { $toString: '$company._id' },
        },
      },
      {
        $group: {
          _id: '$companyIdString',
          companyName: { $first: '$company.name' },
          totalOpenJobs: { $sum: 1 },
          latestJobCreatedAt: { $max: '$createdAt' },
        },
      },
      {
        $sort: {
          totalOpenJobs: -1,
          latestJobCreatedAt: -1,
          companyName: 1,
        },
      },
      { $limit: limit },
      {
        $addFields: {
          companyObjectId: {
            $cond: [
              { $regexMatch: { input: '$_id', regex: /^[0-9a-fA-F]{24}$/ } },
              { $toObjectId: '$_id' },
              null,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyObjectId',
          foreignField: '_id',
          as: 'company',
        },
      },
      { $unwind: '$company' },
      { $match: { 'company.isDeleted': { $ne: true } } },
      {
        $project: {
          _id: '$_id',
          name: '$company.name',
          logo: '$company.logo',
          address: '$company.address',
          website: '$company.website',
          numberOfEmployees: '$company.numberOfEmployees',
          totalOpenJobs: 1,
        },
      },
    ]);
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
