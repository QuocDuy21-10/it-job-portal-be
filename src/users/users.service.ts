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
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserModel.name) private userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Role.name) private roleModel: SoftDeleteModel<RoleDocument>,
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(Company.name) private companyModel: SoftDeleteModel<CompanyDocument>,
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
   * MỤC ĐÍCH:
   * - Lấy thông tin User Profile ĐẦY ĐỦ & MỚI NHẤT từ DB
   * - Sử dụng cho API GET /auth/me
   * - Đảm bảo Fresh Data (name, role, permissions có thể thay đổi)
   * 
   * KIẾN TRÚC:
   * - 1 query duy nhất với nested populate tối ưu
   * - Populate: role → permissions, company, savedJobs IDs, companyFollowed IDs
   * - Validate: isActive, isDeleted
   * - Return: IUser interface chuẩn
   * 
   * BEST PRACTICE:
   * - Tách rõ logic Auth vs User Profile
   * - JwtStrategy chỉ validate token → lightweight
   * - Controller gọi method này để lấy fresh data
   * 
   * @param userId - User ID từ JWT payload
   * @returns Promise<IUser> - Complete user profile
   * @throws BadRequestException - Nếu user không tồn tại hoặc bị vô hiệu hóa
   */
  async findUserProfile(userId: string): Promise<IUser> {
    this.validateObjectId(userId);
    const user = await this.userModel
      .findById(userId)
      .populate({
        path: 'role',
        select: '_id name permissions',
        populate: {
          path: 'permissions',
          select: '_id name apiPath method module',
        },
      })
      .populate({
        path: 'company',
        select: '_id name logo address',
      })
      .select('-password') 
      .lean() // Convert to plain JS object (performance boost)
      .exec();

    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (!user.isActive) {
      throw new BadRequestException(
        'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ admin.',
      );
    }
    if (user.isDeleted) {
      throw new BadRequestException('Tài khoản đã bị xóa');
    }
    const userRole = user.role as any;
    if (!userRole || !userRole._id) {
      throw new BadRequestException('Role không hợp lệ. Vui lòng liên hệ admin.');
    }
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: {
        _id: userRole._id.toString(),
        name: userRole.name,
      },
      permissions:
        userRole.permissions?.map((perm: any) => ({
          _id: perm._id?.toString() || '',
          name: perm.name || '',
          apiPath: perm.apiPath || '',
          module: perm.module || '',
        })) ?? [],
      company: user.company
        ? {
            _id: (user.company as any)._id?.toString() || '',
            name: (user.company as any).name || '',
            logo: (user.company as any).logo,
          }
        : undefined,
      savedJobs: user.savedJobs?.map((id: any) => id.toString()) || [],
      companyFollowed: user.companyFollowed?.map((id: any) => id.toString()) || [],
    };
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

  // ==================== SAVE JOB FEATURE ====================

  /**
   * Save a job to user's saved jobs list
   * Uses $addToSet to prevent duplicates
   */
  async saveJob(userId: string, jobId: string): Promise<void> {
    this.validateObjectId(userId);
    this.validateObjectId(jobId);

    // Validate job exists and is active
    const job = await this.jobModel.findOne({ _id: jobId, isDeleted: false });
    if (!job) {
      throw new BadRequestException('Job not found or has been deleted');
    }

    // Use $addToSet to add jobId only if it doesn't exist
    const result = await this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $addToSet: { savedJobs: new mongoose.Types.ObjectId(jobId) } },
    );

    if (result.matchedCount === 0) {
      throw new BadRequestException('User not found');
    }
  }

  /**
   * Remove a job from user's saved jobs list
   * Uses $pull to remove the jobId
   */
  async unsaveJob(userId: string, jobId: string): Promise<void> {
    this.validateObjectId(userId);
    this.validateObjectId(jobId);

    // Use $pull to remove jobId from array
    const result = await this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $pull: { savedJobs: new mongoose.Types.ObjectId(jobId) } },
    );

    if (result.matchedCount === 0) {
      throw new BadRequestException('User not found');
    }
  }

  /**
   * Get all saved jobs for a user with pagination
   */
  async getSavedJobs(userId: string, page: number = 1, limit: number = 10) {
    this.validateObjectId(userId);

    const offset = (page - 1) * limit;

    // Find user and populate saved jobs
    const user = await this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .select('savedJobs')
      .populate({
        path: 'savedJobs',
        match: { isDeleted: false }, // Only get non-deleted jobs
        select: 'name skills company location salary level formOfWork startDate endDate',
        populate: {
          path: 'company',
          select: 'name logo',
          model: 'Company',
        },
      });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const savedJobs = user.savedJobs || [];
    const total = savedJobs.length;
    const totalPages = Math.ceil(total / limit);

    // Manual pagination on populated array
    const paginatedJobs = savedJobs.slice(offset, offset + limit);

    return {
      result: paginatedJobs,
      meta: {
        current: page,
        pageSize: limit,
        pages: totalPages,
        total,
      },
    };
  }

  // ==================== FOLLOW COMPANY FEATURE ====================

  /**
   * Follow a company (maximum 5 companies)
   * Uses $addToSet to prevent duplicates
   */
  async followCompany(userId: string, companyId: string): Promise<void> {
    this.validateObjectId(userId);
    this.validateObjectId(companyId);

    // Validate company exists
    const company = await this.companyModel.findOne({ _id: companyId, isDeleted: false });
    if (!company) {
      throw new BadRequestException('Company not found or has been deleted');
    }

    // Get current user to check following count
    const user = await this.userModel.findOne({ _id: userId, isDeleted: false }).select('companyFollowed');
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if already following this company
    const isAlreadyFollowing = user.companyFollowed?.some(
      (id) => id.toString() === companyId,
    );

    if (isAlreadyFollowing) {
      throw new BadRequestException('You are already following this company');
    }

    // Validate maximum 5 companies
    if (user.companyFollowed && user.companyFollowed.length >= 5) {
      throw new BadRequestException('You can only follow up to 5 companies. Please unfollow a company first.');
    }

    // Use $addToSet to add companyId
    await this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $addToSet: { companyFollowed: new mongoose.Types.ObjectId(companyId) } },
    );
  }

  /**
   * Unfollow a company
   * Uses $pull to remove the companyId
   */
  async unfollowCompany(userId: string, companyId: string): Promise<void> {
    this.validateObjectId(userId);
    this.validateObjectId(companyId);

    // Use $pull to remove companyId from array
    const result = await this.userModel.updateOne(
      { _id: userId, isDeleted: false },
      { $pull: { companyFollowed: new mongoose.Types.ObjectId(companyId) } },
    );

    if (result.matchedCount === 0) {
      throw new BadRequestException('User not found');
    }
  }

  /**
   * Get all companies that user is following
   */
  async getFollowingCompanies(userId: string) {
    this.validateObjectId(userId);

    // Find user and populate following companies
    const user = await this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .select('companyFollowed')
      .populate({
        path: 'companyFollowed',
        match: { isDeleted: false }, // Only get non-deleted companies
        select: 'name logo description address numberOfEmployees',
      });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      result: user.companyFollowed || [],
      total: user.companyFollowed?.length || 0,
    };
  }
}
