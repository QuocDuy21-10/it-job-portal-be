import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
  let mailerService: AuthTestingModuleContext['mailerService'];
  let redisClient: AuthTestingModuleContext['redisClient'];
  let redisPipeline: AuthTestingModuleContext['redisPipeline'];

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
    mailerService = context.mailerService;
    redisClient = context.redisClient;
    redisPipeline = context.redisPipeline;
    mailerService.sendMail.mockResolvedValue(undefined);
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

    it('should throw ForbiddenException when account deletion is pending', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(
        makeUser({ scheduledDeletionAt: new Date(Date.now() + 60_000) }),
      );
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('validateUser per-email lockout', () => {
    it('rejects with 429 without checking the password once the email has 10 recent failures', async () => {
      redisClient.get.mockResolvedValue('10');

      await expect(
        service.validateUser('Test@Example.com', 'correct-password'),
      ).rejects.toMatchObject({ status: 429 });
      expect(redisClient.get).toHaveBeenCalledWith('login:fail:test@example.com');
      expect(usersService.findOneByUserEmail).not.toHaveBeenCalled();
    });

    it('counts a wrong password against the email with a 15-minute window', async () => {
      redisClient.get.mockResolvedValue('3');
      usersService.findOneByUserEmail.mockResolvedValue(makeUser());
      usersService.isValidPassword.mockReturnValue(false);

      await expect(service.validateUser('test@example.com', 'wrong')).resolves.toBeNull();
      expect(redisPipeline.incr).toHaveBeenCalledWith('login:fail:test@example.com');
      expect(redisPipeline.expire).toHaveBeenCalledWith('login:fail:test@example.com', 900, 'NX');
      expect(redisPipeline.exec).toHaveBeenCalled();
    });

    it('counts unknown emails too, so lockout does not reveal which accounts exist', async () => {
      redisClient.get.mockResolvedValue(null);
      usersService.findOneByUserEmail.mockResolvedValue(null);

      await expect(service.validateUser('ghost@example.com', 'x')).resolves.toBeNull();
      expect(redisPipeline.incr).toHaveBeenCalledWith('login:fail:ghost@example.com');
    });

    it('clears the failure count after a successful login', async () => {
      redisClient.get.mockResolvedValue('9');
      usersService.findOneByUserEmail.mockResolvedValue(makeUser());
      usersService.isValidPassword.mockReturnValue(true);

      await expect(
        service.validateUser('test@example.com', 'correct-password'),
      ).resolves.toBeDefined();
      expect(redisClient.del).toHaveBeenCalledWith('login:fail:test@example.com');
      expect(redisPipeline.incr).not.toHaveBeenCalled();
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
      expect(redisClient.set).not.toHaveBeenCalled();
    });

    it('should store the reset token for 10 minutes and send email when the user exists', async () => {
      usersService.findUserByEmail.mockResolvedValue(makeUser());

      const result = await service.forgotPassword(forgotPasswordDto);

      expect(redisClient.set).toHaveBeenCalledWith(
        'reset_password_latest:test@example.com',
        expect.any(String),
        'PX',
        600000,
        'GET',
      );
      expect(redisPipeline.set).toHaveBeenCalledWith(
        expect.stringMatching(/^reset_password:.+/),
        'test@example.com',
        'PX',
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

    it('invalidates the previous reset token when a new one is issued', async () => {
      usersService.findUserByEmail.mockResolvedValue(makeUser());
      redisClient.set.mockResolvedValueOnce('old-token');

      await service.forgotPassword(forgotPasswordDto);

      expect(redisPipeline.del).toHaveBeenCalledWith('reset_password:old-token');
    });

    it('responds without waiting for the mail server, so timing does not reveal the account', async () => {
      usersService.findUserByEmail.mockResolvedValue(makeUser());
      mailerService.sendMail.mockReturnValue(new Promise(() => undefined));

      await expect(service.forgotPassword(forgotPasswordDto)).resolves.toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('should consume the token, reset the password and revoke all sessions', async () => {
      const user = makeUser();
      redisClient.getdel.mockResolvedValue('test@example.com');
      usersService.findUserByEmail.mockResolvedValue(user);

      const result = await service.resetPassword(resetPasswordDto);

      expect(redisClient.getdel).toHaveBeenCalledWith('reset_password:valid-token');
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        user._id.toString(),
        expect.any(String),
      );
      expect(sessionsService.deleteAllUserSessions).toHaveBeenCalledWith('user-id-123');
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when the token is invalid, expired or already used', async () => {
      redisClient.getdel.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when the token email does not match', async () => {
      redisClient.getdel.mockResolvedValue('different@example.com');

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user is not found after token validation', async () => {
      redisClient.getdel.mockResolvedValue('test@example.com');
      usersService.findUserByEmail.mockResolvedValue(null);

      await expect(service.resetPassword(resetPasswordDto)).rejects.toThrow(BadRequestException);
    });
  });
});
