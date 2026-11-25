import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDocument } from './schemas/user.schema';
import { compare, hash } from 'bcryptjs';
import { IUser } from './user.interface';
import {
  andFilter,
  buildKeywordFilter,
  buildPaginationMeta,
  parseListQuery,
  resolvePagination,
} from 'src/utils/helpers/list-query.helper';
import { ConfigService } from '@nestjs/config';
import { ERole } from 'src/casl/enums/role.enum';
import { AuthRegisterDto } from 'src/auth/dto/auth-register.dto';
import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { LockUserDto } from './dto/lock-user.dto';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { UserRepository } from './repositories/user.repository';
import { UserAccountService } from './services/user-account.service';
import { UserPreferencesService } from './services/user-preferences.service';
import { ProfileIdentitySyncService } from 'src/profile-identity/profile-identity-sync.service';

@Injectable()
export class UsersService {
  private readonly ALLOWED_FILTER_FIELDS = new Set([
    'name',
    'email',
    'authProvider',
    'role',
    'isActive',
    'isLocked',
    'isDeleted',
    'company._id',
    'company.name',
    'createdAt',
    'updatedAt',
  ]);

  private readonly ALLOWED_SORT_FIELDS = new Set([
    'name',
    'email',
    'authProvider',
    'isActive',
    'isLocked',
    'createdAt',
    'updatedAt',
  ]);

  private readonly KEYWORD_FIELDS = ['name', 'email'];

  constructor(
    private readonly userRepository: UserRepository,
    private readonly userAccountService: UserAccountService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly configService: ConfigService,
    private readonly profileIdentitySyncService: ProfileIdentitySyncService,
  ) {}

  // Async bcryptjs yields to the event loop between rounds instead of holding it for the whole hash.
  private hashPassword(password: string): Promise<string> {
    return hash(password, 10);
  }
  async create(createUserDto: CreateUserDto, user: IUser) {
    const { name, email, password, role, company, avatar } = createUserDto;

    if (await this.userRepository.emailExists(email)) {
      throw new BadRequestException(`Email đã tồn tại trong hệ thống. Vui lòng dùng email khác.`);
    }

    const normalizedCompany = await this.userRepository.resolveCompanyAssignmentForRole(
      role,
      company,
    );
    const hashedPassword = await this.hashPassword(password);
    const newUser = await this.userRepository.create({
      name,
      email,
      password: hashedPassword,
      role,
      company: normalizedCompany,
      avatar,
      createdBy: { _id: user._id, email: user.email },
    });
    return { _id: newUser._id, createAt: newUser.createdAt };
  }

  async register(user: AuthRegisterDto) {
    const { name, email, password } = user;

    if (await this.userRepository.emailExists(email)) {
      throw new BadRequestException(`Email đã tồn tại trong hệ thống. Vui lòng dùng email khác.`);
    }

    const hashedPassword = await this.hashPassword(password);
    // verificationExpires: 15 minutes from now — MongoDB TTL index auto-deletes if not verified
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    return this.userRepository.create({
      name,
      email,
      password: hashedPassword,
      role: ERole.NORMAL_USER,
      verificationExpires,
    });
  }

  async updateUnverifiedUser(id: string, dto: AuthRegisterDto): Promise<any> {
    return this.userAccountService.updateUnverifiedUser(id, dto);
  }

  async findAll(page: unknown, limit: unknown, query: string, keyword?: string) {
    const { filter, sort } = this.buildListFilter(query, keyword);
    const pagination = resolvePagination(page, limit);

    const { result, totalItems } = await this.userRepository.findPaginated(
      filter,
      pagination.offset,
      pagination.limit,
      sort,
      undefined,
    );

    return { result, meta: buildPaginationMeta(pagination.page, pagination.limit, totalItems) };
  }

  async countByRole(query: unknown, keyword?: string): Promise<Record<string, number>> {
    const { filter } = this.buildListFilter(query, keyword, ['role', 'isLocked']);
    const roles = Object.values(ERole);
    const [ALL, LOCKED, ...counts] = await Promise.all([
      this.userRepository.countDocuments(filter),
      this.userRepository.countDocuments({ ...filter, isLocked: true }),
      ...roles.map(role => this.userRepository.countDocuments({ ...filter, role })),
    ]);

    return { ALL, ...Object.fromEntries(roles.map((role, i) => [role, counts[i]])), LOCKED };
  }

  private buildListFilter(query: unknown, keyword?: string, ignoredFields: string[] = []) {
    const { filter, sort } = parseListQuery(query, {
      filterFields: new Set(
        [...this.ALLOWED_FILTER_FIELDS].filter(field => !ignoredFields.includes(field)),
      ),
      sortFields: this.ALLOWED_SORT_FIELDS,
    });
    andFilter(filter, buildKeywordFilter(keyword, this.KEYWORD_FIELDS));

    return { filter, sort };
  }

  findOne(id: string) {
    this.userRepository.validateObjectId(id);
    return this.userRepository.findById(id);
  }

  findOneByUserEmail(email: string) {
    return this.userRepository.findOneByUserEmail(email);
  }

  async isValidPassword(password: string, passwordHash: string | null | undefined) {
    if (!passwordHash) return false;
    return compare(password, passwordHash);
  }

  async update(id: string, updateUserDto: UpdateUserDto, user: IUser) {
    this.userRepository.validateObjectId(id);

    const existingUser = await this.userRepository.findWithSelect(id, 'role company email');
    if (!existingUser) {
      throw new BadRequestException('Không tìm thấy người dùng');
    }

    this.assertEmailIsUnchanged(updateUserDto.email, existingUser.email);

    // Like self-lock: an admin demoting themselves could leave the system with no admin.
    if (id === user._id && updateUserDto.role && updateUserDto.role !== existingUser.role) {
      throw new BadRequestException('Bạn không thể tự đổi vai trò của mình');
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
    const restUpdateUserDto = { ...updateUserDto };
    delete restUpdateUserDto.company;
    delete restUpdateUserDto.email;

    const updatePayload: Record<string, any> = {
      ...restUpdateUserDto,
      updatedBy: { _id: user._id, email: user.email },
    };

    if (normalizedCompany) {
      updatePayload.company = normalizedCompany;
    } else {
      updatePayload.$unset = { company: 1 };
    }

    const updateResult = await this.userRepository.updateOne(id, updatePayload);
    if (updateResult.matchedCount === 0) {
      throw new BadRequestException('Không tìm thấy người dùng');
    }

    await this.profileIdentitySyncService.syncCvIdentityFromUser(id, {
      email: existingUser.email,
      name: restUpdateUserDto.name,
      avatar: (restUpdateUserDto as any).avatar,
    });

    return updateResult;
  }

  async remove(id: string, user: IUser) {
    this.userRepository.validateObjectId(id);
    const userAdmin = await this.userRepository.findWithSelect(id, 'email');
    const emailAdmin = this.configService.get<string>('EMAIL_ADMIN');
    if (userAdmin && userAdmin.email === emailAdmin) {
      throw new BadRequestException('Không thể xoá tài khoản quản trị viên');
    }
    return this.userRepository.softDeleteById(id, { _id: user._id, email: user.email });
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    // Prevent self-deletion
    if (ids.includes(user._id.toString())) {
      throw new BadRequestException('Bạn không thể xoá tài khoản của chính mình');
    }

    // Prevent deleting the admin account
    const emailAdmin = this.configService.get<string>('EMAIL_ADMIN');
    const adminUser = await this.userRepository.findOneWithSelect(
      { email: emailAdmin, isDeleted: { $ne: true } },
      '_id',
    );

    if (adminUser && ids.includes(adminUser._id.toString())) {
      throw new BadRequestException('Không thể xoá tài khoản quản trị viên');
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
      throw new BadRequestException('Không tìm thấy người dùng');
    }
    if (!user.isActive) {
      throw new BadRequestException('Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản trị viên.');
    }
    if (user.isDeleted) {
      throw new BadRequestException('Tài khoản đã bị xóa');
    }
    if (!this.isSystemRole(user.role)) {
      throw new BadRequestException('Vai trò không hợp lệ. Vui lòng liên hệ quản trị viên.');
    }
    const profile: IUser = {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      authProvider: user.authProvider,
      hasPassword: !!user.password,
      role: user.role,
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

    if (user.avatar) {
      profile.avatar = user.avatar;
    }

    return profile;
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
    const { googleId, email, name, avatar } = googleProfile;
    return this.userRepository.create({
      googleId,
      email,
      name,
      avatar,
      password: null,
      authProvider: EAuthProvider.GOOGLE,
      role: ERole.NORMAL_USER,
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

  private assertEmailIsUnchanged(incomingEmail: string | undefined, currentEmail: string): void {
    if (!incomingEmail) {
      return;
    }

    if (this.normalizeEmail(incomingEmail) !== this.normalizeEmail(currentEmail)) {
      throw new BadRequestException('Không thể đổi email qua API này');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async lockUser(id: string, dto: LockUserDto, adminUser: IUser) {
    return this.userAccountService.lockUser(id, dto, adminUser);
  }

  async unlockUser(id: string, adminUser: IUser) {
    return this.userAccountService.unlockUser(id, adminUser);
  }

  private isSystemRole(role: string): role is ERole {
    return Object.values(ERole).includes(role as ERole);
  }
}
