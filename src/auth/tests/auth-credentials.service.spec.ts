import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthCredentialsService } from '../services/auth-credentials.service';
import { AuthVerificationService } from '../services/auth-verification.service';
import {
  changePasswordDto,
  forgotPasswordDto,
  makeIUser,
  makeUser,
  registerDto,
  resetPasswordDto,
  setPasswordDto,
} from '../testing/auth-test-data';
import {
  AuthTestingModuleContext,
  createAuthTestingModule,
} from '../testing/create-auth-testing-module';
import { EAuthProvider } from '../enums/auth-provider.enum';

describe('AuthCredentialsService', () => {
  let service: AuthCredentialsService;
  let authVerificationService: {
    sendVerificationCode: jest.MockedFunction<(user: unknown) => Promise<void>>;
  };
  let usersService: AuthTestingModuleContext['usersService'];
  let sessionsService: AuthTestingModuleContext['sessionsService'];
  let cacheManager: AuthTestingModuleContext['cacheManager'];
  let mailerService: AuthTestingModuleContext['mailerService'];

  beforeEach(async () => {
    authVerificationService = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    };

    const context = await createAuthTestingModule({
      providers: [
        AuthCredentialsService,
        { provide: AuthVerificationService, useValue: authVerificationService },
      ],
    });

    service = context.module.get(AuthCredentialsService);
    usersService = context.usersService;
    sessionsService = context.sessionsService;
    cacheManager = context.cacheManager;
    mailerService = context.mailerService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return the user object when credentials are valid, account is active, and not locked', async () => {
      const user = makeUser();
      usersService.findOneByUserEmail.mockResolvedValue(user);
      usersService.isValidPassword.mockReturnValue(true);

      const result = await service.validateUser('test@example.com', 'correct-password');

      expect(result).toBeDefined();
      expect(usersService.findOneByUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(usersService.isValidPassword).toHaveBeenCalledWith('correct-password', user.password);
    });

    it('should return null when user is not found', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(null);

      const result = await service.validateUser('unknown@example.com', 'any-password');

      expect(result).toBeNull();
    });

    it('should return null when the password is incorrect', async () => {
      const user = makeUser();
      usersService.findOneByUserEmail.mockResolvedValue(user);
      usersService.isValidPassword.mockReturnValue(false);

      const result = await service.validateUser('test@example.com', 'wrong-password');

      expect(result).toBeNull();
    });

    it('should throw BadRequestException for a Google-only account (no password)', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser({ password: null }));

      await expect(service.validateUser('test@example.com', 'any-password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when account is not activated', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser({ isActive: false }));
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException when account is locked', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser({ isLocked: true }));
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should not return a user when the locked-account guard is reached', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser({ isLocked: true }));
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('hashPassword', () => {
    it('should return a bcrypt hash different from the original password', () => {
      const hash = service.hashPassword('plainPassword123');

      expect(hash).toBeDefined();
      expect(hash).not.toBe('plainPassword123');
      expect(hash.startsWith('$2')).toBe(true);
    });

    it('should produce different hashes for the same input', () => {
      const hash1 = service.hashPassword('samePass');
      const hash2 = service.hashPassword('samePass');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('register', () => {
    it('should register a brand-new user and send verification code', async () => {
      const newUser = makeUser({ email: 'new@example.com', createdAt: new Date() });
      usersService.findUserByEmail.mockResolvedValue(null);
      usersService.register.mockResolvedValue(newUser);

      const result = await service.register(registerDto);

      expect(usersService.register).toHaveBeenCalledWith(registerDto);
      expect(authVerificationService.sendVerificationCode).toHaveBeenCalledWith(newUser);
      expect(result).toHaveProperty('_id');
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when email already exists and is active', async () => {
      usersService.findUserByEmail.mockResolvedValue(makeUser({ isActive: true }));

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
    });

    it('should update in-place when email exists but is unverified', async () => {
      const unverifiedUser = makeUser({ isActive: false, email: 'new@example.com' });
      usersService.findUserByEmail.mockResolvedValue(unverifiedUser);
      usersService.updateUnverifiedUser.mockResolvedValue(unverifiedUser);

      const result = await service.register(registerDto);

      expect(usersService.updateUnverifiedUser).toHaveBeenCalledWith(
        unverifiedUser._id.toString(),
        registerDto,
      );
      expect(authVerificationService.sendVerificationCode).toHaveBeenCalledWith(unverifiedUser);
      expect(result).toHaveProperty('_id');
    });
  });

  describe('changePassword', () => {
    const user = makeIUser();

    it('should change password, revoke all sessions, and return success', async () => {
      const dbUser = makeUser();
      usersService.findOneByUserEmail.mockResolvedValue(dbUser);
      usersService.isValidPassword.mockReturnValue(true);

      const result = await service.changePassword(user, changePasswordDto);

      expect(usersService.isValidPassword).toHaveBeenCalledWith(
        changePasswordDto.currentPassword,
        dbUser.password,
      );
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        dbUser._id.toString(),
        expect.any(String),
      );
      expect(sessionsService.deleteAllUserSessions).toHaveBeenCalledWith(dbUser._id.toString());
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when user is not found', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(null);

      await expect(service.changePassword(user, changePasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when account has no password', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser({ password: null }));

      await expect(service.changePassword(user, changePasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when current password is wrong', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser());
      usersService.isValidPassword.mockReturnValue(false);

      await expect(service.changePassword(user, changePasswordDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('setPassword', () => {
    const user = makeIUser({ authProvider: EAuthProvider.GOOGLE, hasPassword: false });

    it('should set password for an OAuth user without a password', async () => {
      const dbUser = makeUser({ password: null, authProvider: EAuthProvider.GOOGLE });
      usersService.findOneByUserEmail.mockResolvedValue(dbUser);

      const result = await service.setPassword(user, setPasswordDto);

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        dbUser._id.toString(),
        expect.any(String),
      );
      expect(sessionsService.deleteAllUserSessions).toHaveBeenCalledWith(dbUser._id.toString());
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when user is not found', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(null);

      await expect(service.setPassword(user, setPasswordDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when account already has a password', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(makeUser({ password: 'existing-hash' }));

      await expect(service.setPassword(user, setPasswordDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    it('should return a generic message even when the user does not exist', async () => {
      usersService.findUserByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'unknown@example.com' });

      expect(result).toHaveProperty('message');
      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should store the reset token in cache and send email when the user exists', async () => {
      usersService.findUserByEmail.mockResolvedValue(makeUser());

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('reset_password:'),
        'test@example.com',
        600000,
      );
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Reset Password Request',
        }),
      );
      expect(result).toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('should reset the password and delete the token from cache', async () => {
      const user = makeUser();
      cacheManager.get.mockResolvedValue('test@example.com');
      usersService.findUserByEmail.mockResolvedValue(user);

      const result = await service.resetPassword(resetPasswordDto);

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        user._id.toString(),
        expect.any(String),
      );
      expect(cacheManager.del).toHaveBeenCalledWith('reset_password:valid-token');
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when the token is invalid or expired', async () => {
      cacheManager.get.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the token email does not match', async () => {
      cacheManager.get.mockResolvedValue('different@example.com');

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user is not found after token validation', async () => {
      cacheManager.get.mockResolvedValue('test@example.com');
      usersService.findUserByEmail.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });
  });
});
