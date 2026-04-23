import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import mongoose from 'mongoose';
import { ERole } from 'src/casl/enums/role.enum';
import { EAuthProvider } from 'src/auth/enums/auth-provider.enum';
import { UsersService } from './users.service';
import { UserRepository } from './repositories/user.repository';
import { UserAccountService } from './services/user-account.service';
import { UserPreferencesService } from './services/user-preferences.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockUserAccountService: jest.Mocked<UserAccountService>;
  let mockUserPreferencesService: jest.Mocked<UserPreferencesService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const actingUser = {
    _id: new mongoose.Types.ObjectId().toString(),
    email: 'admin@example.com',
  } as any;

  const makeCompanySnapshot = (overrides: Partial<Record<string, any>> = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    name: 'Canonical Corp',
    logo: 'canonical-logo.png',
    ...overrides,
  });

  const makeProfileDoc = (overrides: Partial<Record<string, any>> = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    name: 'Test User',
    email: 'user@example.com',
    authProvider: EAuthProvider.LOCAL,
    password: 'hashed-password',
    isActive: true,
    isDeleted: false,
    role: {
      _id: new mongoose.Types.ObjectId(),
      name: ERole.NORMAL_USER,
    },
    company: {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Company',
      logo: 'logo.png',
    },
    savedJobs: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
    companyFollowed: [new mongoose.Types.ObjectId()],
    ...overrides,
  });

  beforeEach(async () => {
    mockUserRepository = {
      validateObjectId: jest.fn(),
      emailExists: jest.fn(),
      resolveCompanyAssignmentForRole: jest.fn(),
      create: jest.fn(),
      findRoleByName: jest.fn(),
      findPaginated: jest.fn(),
      findById: jest.fn(),
      findOneByUserEmail: jest.fn(),
      findWithSelect: jest.fn(),
      toCompanyDto: jest.fn(),
      updateOne: jest.fn(),
      softDeleteById: jest.fn(),
      findOneWithSelect: jest.fn(),
      bulkSoftDelete: jest.fn(),
      findUserProfile: jest.fn(),
      findByGoogleId: jest.fn(),
      findByEmail: jest.fn(),
    } as any;

    mockUserAccountService = {
      updateUnverifiedUser: jest.fn(),
      activateUser: jest.fn(),
      scheduleAccountDeletion: jest.fn(),
      cancelAccountDeletion: jest.fn(),
      updateUserStatus: jest.fn(),
      updatePassword: jest.fn(),
      lockUser: jest.fn(),
      unlockUser: jest.fn(),
    } as any;

    mockUserPreferencesService = {
      saveJob: jest.fn(),
      unsaveJob: jest.fn(),
      getSavedJobs: jest.fn(),
      followCompany: jest.fn(),
      unfollowCompany: jest.fn(),
      getFollowingCompanies: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: UserAccountService, useValue: mockUserAccountService },
        { provide: UserPreferencesService, useValue: mockUserPreferencesService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    const email = 'new.user@example.com';
    const roleId = new mongoose.Types.ObjectId().toString();
    const companyId = new mongoose.Types.ObjectId().toString();

    it('should create a user with a canonical HR company snapshot and createdBy metadata', async () => {
      const normalizedCompany = makeCompanySnapshot();
      const createdUser = { _id: new mongoose.Types.ObjectId(), createdAt: new Date() };

      mockUserRepository.emailExists.mockResolvedValue(false);
      mockUserRepository.resolveCompanyAssignmentForRole.mockResolvedValue(normalizedCompany as any);
      mockUserRepository.create.mockResolvedValue(createdUser as any);

      const result = await service.create(
        {
          name: 'New User',
          email,
          password: 'Secret123!',
          role: roleId,
          company: {
            _id: companyId,
            name: 'Wrong Name',
            logo: 'wrong-logo.png',
          },
        },
        actingUser,
      );

      const createPayload = mockUserRepository.create.mock.calls[0][0];
      expect(createPayload).toMatchObject({
        name: 'New User',
        email,
        role: roleId,
        company: normalizedCompany,
        createdBy: { _id: actingUser._id, email: actingUser.email },
      });
      expect(createPayload.password).not.toBe('Secret123!');
      expect(service.isValidPassword('Secret123!', createPayload.password)).toBe(true);
      expect(result).toEqual({ _id: createdUser._id, createAt: createdUser.createdAt });
    });

    it('should reject duplicate emails', async () => {
      mockUserRepository.emailExists.mockResolvedValue(true);

      await expect(
        service.create(
          {
            name: 'New User',
            email,
            password: 'Secret123!',
            role: roleId,
          },
          actingUser,
        ),
      ).rejects.toThrow('Email already exists in the system. Please use another email.');

      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });

    it('should omit company assignment for non-HR roles', async () => {
      const createdUser = { _id: new mongoose.Types.ObjectId(), createdAt: new Date() };

      mockUserRepository.emailExists.mockResolvedValue(false);
      mockUserRepository.resolveCompanyAssignmentForRole.mockResolvedValue(undefined);
      mockUserRepository.create.mockResolvedValue(createdUser as any);

      await service.create(
        {
          name: 'Normal User',
          email,
          password: 'Secret123!',
          role: roleId,
          company: {
            _id: companyId,
            name: 'Ignored Company',
            logo: 'ignored.png',
          },
        },
        actingUser,
      );

      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          company: undefined,
        }),
      );
    });
  });

  describe('register', () => {
    it('should create a local normal user with verification expiry', async () => {
      const role = { _id: new mongoose.Types.ObjectId() };
      const createdUser = { _id: new mongoose.Types.ObjectId() };
      const now = Date.now();

      mockUserRepository.emailExists.mockResolvedValue(false);
      mockUserRepository.findRoleByName.mockResolvedValue(role as any);
      mockUserRepository.create.mockResolvedValue(createdUser as any);

      const result = await service.register({
        name: 'Candidate',
        email: 'candidate@example.com',
        password: 'StrongPass1!',
      });

      const createPayload = mockUserRepository.create.mock.calls[0][0];
      expect(mockUserRepository.findRoleByName).toHaveBeenCalledWith(ERole.NORMAL_USER);
      expect(createPayload).toMatchObject({
        name: 'Candidate',
        email: 'candidate@example.com',
        role: role._id,
      });
      expect(createPayload.password).not.toBe('StrongPass1!');
      expect(service.isValidPassword('StrongPass1!', createPayload.password)).toBe(true);
      expect(createPayload.verificationExpires).toBeInstanceOf(Date);
      expect(createPayload.verificationExpires.getTime()).toBeGreaterThan(now);
      expect(createPayload.verificationExpires.getTime()).toBeLessThanOrEqual(
        now + 15 * 60 * 1000 + 5_000,
      );
      expect(result).toBe(createdUser);
    });

    it('should reject duplicate email during registration', async () => {
      mockUserRepository.emailExists.mockResolvedValue(true);

      await expect(
        service.register({
          name: 'Candidate',
          email: 'candidate@example.com',
          password: 'StrongPass1!',
        }),
      ).rejects.toThrow('Email already exists in the system. Please use another email.');
    });
  });

  describe('updateUnverifiedUser', () => {
    it('should delegate to userAccountService', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const dto = {
        name: 'Updated Candidate',
        email: 'candidate@example.com',
        password: 'StrongPass1!',
      };
      const expected = { _id: id };
      mockUserAccountService.updateUnverifiedUser.mockResolvedValue(expected as any);

      const result = await service.updateUnverifiedUser(id, dto);

      expect(mockUserAccountService.updateUnverifiedUser).toHaveBeenCalledWith(id, dto);
      expect(result).toBe(expected);
    });
  });

  describe('findAll', () => {
    it('should strip page and limit from filters and return pagination metadata', async () => {
      const repositoryResult = {
        result: [{ _id: new mongoose.Types.ObjectId() }],
        totalItems: 11,
        totalPages: 3,
      };
      mockUserRepository.findPaginated.mockResolvedValue(repositoryResult as any);

      const result = await service.findAll(2, 5, {
        page: '2',
        limit: '5',
        name: 'alice',
      } as any);

      expect(mockUserRepository.findPaginated).toHaveBeenCalledWith(
        { name: 'alice' },
        5,
        5,
        undefined,
        undefined,
      );
      expect(result).toEqual({
        result: repositoryResult.result,
        meta: {
          pagination: {
            current_page: 2,
            per_page: 5,
            total_pages: 3,
            total: 11,
          },
        },
      });
    });
  });

  describe('findOne', () => {
    it('should validate the id and return repository data', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const user = { _id: id };
      mockUserRepository.findById.mockResolvedValue(user as any);

      const result = await service.findOne(id);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(id);
      expect(result).toBe(user);
    });
  });

  describe('findOneByUserEmail', () => {
    it('should delegate to the repository', async () => {
      const user = { _id: new mongoose.Types.ObjectId() };
      mockUserRepository.findOneByUserEmail.mockResolvedValue(user as any);

      const result = await service.findOneByUserEmail('user@example.com');

      expect(mockUserRepository.findOneByUserEmail).toHaveBeenCalledWith('user@example.com');
      expect(result).toBe(user);
    });
  });

  describe('isValidPassword', () => {
    it('should return false when hash is missing', () => {
      expect(service.isValidPassword('secret', undefined)).toBe(false);
      expect(service.isValidPassword('secret', null)).toBe(false);
    });

    it('should compare plaintext against a hash', () => {
      const password = 'Secret123!';

      mockUserRepository.emailExists.mockResolvedValue(false);
      mockUserRepository.resolveCompanyAssignmentForRole.mockResolvedValue(undefined);
      mockUserRepository.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
      } as any);

      return service
        .create(
          {
            name: 'Password User',
            email: 'password@example.com',
            password,
            role: new mongoose.Types.ObjectId().toString(),
          },
          actingUser,
        )
        .then(() => {
          const hash = mockUserRepository.create.mock.calls[0][0].password;
          expect(service.isValidPassword(password, hash)).toBe(true);
          expect(service.isValidPassword('wrong-password', hash)).toBe(false);
        });
    });
  });

  describe('update', () => {
    const id = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();

    it('should reject when the target user does not exist', async () => {
      mockUserRepository.findWithSelect.mockResolvedValue(null);

      await expect(service.update(id, { name: 'Missing User' } as any, actingUser)).rejects.toThrow(
        'User not found',
      );

      expect(mockUserRepository.updateOne).not.toHaveBeenCalled();
    });

    it('should use existing role and company when omitted from dto', async () => {
      const existingCompany = makeCompanySnapshot();
      mockUserRepository.findWithSelect.mockResolvedValue({
        role: roleId,
        company: existingCompany,
      } as any);
      mockUserRepository.toCompanyDto.mockReturnValue({
        _id: existingCompany._id.toString(),
        name: existingCompany.name,
        logo: existingCompany.logo,
      });
      mockUserRepository.resolveCompanyAssignmentForRole.mockResolvedValue(existingCompany as any);
      mockUserRepository.updateOne.mockResolvedValue({ matchedCount: 1 } as any);

      await service.update(id, { name: 'Updated Name' } as any, actingUser);

      expect(mockUserRepository.toCompanyDto).toHaveBeenCalledWith(existingCompany);
      expect(mockUserRepository.resolveCompanyAssignmentForRole).toHaveBeenCalledWith(roleId, {
        _id: existingCompany._id.toString(),
        name: existingCompany.name,
        logo: existingCompany.logo,
      });
      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          name: 'Updated Name',
          company: existingCompany,
          updatedBy: { _id: actingUser._id, email: actingUser.email },
        }),
      );
    });

    it('should normalize company for HR users', async () => {
      const normalizedCompany = makeCompanySnapshot();
      mockUserRepository.findWithSelect.mockResolvedValue({
        role: new mongoose.Types.ObjectId(),
        company: null,
      } as any);
      mockUserRepository.resolveCompanyAssignmentForRole.mockResolvedValue(normalizedCompany as any);
      mockUserRepository.updateOne.mockResolvedValue({ matchedCount: 1 } as any);

      await service.update(
        id,
        {
          name: 'HR User',
          role: roleId,
          company: {
            _id: normalizedCompany._id.toString(),
            name: 'Wrong Name',
            logo: 'wrong-logo.png',
          },
        } as any,
        actingUser,
      );

      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          role: roleId,
          company: normalizedCompany,
          updatedBy: { _id: actingUser._id, email: actingUser.email },
        }),
      );
    });

    it('should unset company when moving away from HR', async () => {
      mockUserRepository.findWithSelect.mockResolvedValue({
        role: roleId,
        company: makeCompanySnapshot(),
      } as any);
      mockUserRepository.resolveCompanyAssignmentForRole.mockResolvedValue(undefined);
      mockUserRepository.updateOne.mockResolvedValue({ matchedCount: 1 } as any);

      await service.update(id, { role: roleId, name: 'Updated Name' } as any, actingUser);

      expect(mockUserRepository.updateOne).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          role: roleId,
          name: 'Updated Name',
          $unset: { company: 1 },
          updatedBy: { _id: actingUser._id, email: actingUser.email },
        }),
      );
    });
  });

  describe('remove', () => {
    const id = new mongoose.Types.ObjectId().toString();

    it('should reject deleting the configured admin account', async () => {
      mockConfigService.get.mockReturnValue('admin@example.com');
      mockUserRepository.findWithSelect.mockResolvedValue({ email: 'admin@example.com' } as any);

      await expect(service.remove(id, actingUser)).rejects.toThrow('Cannot delete admin account');

      expect(mockUserRepository.softDeleteById).not.toHaveBeenCalled();
    });

    it('should soft delete non-admin users with deletedBy metadata', async () => {
      const result = { deleted: 1 };
      mockConfigService.get.mockReturnValue('admin@example.com');
      mockUserRepository.findWithSelect.mockResolvedValue({ email: 'user@example.com' } as any);
      mockUserRepository.softDeleteById.mockResolvedValue(result as any);

      const response = await service.remove(id, actingUser);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(id);
      expect(mockUserRepository.softDeleteById).toHaveBeenCalledWith(id, {
        _id: actingUser._id,
        email: actingUser.email,
      });
      expect(response).toBe(result);
    });
  });

  describe('bulkRemove', () => {
    const firstId = new mongoose.Types.ObjectId().toString();
    const secondId = new mongoose.Types.ObjectId().toString();

    it('should reject self deletion', async () => {
      await expect(service.bulkRemove([actingUser._id, firstId], actingUser)).rejects.toThrow(
        'You cannot delete your own account',
      );

      expect(mockUserRepository.bulkSoftDelete).not.toHaveBeenCalled();
    });

    it('should reject deleting the admin account', async () => {
      mockConfigService.get.mockReturnValue('admin@example.com');
      mockUserRepository.findOneWithSelect.mockResolvedValue({ _id: secondId } as any);

      await expect(service.bulkRemove([firstId, secondId], actingUser)).rejects.toThrow(
        'Cannot delete the admin account',
      );

      expect(mockUserRepository.bulkSoftDelete).not.toHaveBeenCalled();
    });

    it('should bulk soft delete valid targets', async () => {
      const result = { deletedCount: 2 };
      mockConfigService.get.mockReturnValue('admin@example.com');
      mockUserRepository.findOneWithSelect.mockResolvedValue(null);
      mockUserRepository.bulkSoftDelete.mockResolvedValue(result as any);

      const response = await service.bulkRemove([firstId, secondId], actingUser);

      expect(mockUserRepository.bulkSoftDelete).toHaveBeenCalledWith(
        [firstId, secondId],
        actingUser,
      );
      expect(response).toBe(result);
    });
  });

  describe('account-service delegations', () => {
    const id = new mongoose.Types.ObjectId().toString();

    it('should delegate activateUser', async () => {
      mockUserAccountService.activateUser.mockResolvedValue({ ok: 1 } as any);

      await service.activateUser(id);

      expect(mockUserAccountService.activateUser).toHaveBeenCalledWith(id);
    });

    it('should delegate scheduleAccountDeletion', async () => {
      const scheduledDeletionAt = new Date();
      mockUserAccountService.scheduleAccountDeletion.mockResolvedValue({ ok: 1 } as any);

      await service.scheduleAccountDeletion(id, scheduledDeletionAt);

      expect(mockUserAccountService.scheduleAccountDeletion).toHaveBeenCalledWith(
        id,
        scheduledDeletionAt,
      );
    });

    it('should delegate cancelAccountDeletion', async () => {
      mockUserAccountService.cancelAccountDeletion.mockResolvedValue({ ok: 1 } as any);

      await service.cancelAccountDeletion(id);

      expect(mockUserAccountService.cancelAccountDeletion).toHaveBeenCalledWith(id);
    });

    it('should delegate updateUserStatus', async () => {
      mockUserAccountService.updateUserStatus.mockResolvedValue({ ok: 1 } as any);

      await service.updateUserStatus(id, false);

      expect(mockUserAccountService.updateUserStatus).toHaveBeenCalledWith(id, false);
    });

    it('should delegate updatePassword', async () => {
      mockUserAccountService.updatePassword.mockResolvedValue({ ok: 1 } as any);

      await service.updatePassword(id, 'new-password-hash');

      expect(mockUserAccountService.updatePassword).toHaveBeenCalledWith(id, 'new-password-hash');
    });

    it('should delegate lockUser', async () => {
      const dto = { reason: 'Violation' };
      mockUserAccountService.lockUser.mockResolvedValue({ _id: id } as any);

      await service.lockUser(id, dto, actingUser);

      expect(mockUserAccountService.lockUser).toHaveBeenCalledWith(id, dto, actingUser);
    });

    it('should delegate unlockUser', async () => {
      mockUserAccountService.unlockUser.mockResolvedValue({ _id: id } as any);

      await service.unlockUser(id, actingUser);

      expect(mockUserAccountService.unlockUser).toHaveBeenCalledWith(id, actingUser);
    });
  });

  describe('findUserProfile', () => {
    const userId = new mongoose.Types.ObjectId().toString();

    it('should reject when user is not found', async () => {
      mockUserRepository.findUserProfile.mockResolvedValue(null);

      await expect(service.findUserProfile(userId)).rejects.toThrow('User not found');
    });

    it('should reject inactive users', async () => {
      mockUserRepository.findUserProfile.mockResolvedValue(
        makeProfileDoc({ isActive: false, password: null }) as any,
      );

      await expect(service.findUserProfile(userId)).rejects.toThrow(
        'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ admin.',
      );
    });

    it('should reject deleted users', async () => {
      mockUserRepository.findUserProfile.mockResolvedValue(makeProfileDoc({ isDeleted: true }) as any);

      await expect(service.findUserProfile(userId)).rejects.toThrow('Tài khoản đã bị xóa');
    });

    it('should reject invalid roles', async () => {
      mockUserRepository.findUserProfile.mockResolvedValue(makeProfileDoc({ role: null }) as any);

      await expect(service.findUserProfile(userId)).rejects.toThrow(
        'Role không hợp lệ. Vui lòng liên hệ admin.',
      );
    });

    it('should map the user profile to the IUser shape', async () => {
      const profileDoc = makeProfileDoc();
      mockUserRepository.findUserProfile.mockResolvedValue(profileDoc as any);

      const result = await service.findUserProfile(userId);

      expect(mockUserRepository.validateObjectId).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        _id: profileDoc._id.toString(),
        name: profileDoc.name,
        email: profileDoc.email,
        authProvider: profileDoc.authProvider,
        hasPassword: true,
        role: {
          _id: profileDoc.role._id.toString(),
          name: profileDoc.role.name,
        },
        company: {
          _id: profileDoc.company._id.toString(),
          name: profileDoc.company.name,
          logo: profileDoc.company.logo,
        },
        savedJobs: profileDoc.savedJobs.map((id: mongoose.Types.ObjectId) => id.toString()),
        companyFollowed: profileDoc.companyFollowed.map((id: mongoose.Types.ObjectId) =>
          id.toString(),
        ),
      });
    });

    it('should omit company and report no password for users without those fields', async () => {
      const profileDoc = makeProfileDoc({
        password: null,
        company: undefined,
        savedJobs: [],
        companyFollowed: [],
      });
      mockUserRepository.findUserProfile.mockResolvedValue(profileDoc as any);

      const result = await service.findUserProfile(userId);

      expect(result.hasPassword).toBe(false);
      expect(result.company).toBeUndefined();
      expect(result.savedJobs).toEqual([]);
      expect(result.companyFollowed).toEqual([]);
    });
  });

  describe('google account methods', () => {
    it('should delegate findUserByGoogleId to the repository', async () => {
      const user = { _id: new mongoose.Types.ObjectId() };
      mockUserRepository.findByGoogleId.mockResolvedValue(user as any);

      const result = await service.findUserByGoogleId('google-id');

      expect(mockUserRepository.findByGoogleId).toHaveBeenCalledWith('google-id');
      expect(result).toBe(user);
    });

    it('should delegate findUserByEmail to the repository', async () => {
      const user = { _id: new mongoose.Types.ObjectId() };
      mockUserRepository.findByEmail.mockResolvedValue(user as any);

      const result = await service.findUserByEmail('user@example.com');

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(result).toBe(user);
    });

    it('should create an active google user with a normal user role', async () => {
      const role = { _id: new mongoose.Types.ObjectId() };
      const createdUser = { _id: new mongoose.Types.ObjectId() };
      mockUserRepository.findRoleByName.mockResolvedValue(role as any);
      mockUserRepository.create.mockResolvedValue(createdUser as any);

      const result = await service.createGoogleUser({
        googleId: 'google-id',
        email: 'google@example.com',
        name: 'Google User',
        avatar: 'ignored.png',
      });

      expect(mockUserRepository.findRoleByName).toHaveBeenCalledWith(ERole.NORMAL_USER);
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        googleId: 'google-id',
        email: 'google@example.com',
        name: 'Google User',
        password: null,
        authProvider: EAuthProvider.GOOGLE,
        role: role._id,
        isActive: true,
      });
      expect(result).toBe(createdUser);
    });

    it('should link google account credentials', async () => {
      await service.linkGoogleAccount('user-id', 'google-id');

      expect(mockUserRepository.updateOne).toHaveBeenCalledWith('user-id', {
        googleId: 'google-id',
        authProvider: EAuthProvider.GOOGLE,
      });
    });
  });

  describe('preference-service delegations', () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const jobId = new mongoose.Types.ObjectId().toString();
    const companyId = new mongoose.Types.ObjectId().toString();

    it('should delegate saveJob', async () => {
      mockUserPreferencesService.saveJob.mockResolvedValue(undefined);

      await service.saveJob(userId, jobId);

      expect(mockUserPreferencesService.saveJob).toHaveBeenCalledWith(userId, jobId);
    });

    it('should delegate unsaveJob', async () => {
      mockUserPreferencesService.unsaveJob.mockResolvedValue(undefined);

      await service.unsaveJob(userId, jobId);

      expect(mockUserPreferencesService.unsaveJob).toHaveBeenCalledWith(userId, jobId);
    });

    it('should delegate getSavedJobs', async () => {
      const expected = { result: [], meta: { current: 1 } };
      mockUserPreferencesService.getSavedJobs.mockResolvedValue(expected as any);

      const result = await service.getSavedJobs(userId, 1, 10);

      expect(mockUserPreferencesService.getSavedJobs).toHaveBeenCalledWith(userId, 1, 10);
      expect(result).toBe(expected);
    });

    it('should delegate followCompany', async () => {
      mockUserPreferencesService.followCompany.mockResolvedValue(undefined);

      await service.followCompany(userId, companyId);

      expect(mockUserPreferencesService.followCompany).toHaveBeenCalledWith(userId, companyId);
    });

    it('should delegate unfollowCompany', async () => {
      mockUserPreferencesService.unfollowCompany.mockResolvedValue(undefined);

      await service.unfollowCompany(userId, companyId);

      expect(mockUserPreferencesService.unfollowCompany).toHaveBeenCalledWith(userId, companyId);
    });

    it('should delegate getFollowingCompanies', async () => {
      const expected = { result: [], total: 0 };
      mockUserPreferencesService.getFollowingCompanies.mockResolvedValue(expected as any);

      const result = await service.getFollowingCompanies(userId);

      expect(mockUserPreferencesService.getFollowingCompanies).toHaveBeenCalledWith(userId);
      expect(result).toBe(expected);
    });
  });
});
