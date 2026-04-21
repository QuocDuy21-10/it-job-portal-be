import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDocument } from './schemas/user.schema';
import { compareSync, genSaltSync, hashSync } from 'bcryptjs';
import { IUser } from './user.interface';
import aqp from 'api-query-params';
import { ConfigService } from '@nestjs/config';
import { ERole } from 'src/casl/enums/role.enum';
import { AuthRegisterDto } from 'src/auth/dto/auth-register.dto';
import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { LockUserDto } from './dto/lock-user.dto';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { UserRepository } from './repositories/user.repository';
import { UserAccountService } from './services/user-account.service';
import { UserPreferencesService } from './services/user-preferences.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userAccountService: UserAccountService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly configService: ConfigService,
  ) {}

  private hashPassword(password: string): string {
    const salt = genSaltSync(10);
    return hashSync(password, salt);
  }
  async create(createUserDto: CreateUserDto, user: IUser) {
    const { name, email, password, role, company } = createUserDto;

    if (await this.userRepository.emailExists(email)) {
      throw new BadRequestException(
        `Email already exists in the system. Please use another email.`,
      );
    }

    const normalizedCompany = await this.userRepository.resolveCompanyAssignmentForRole(
      role,
      company,
    );
    const hashedPassword = this.hashPassword(password);
    const newUser = await this.userRepository.create({
      name,
      email,
      password: hashedPassword,
      role,
      company: normalizedCompany,
      createdBy: { _id: user._id, email: user.email },
    });
    return { _id: newUser._id, createAt: newUser.createdAt };
  }

  async register(user: AuthRegisterDto) {
    const { name, email, password } = user;

    if (await this.userRepository.emailExists(email)) {
      throw new BadRequestException(
        `Email already exists in the system. Please use another email.`,
      );
    }

    const userRole = await this.userRepository.findRoleByName(ERole.NORMAL_USER);
    const hashedPassword = this.hashPassword(password);
    // verificationExpires: 15 minutes from now — MongoDB TTL index auto-deletes if not verified
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    return this.userRepository.create({
      name,
      email,
      password: hashedPassword,
      role: userRole?._id,
      verificationExpires,
    });
  }

  async updateUnverifiedUser(id: string, dto: AuthRegisterDto): Promise<any> {
    return this.userAccountService.updateUnverifiedUser(id, dto);
  }

  async findAll(page: number, limit: number, query: string) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;
    const offset = (page - 1) * limit;
    const defaultLimit = limit ? limit : 10;

    const { result, totalItems, totalPages } = await this.userRepository.findPaginated(
      filter,
      offset,
      defaultLimit,
      sort,
      population,
    );

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
    this.userRepository.validateObjectId(id);
    return this.userRepository.findById(id);
  }

  findOneByUserEmail(email: string) {
    return this.userRepository.findOneByUserEmail(email);
  }

  isValidPassword(password: string, hash: string | null | undefined) {
    if (!hash) return false;
    return compareSync(password, hash);
  }

  async update(id: string, updateUserDto: UpdateUserDto, user: IUser) {
    this.userRepository.validateObjectId(id);

    const existingUser = await this.userRepository.findWithSelect(id, 'role company');
    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    const roleToCheck = updateUserDto.role || existingUser.role;
    const companyToCheck =
      updateUserDto.company !== undefined
        ? updateUserDto.company
        : this.userRepository.toCompanyDto(existingUser.company);
    const normalizedCompany = await this.userRepository.resolveCompanyAssignmentForRole(
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

    return this.userRepository.updateOne(id, updatePayload);
  }

  async remove(id: string, user: IUser) {
    this.userRepository.validateObjectId(id);
    const userAdmin = await this.userRepository.findWithSelect(id, 'email');
    const emailAdmin = this.configService.get<string>('EMAIL_ADMIN');
    if (userAdmin && userAdmin.email === emailAdmin) {
      throw new BadRequestException('Cannot delete admin account');
    }
    return this.userRepository.softDeleteById(id, { _id: user._id, email: user.email });
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    // Prevent self-deletion
    if (ids.includes(user._id.toString())) {
      throw new BadRequestException('You cannot delete your own account');
    }

    // Prevent deleting the admin account
    const emailAdmin = this.configService.get<string>('EMAIL_ADMIN');
    const adminUser = await this.userRepository.findOneWithSelect(
      { email: emailAdmin, isDeleted: { $ne: true } },
      '_id',
    );

    if (adminUser && ids.includes(adminUser._id.toString())) {
      throw new BadRequestException('Cannot delete the admin account');
    }

    return this.userRepository.bulkSoftDelete(ids, user);
  }

  async activateUser(id: string) {
    return this.userAccountService.activateUser(id);
  }

  async scheduleAccountDeletion(id: string, scheduledDeletionAt: Date) {
    return this.userAccountService.scheduleAccountDeletion(id, scheduledDeletionAt);
  }

  async cancelAccountDeletion(id: string) {
    return this.userAccountService.cancelAccountDeletion(id);
  }

  async updateUserStatus(id: string, isActive: boolean) {
    return this.userAccountService.updateUserStatus(id, isActive);
  }

  async updatePassword(id: string, newPasswordHash: string) {
    return this.userAccountService.updatePassword(id, newPasswordHash);
  }

  async findUserProfile(userId: string): Promise<IUser> {
    this.userRepository.validateObjectId(userId);
    const user = await this.userRepository.findUserProfile(userId);

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

  async findUserByGoogleId(googleId: string): Promise<UserDocument | null> {
    return this.userRepository.findByGoogleId(googleId);
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return this.userRepository.findByEmail(email);
  }

  async createGoogleUser(googleProfile: {
    googleId: string;
    email: string;
    name: string;
    avatar?: string;
  }): Promise<UserDocument> {
    const { googleId, email, name } = googleProfile;
    const userRole = await this.userRepository.findRoleByName(ERole.NORMAL_USER);
    return this.userRepository.create({
      googleId,
      email,
      name,
      password: null,
      authProvider: EAuthProvider.GOOGLE,
      role: userRole?._id,
      isActive: true,
    }) as Promise<UserDocument>;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await this.userRepository.updateOne(userId, {
      googleId,
      authProvider: EAuthProvider.GOOGLE,
    });
  }

  async saveJob(userId: string, jobId: string): Promise<void> {
    return this.userPreferencesService.saveJob(userId, jobId);
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    return this.userPreferencesService.unsaveJob(userId, jobId);
  }

  async getSavedJobs(userId: string, page: number = 1, limit: number = 10) {
    return this.userPreferencesService.getSavedJobs(userId, page, limit);
  }

  async followCompany(userId: string, companyId: string): Promise<void> {
    return this.userPreferencesService.followCompany(userId, companyId);
  }

  async unfollowCompany(userId: string, companyId: string): Promise<void> {
    return this.userPreferencesService.unfollowCompany(userId, companyId);
  }

  async getFollowingCompanies(userId: string) {
    return this.userPreferencesService.getFollowingCompanies(userId);
  }

  async lockUser(id: string, dto: LockUserDto, adminUser: IUser) {
    return this.userAccountService.lockUser(id, dto, adminUser);
  }

  async unlockUser(id: string, adminUser: IUser) {
    return this.userAccountService.unlockUser(id, adminUser);
  }
}
