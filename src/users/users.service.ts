import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User as UserModel, UserDocument } from './schemas/user.schema';
import mongoose from 'mongoose';
import { genSaltSync, hashSync, compareSync } from 'bcryptjs';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from './users.interface';
import aqp from 'api-query-params';
import { User } from 'src/decorator/customize';
import { ConfigService } from '@nestjs/config';
import { Role, RoleDocument } from 'src/roles/schemas/role.schema';
import { USER_ROLE } from 'src/databases/sample';
import { AuthRegisterDto } from 'src/auth/dto/auth-register.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserModel.name) private userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Role.name) private roleModel: SoftDeleteModel<RoleDocument>,
    private configService: ConfigService,
  ) {}
  hashPassword(password: string) {
    const salt = genSaltSync(10);
    const hash = hashSync(password, salt);
    return hash;
  }
  async create(CreateUserDto: CreateUserDto, @User() user: IUser) {
    const { name, email, password, age, gender, address, role, company } = CreateUserDto;
    const isExistEmail = await this.userModel.findOne({ email, isDeleted: false });
    if (isExistEmail) {
      throw new BadRequestException(
        `Email already exists in the system. Please use another email.`,
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

  async register(user: AuthRegisterDto) {
    const { name, email, password } = user;
    const isExistEmail = await this.userModel.findOne({ email, isDeleted: false });
    if (isExistEmail) {
      throw new BadRequestException(
        `Email already exists in the system. Please use another email.`,
      );
    }
    // get user role
    const userRole = await this.roleModel.findOne({ name: USER_ROLE });

    const hashedPassword = this.hashPassword(password);
    let newUser = await this.userModel.create({
      name,
      email,
      password: hashedPassword,
      role: userRole?._id,
    });
    return newUser;
  }

  async findAll(currentPage: number, limit: number, query: string) {
    const { filter, sort, population } = aqp(query);
    delete filter.current;
    delete filter.pageSize;
    let offset = (currentPage - 1) * limit;
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
        current: currentPage,
        pageSize: limit,
        pages: totalPages,
        total: totalItems,
      },
    };
  }

  findOne(id: string) {
    this.validateObjectId(id);
    return this.userModel
      .findById({ _id: id })
      .select('-password')
      .populate({
        path: 'role',
        select: {
          _id: 1,
          name: 1,
        },
      });
  }

  findOneByUserEmail(email: string) {
    return this.userModel.findOne({ email: email }).populate({
      path: 'role',
      select: {
        name: 1,
      },
    });
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
    const userAdmin = await this.userModel.findOne({ _id: id });
    const emailAdmin = this.configService.get<string>('EMAIL_ADMIN');
    if (userAdmin && userAdmin.email === emailAdmin) {
      throw new BadRequestException('Cannot delete admin account');
    }
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

  async findUserByRefreshToken(refreshToken: string) {
    return await this.userModel.findOne({ refreshToken }).populate({
      path: 'role',
      select: {
        name: 1,
      },
    });
  }
  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }
}
