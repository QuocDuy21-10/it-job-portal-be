import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { IUser } from 'src/users/users.interface';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Job, JobDocument } from './schemas/job.schema';
import mongoose from 'mongoose';
import aqp from 'api-query-params';

@Injectable()
export class JobsService {
  constructor(@InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>) {}
  async create(createJobDto: CreateJobDto, user: IUser) {
    const newJob = await this.jobModel.create({
      ...createJobDto,
      createdBy: { _id: user._id, email: user.email },
    });
    return { _id: newJob._id, createdAt: newJob.createdAt };
  }

  async findAll(currentPage?: number, limit?: number, query?: string) {
    const { filter, sort, population } = aqp(query);
    delete filter.current;
    delete filter.pageSize;
    let offset = (currentPage - 1) * limit;
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
        current: currentPage,
        pageSize: limit,
        totalPages,
        totalItems,
      },
    };
  }

  async findOne(id: string) {
    this.validateObjectId(id);
    return await this.jobModel.findById(id);
  }

  async update(id: string, updateJobDto: UpdateJobDto, user: IUser) {
    this.validateObjectId(id);
    return await this.jobModel.updateOne(
      { _id: id },
      { ...updateJobDto, updatedBy: { _id: user._id, email: user.email } },
    );
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
