import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto, RegisterUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User as UserModel, UserDocument } from './schemas/user.schema';
import mongoose from 'mongoose';
import { genSaltSync, hashSync, compareSync } from 'bcryptjs';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from './users.interface';
import aqp from 'api-query-params';
import { User } from 'src/decorator/customize';

@Injectable()
export class UsersService {
  constructor(@InjectModel(UserModel.name) private userModel: SoftDeleteModel<UserDocument>) {}
  hashPassword(password: string) {
    const salt = genSaltSync(10);
    const hash = hashSync(password, salt);
    return hash;
  }
  async create(CreateUserDto: CreateUserDto, @User() user: IUser) {
    const { name, email, password, age, gender, address, role, company } = CreateUserDto;
    const isExist = await this.userModel.findOne({ email });
    if (isExist) {
      throw new BadRequestException(
        `Email: ${email} đã tồn tại trên hệ thống. Vui lòng sử dụng email khác.`,
      );
    }
    const hashedPassword = this.hashPassword(password);
    let newUser = await this.userModel.create({
      name,
      email,
      password: hashedPassword,
      age,
      gender,
      address,
      role,
      company,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });
    return {
      _id: newUser._id,
      createAt: newUser.createdAt,
    };
  }

  async register(user: RegisterUserDto) {
    const { name, email, password, age, gender, address } = user;
    const isExistEmail = await this.userModel.findOne({ email });
    if (isExistEmail) {
      throw new BadRequestException(
        `Email: ${email} đã tồn tại trên hệ thống. Vui lòng sử dụng email khác.`,
      );
    }
    const hashedPassword = this.hashPassword(password);
    let newUser = await this.userModel.create({
      name,
      email,
      password: hashedPassword,
      age,
      gender,
      address,
      role: 'JOB_SEEKER',
    });
    return newUser;
  }

  async findAll(currentPage: number, limit: number, query: string) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;
    const offset = (currentPage - 1) * limit;
    let defaultLimit = limit ? limit : 10;

    const totalItems = (await this.userModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.userModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .select('-password')
      .populate(population)
      .exec();
    return {
      result,
      meta: {
        currentPage,
        pageSize: limit,
        totalPages,
        totalItems,
      },
    };
  }

  findOne(id: string) {
    this.validateObjectId(id);
    return this.userModel.findById({ _id: id }).select('-password');
  }

  findOneByUsername(username: string) {
    return this.userModel.findOne({ email: username });
  }

  isValidPassword(password: string, hash: string) {
    return compareSync(password, hash);
  }

  async update(id: string, updateUserDto: UpdateUserDto, user: IUser) {
    this.validateObjectId(id);
    return await this.userModel.updateOne(
      { _id: id },
      {
        ...updateUserDto,
        updatedBy: { _id: user._id, email: user.email },
      },
    );
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    await this.userModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.userModel.softDelete({ _id: id });
  }

  async updateUserToken(id: string, refreshToken: string) {
    this.validateObjectId(id);
    return this.userModel.updateOne({ _id: id }, { refreshToken });
  }
  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }
}
