import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User as UserModel, UserDocument } from './schemas/user.schema';
import mongoose from 'mongoose';
import { genSaltSync, hashSync, compareSync } from 'bcryptjs';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { IUser } from './user.interface';
import aqp from 'api-query-params';
import { User } from 'src/utils/decorators/user.decorator';
import { ConfigService } from '@nestjs/config';
import { Role, RoleDocument } from 'src/roles/schemas/role.schema';
import { ERole } from 'src/casl/enums/role.enum';
import { AuthRegisterDto } from 'src/auth/dto/auth-register.dto';
import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { Company, CompanyDocument } from 'src/companies/schemas/company.schema';
import {
  buildCanonicalCompanySnapshot,
  CompanySnapshotValue,
} from 'src/companies/company-snapshot.util';
import { CompanyDto } from 'src/companies/dto/company.dto';
import { SessionsService } from 'src/sessions/sessions.service';
import { LockUserDto } from './dto/lock-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserModel.name) private userModel: SoftDeleteModel<UserDocument>,
    @InjectModel(Role.name) private roleModel: SoftDeleteModel<RoleDocument>,
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
    @InjectModel(Company.name) private companyModel: SoftDeleteModel<CompanyDocument>,
    private configService: ConfigService,
    private sessionsService: SessionsService,
  ) {}
  hashPassword(password: string) {
    const salt = genSaltSync(10);
    const hash = hashSync(password, salt);
    return hash;
  }
  async create(CreateUserDto: CreateUserDto, @User() user: IUser) {
    const { name, email, password, role, company } = CreateUserDto;
    const isExistEmail = await this.userModel.findOne({ email, isDeleted: false });
    if (isExistEmail) {
      throw new BadRequestException(
        `Email already exists in the system. Please use another email.`,
      );
    }

    const normalizedCompany = await this.resolveCompanyAssignmentForRole(role, company);

    const hashedPassword = this.hashPassword(password);
    const newUser = await this.userModel.create({
      name,
      email,
      password: hashedPassword,
      role,
      company: normalizedCompany,
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
    const userRole = await this.roleModel.findOne({ name: ERole.NORMAL_USER });

    const hashedPassword = this.hashPassword(password);
    // verificationExpires: 15 minutes from now — MongoDB TTL index auto-deletes if not verified
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    const newUser = await this.userModel.create({
      name,
      email,
      password: hashedPassword,
      role: userRole?._id,
      verificationExpires,
    });
    return newUser;
  }

  async updateUnverifiedUser(id: string, dto: AuthRegisterDto): Promise<any> {
    this.validateObjectId(id);
    const hashedPassword = this.hashPassword(dto.password);
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await this.userModel.updateOne(
      { _id: id },
      { name: dto.name, password: hashedPassword, verificationExpires },
    );
    return this.userModel.findById(id);
  }

  async findAll(page: number, limit: number, query: string) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;
    const offset = (page - 1) * limit;
    const defaultLimit = limit ? limit : 10;

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
        pagination: {
          current_page: page,
          per_page: limit,
          total_pages: totalPages,
          total: totalItems,
        },
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

  isValidPassword(password: string, hash: string | null | undefined) {
    if (!hash) return false;
    return compareSync(password, hash);
  }

  async update(id: string, updateUserDto: UpdateUserDto, user: IUser) {
    this.validateObjectId(id);

    const existingUser = await this.userModel.findById(id).select('role company');
    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    const roleToCheck = updateUserDto.role || existingUser.role;
    const companyToCheck =
      updateUserDto.company !== undefined
        ? updateUserDto.company
        : this.toCompanyDto(existingUser.company);
    const normalizedCompany = await this.resolveCompanyAssignmentForRole(
      roleToCheck,
      companyToCheck,
    );
    const { company: _company, ...restUpdateUserDto } = updateUserDto;

    const updatePayload: Record<string, any> = {
      ...restUpdateUserDto,
      updatedBy: { _id: user._id, email: user.email },
    };

    if (normalizedCompany) {
      updatePayload.company = normalizedCompany;
    } else {
      updatePayload.$unset = { company: 1 };
    }

    return await this.userModel.updateOne({ _id: id }, updatePayload);
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

  async activateUser(id: string) {
    this.validateObjectId(id);
    return await this.userModel.updateOne(
      { _id: id },
      { $set: { isActive: true }, $unset: { verificationExpires: 1 } },
    );
  }

  async updateUserStatus(id: string, isActive: boolean) {
    this.validateObjectId(id);
    return await this.userModel.updateOne({ _id: id }, { isActive });
  }

  async updatePassword(id: string, newPasswordHash: string) {
    this.validateObjectId(id);
    return await this.userModel.updateOne({ _id: id }, { password: newPasswordHash });
  }

  async findUserProfile(userId: string): Promise<IUser> {
    this.validateObjectId(userId);
    // Fetch password field to compute hasPassword, then strip it from the returned shape
    const user = await this.userModel
      .findById(userId)
      .populate({
        path: 'role',
        select: '_id name',
      })
      .lean() // Convert to plain JS object (performance boost)
      .exec();

    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (!user.isActive) {
      throw new BadRequestException('Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ admin.');
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
      authProvider: user.authProvider,
      hasPassword: !!user.password,
      role: {
        _id: userRole._id.toString(),
        name: userRole.name,
      },
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

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  async findUserByGoogleId(googleId: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ googleId, isDeleted: false }).populate({
      path: 'role',
      select: {
        name: 1,
      },
    });
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ email, isDeleted: false }).populate({
      path: 'role',
      select: {
        name: 1,
      },
    });
  }

  async createGoogleUser(googleProfile: {
    googleId: string;
    email: string;
    name: string;
    avatar?: string;
  }): Promise<UserDocument> {
    const { googleId, email, name, avatar } = googleProfile;

    // Get default user role
    const userRole = await this.roleModel.findOne({ name: ERole.NORMAL_USER });

    const newUser = await this.userModel.create({
      googleId,
      email,
      name,
      password: null,
      authProvider: EAuthProvider.GOOGLE,
      role: userRole?._id,
      isActive: true,
    });

    return newUser;
  }

  // Update existing user with Google ID (link Google account)
  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { googleId, authProvider: EAuthProvider.GOOGLE },
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
    const user = await this.userModel
      .findOne({ _id: userId, isDeleted: false })
      .select('companyFollowed');
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if already following this company
    const isAlreadyFollowing = user.companyFollowed?.some(id => id.toString() === companyId);

    if (isAlreadyFollowing) {
      throw new BadRequestException('You are already following this company');
    }

    // Validate maximum 5 companies
    if (user.companyFollowed && user.companyFollowed.length >= 5) {
      throw new BadRequestException(
        'You can only follow up to 5 companies. Please unfollow a company first.',
      );
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

  // ==================== LOCK / UNLOCK FEATURE ====================

  async lockUser(id: string, dto: LockUserDto, adminUser: IUser) {
    this.validateObjectId(id);

    if (id === adminUser._id.toString()) {
      throw new BadRequestException('You cannot lock your own account');
    }

    const user = await this.userModel
      .findOne({ _id: id, isDeleted: false })
      .select('_id email isLocked')
      .lean();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.isLocked) {
      throw new BadRequestException('User account is already locked');
    }

    await this.userModel.updateOne(
      { _id: id },
      {
        isLocked: true,
        lockReason: dto.reason ?? null,
        lockedBy: { _id: adminUser._id, email: adminUser.email },
        lockedAt: new Date(),
        updatedBy: { _id: adminUser._id, email: adminUser.email },
      },
    );

    await this.sessionsService.deactivateAllUserSessions(id);

    return { _id: id, email: user.email, isLocked: true, lockReason: dto.reason ?? null };
  }

  async unlockUser(id: string, adminUser: IUser) {
    this.validateObjectId(id);

    const user = await this.userModel
      .findOne({ _id: id, isDeleted: false })
      .select('_id email isLocked')
      .lean();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (!user.isLocked) {
      throw new BadRequestException('User account is not locked');
    }

    await this.userModel.updateOne(
      { _id: id },
      {
        isLocked: false,
        $unset: { lockReason: '', lockedBy: '', lockedAt: '' },
        updatedBy: { _id: adminUser._id, email: adminUser.email },
      },
    );

    return { _id: id, email: user.email, isLocked: false };
  }

  private async resolveCompanyAssignmentForRole(
    roleId: string | mongoose.Schema.Types.ObjectId,
    company?: CompanyDto | null,
  ): Promise<CompanySnapshotValue | undefined> {
    const userRole = await this.roleModel.findById(roleId).select('name');

    if (!userRole) {
      throw new BadRequestException('Role not found');
    }

    if (userRole.name !== ERole.HR) {
      return undefined;
    }

    const companyId = company?._id?.toString();
    if (!companyId) {
      throw new BadRequestException('HR user must be assigned to a company');
    }

    return this.getCanonicalCompanySnapshot(companyId);
  }

  private async getCanonicalCompanySnapshot(companyId: string): Promise<CompanySnapshotValue> {
    this.validateObjectId(companyId);

    const company = await this.companyModel
      .findOne({ _id: companyId, isDeleted: false })
      .select('_id name logo');

    if (!company) {
      throw new BadRequestException('Company not found or has been deleted');
    }

    return buildCanonicalCompanySnapshot(company);
  }

  private toCompanyDto(
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
