import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateResumeDto, CreateUserCvDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { IUser } from 'src/users/users.interface';
import { Resume, ResumeDocument } from './schemas/resume.schema';
import { InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import aqp from 'api-query-params';
import mongoose from 'mongoose';
import { ResumeStatus } from './enums/resume-status.enum';

@Injectable()
export class ResumesService {
  constructor(@InjectModel(Resume.name) private resumeModel: SoftDeleteModel<ResumeDocument>) {}
  async create(createUserCvDto: CreateUserCvDto, user: IUser) {
    const newResume = await this.resumeModel.create({
      email: user.email,
      userId: user._id,
      status: ResumeStatus.PENDING,
      histories: [
        {
          status: ResumeStatus.PENDING,
          updatedAt: new Date(),
          updatedBy: { _id: user._id, email: user.email },
        },
      ],
      ...createUserCvDto,
      createdBy: { _id: user._id, email: user.email },
    });
    return { _id: newResume?._id, createdAt: newResume?.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter, sort, population, projection } = aqp(query);
    delete filter.page;
    delete filter.limit;

    // Filter theo companyId nếu user là HR
    if (user && user.role?.name === 'HR' && user.company?._id) {
      filter.companyId = user.company._id;
    }

    let offset = (page - 1) * limit;
    let defaultLimit = limit ? limit : 10;

    const totalItems = (await this.resumeModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.resumeModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .select(projection as any)
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

    const resume = await this.resumeModel.findById(id);

    // Nếu user là HR, chỉ cho phép xem resume của công ty họ
    if (user && user.role?.name === 'HR' && user.company?._id) {
      if (resume && resume.companyId?.toString() !== user.company._id.toString()) {
        throw new BadRequestException('You can only view resumes of your own company');
      }
    }

    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, user: IUser) {
    this.validateObjectId(id);
    const { status } = updateResumeDto;
    return await this.resumeModel.updateOne(
      { _id: id },
      {
        status,
        updatedBy: { _id: user._id, email: user.email },
        $push: {
          histories: {
            status,
            updatedAt: new Date(),
            updatedBy: { _id: user._id, email: user.email },
          },
        },
      },
    );
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    await this.resumeModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.resumeModel.softDelete({ _id: id });
  }

  async getResumeByUser(user: IUser) {
    return await this.resumeModel
      .find({ userId: user._id })
      .sort('-createdAt')
      .populate([
        {
          path: 'companyId',
          select: {
            name: 1,
          },
        },
        {
          path: 'jobId',
          select: {
            name: 1,
            location: 1,
            salary: 1,
          },
        },
      ]);
  }

  async getResumeOfMe(user: IUser) {
    return await this.resumeModel
      .find({ userId: user._id }).select(['url'])
      .sort('-createdAt')
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Resume with id = ${id}`);
    }
  }
}
