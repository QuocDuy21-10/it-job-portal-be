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
import { AuthProvider } from 'src/auth/enums/auth-provider.enum';

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

    // Validation: HR phải có company
    const userRole = await this.roleModel.findById(role);
    if (userRole && userRole.name === 'HR') {
      if (!company || !company._id) {
        throw new BadRequestException('HR user must be assigned to a company');
      }
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

  async findAll(page: number, limit: number, query: string) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;
    let offset = (page - 1) * limit;
    let defaultLimit = limit ? limit : 10;

    const totalItems = (await this.userModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.userModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .select('-password -refreshToken')
      .populate(population)
      .exec();
    return {
      result,
      meta: {
        current: page,
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
      .select('-password -refreshToken')
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

    // Validation: Nếu update role thành HR hoặc user đã là HR, phải có company
    if (updateUserDto.role || updateUserDto.company !== undefined) {
      const existingUser = await this.userModel.findById(id);
      const roleToCheck = updateUserDto.role || existingUser?.role;

      if (roleToCheck) {
        const userRole = await this.roleModel.findById(roleToCheck);
        if (userRole && userRole.name === 'HR') {
          const companyToCheck = updateUserDto.company !== undefined 
            ? updateUserDto.company 
            : existingUser?.company;
          
          if (!companyToCheck || !companyToCheck._id) {
            throw new BadRequestException('HR user must be assigned to a company');
          }
        }
      }
    }

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

  /**
   * Update user active status (for email verification)
   */
  async updateUserStatus(id: string, isActive: boolean) {
    this.validateObjectId(id);
    return await this.userModel.updateOne({ _id: id }, { isActive });
  }

  /**
   * Update user password
   */
  async updatePassword(id: string, newPasswordHash: string) {
    this.validateObjectId(id);
    return await this.userModel.updateOne({ _id: id }, { password: newPasswordHash });
  }

  /**
   * Validate MongoDB ObjectId format
   */
  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  /**
   * Find user by Google ID
   */
  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ googleId, isDeleted: false }).populate({
      path: 'role',
      select: {
        name: 1,
      },
    });
  }

  /**
   * Find user by email (for Google login)
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ email, isDeleted: false }).populate({
      path: 'role',
      select: {
        name: 1,
      },
    });
  }

  /**
   * Create new user from Google authentication
   */
  async createGoogleUser(googleProfile: {
    googleId: string;
    email: string;
    name: string;
    avatar?: string;
  }): Promise<UserDocument> {
    const { googleId, email, name, avatar } = googleProfile;

    // Get default user role
    const userRole = await this.roleModel.findOne({ name: USER_ROLE });

    const newUser = await this.userModel.create({
      googleId,
      email,
      name,
      password: null, // No password for Google users
      authProvider: AuthProvider.GOOGLE,
      role: userRole?._id,
      isActive: true, // Google users are auto-activated
    });

    return newUser;
  }

  /**
   * Update existing user with Google ID (link Google account)
   */
  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { googleId, authProvider: AuthProvider.GOOGLE },
    );
  }
}
