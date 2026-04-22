import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import mongoose from 'mongoose';
import { Resume, ResumeDocument } from '../schemas/resume.schema';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { bulkSoftDelete } from 'src/utils/helpers/bulk-soft-delete.helper';
import { buildEmbeddedCompanyIdFilter } from 'src/companies/company-snapshot.util';

@Injectable()
export class ResumeRepository {
  constructor(
    @InjectModel(Resume.name) private readonly resumeModel: SoftDeleteModel<ResumeDocument>,
    @InjectModel(User.name) private readonly userModel: SoftDeleteModel<UserDocument>,
  ) {}

  async findById(id: string): Promise<ResumeDocument | null> {
    return this.resumeModel.findById(id).exec();
  }

  async findPaginated(
    filter: Record<string, any>,
    offset: number,
    limit: number,
    sort: Record<string, any>,
    population?: any,
    projection?: any,
  ): Promise<{ result: ResumeDocument[]; totalItems: number; totalPages: number }> {
    const totalItems = await this.resumeModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const result = await this.resumeModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .populate(population)
      .select(projection as any)
      .lean()
      .exec();

    return { result: result as unknown as ResumeDocument[], totalItems, totalPages };
  }

  async findByUserId(userId: string): Promise<ResumeDocument[]> {
    return this.resumeModel
      .find({ userId: userId })
      .sort('-createdAt')
      .populate([
        { path: 'companyId', select: { name: 1 } },
        { path: 'jobId', select: { name: 1, location: 1, salary: 1 } },
      ])
      .lean()
      .exec() as unknown as ResumeDocument[];
  }

  async findUrlsByUserId(userId: string): Promise<ResumeDocument[]> {
    return this.resumeModel
      .find({ userId: userId })
      .select(['url'])
      .sort('-createdAt')
      .lean()
      .exec() as unknown as ResumeDocument[];
  }

  async findDuplicateApplication(userId: string, jobId: string): Promise<ResumeDocument | null> {
    return this.resumeModel
      .findOne({
        userId: new mongoose.Types.ObjectId(userId),
        jobId: new mongoose.Types.ObjectId(jobId),
        isDeleted: { $ne: true },
      })
      .exec();
  }

  async findByIdWithPopulate(id: string): Promise<ResumeDocument | null> {
    return this.resumeModel
      .findById(id)
      .populate('jobId', 'name')
      .populate('companyId', 'name')
      .lean()
      .exec() as unknown as ResumeDocument;
  }

  async create(data: Record<string, any>): Promise<ResumeDocument> {
    return this.resumeModel.create(data);
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>) {
    return this.resumeModel.updateOne(filter, update);
  }

  async softDeleteById(id: string, deletedBy: { _id: string; email: string }) {
    await this.resumeModel.updateOne({ _id: id }, { deletedBy });
    return this.resumeModel.softDelete({ _id: id });
  }

  async countDocuments(filter: Record<string, any>): Promise<number> {
    return this.resumeModel.countDocuments(filter);
  }

  async countOwnedByCompany(ids: string[], companyId: string): Promise<number> {
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
    return this.resumeModel.countDocuments({
      _id: { $in: objectIds },
      companyId: new mongoose.Types.ObjectId(companyId),
      isDeleted: { $ne: true },
    });
  }

  async bulkSoftDelete(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    return bulkSoftDelete(this.resumeModel, ids, user);
  }

  /** Used by ApplicationNotificationService to find HR users for a company. */
  async findHrUsersByCompany(companyId: string) {
    return this.userModel
      .find({
        ...buildEmbeddedCompanyIdFilter(companyId),
        isDeleted: { $ne: true },
        isActive: true,
      })
      .select('_id email name')
      .lean();
  }
}
