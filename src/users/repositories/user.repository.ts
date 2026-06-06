import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { User as UserModel, UserDocument } from '../schemas/user.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import { IUser } from '../user.interface';
import {
  buildCanonicalCompanySnapshot,
  CompanySnapshotValue,
} from 'src/companies/company-snapshot.util';
import { CompanyDto } from 'src/companies/dto/company.dto';
import { ERole } from 'src/casl/enums/role.enum';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(UserModel.name) private readonly userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Job.name) private readonly jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(Company.name) private readonly companyModel: SoftDeleteModel<CompanyDocument>,
  ) {}

  validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findById(id)
      .select('-password -refreshToken')
      .exec() as Promise<UserDocument | null>;
  }

  async findOneByUserEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email, isDeleted: false });
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email, isDeleted: false });
  }

  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ googleId, isDeleted: false });
  }

  async findUserProfile(userId: string) {
    return this.userModel.findById(userId).lean().exec();
  }

  async findActiveUser(id: string) {
    return this.userModel
      .findOne({ _id: id, isDeleted: false })
      .select('_id email isLocked')
      .lean();
  }

  async findWithSelect(id: string, select: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select(select).exec() as Promise<UserDocument | null>;
  }

  async findOneWithSelect(
    filter: Record<string, any>,
    select: string,
  ): Promise<UserDocument | null> {
    return this.userModel.findOne(filter).select(select).lean();
  }

  async findPaginated(
    filter: any,
    offset: number,
    limit: number,
    sort: any,
    population: any,
  ): Promise<{ result: UserDocument[]; totalItems: number; totalPages: number }> {
    const totalItems = await this.userModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const result = await this.userModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .select('-password -refreshToken')
      .populate(population)
      .exec();

    return { result, totalItems, totalPages };
  }

  async emailExists(email: string): Promise<boolean> {
    const user = await this.userModel.findOne({ email, isDeleted: false }).select('_id').lean();
    return !!user;
  }

  async create(data: Record<string, any>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async updateOne(id: string, update: Record<string, any>) {
    return this.userModel.updateOne({ _id: id }, update);
  }

  async softDeleteById(id: string, deletedBy: { _id: string; email: string }) {
    await this.userModel.updateOne({ _id: id }, { deletedBy });
    return this.userModel.softDelete({ _id: id });
  }

  async bulkSoftDelete(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    return bulkSoftDelete(this.userModel, ids, user);
  }

  async addSavedJob(userId: string, jobId: string) {
    return this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $addToSet: { savedJobs: new mongoose.Types.ObjectId(jobId) } },
    );
  }

  async removeSavedJob(userId: string, jobId: string) {
    return this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $pull: { savedJobs: new mongoose.Types.ObjectId(jobId) } },
    );
  }

  async findUserWithSavedJobs(userId: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .select('savedJobs')
      .populate({
        path: 'savedJobs',
        match: { isDeleted: false },
        select: 'name skills company location salary level formOfWork startDate endDate',
      });
  }

  async addFollowedCompany(userId: string, companyId: string) {
    return this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $addToSet: { companyFollowed: new mongoose.Types.ObjectId(companyId) } },
    );
  }

  async removeFollowedCompany(userId: string, companyId: string) {
    return this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $pull: { companyFollowed: new mongoose.Types.ObjectId(companyId) } },
    );
  }

  async findUserWithFollowedCompanies(userId: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .select('companyFollowed')
      .populate({
        path: 'companyFollowed',
        match: { isDeleted: false },
        select: 'name logo description address numberOfEmployees',
      });
  }

  async findUserCompanyFollowed(userId: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .select('companyFollowed')
      .exec() as Promise<UserDocument | null>;
  }

  async jobExists(jobId: string): Promise<boolean> {
    const job = await this.jobModel.findOne({ _id: jobId, isDeleted: false }).select('_id').lean();
    return !!job;
  }

  async companyExists(companyId: string): Promise<boolean> {
    const company = await this.companyModel
      .findOne({ _id: companyId, isDeleted: false })
      .select('_id')
      .lean();
    return !!company;
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

  async resolveCompanyAssignmentForRole(
    role: ERole,
    company?: CompanyDto | null,
  ): Promise<CompanySnapshotValue | undefined> {
    if (!this.isSystemRole(role)) {
      throw new BadRequestException('Role is not supported by CASL');
    }
    if (role !== ERole.HR) {
      return undefined;
    }
    const companyId = company?._id?.toString();
    if (!companyId) {
      throw new BadRequestException('HR user must be assigned to a company');
    }
    return this.getCompanySnapshot(companyId);
  }

  private isSystemRole(roleName: string): roleName is ERole {
    return Object.values(ERole).includes(roleName as ERole);
  }

  toCompanyDto(
    company?: { _id?: unknown; name?: string; logo?: string | null } | null,
  ): CompanyDto | undefined {
    if (!company?._id) {
      return undefined;
    }
    return {
      _id: company._id.toString(),
      name: company.name,
      logo: company.logo ?? null,
    };
  }
}
