import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AuthService } from './auth.service';
import { UsersService } from 'src/users/users.service';
import { SessionsService } from 'src/sessions/sessions.service';
import { MailerService } from '@nestjs-modules/mailer';
import { REDIS_CLIENT } from 'src/redis/redis.module';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'user-id-123' },
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashed-password',
    authProvider: 'local',
    isActive: true,
    isLocked: false,
    isDeleted: false,
    role: { _id: { toString: () => 'role-id-1' }, name: 'NORMAL_USER' },
    company: null,
    savedJobs: [],
    companyFollowed: [],
    toObject: jest.fn().mockReturnThis(),
    ...overrides,
  } as any;
}

function makeGoogleUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => 'google-user-id-1' },
    name: 'Google User',
    email: 'google@example.com',
    password: null,
    authProvider: 'google',
    isActive: true,
    isLocked: false,
    isDeleted: false,
    role: { _id: { toString: () => 'role-id-1' }, name: 'NORMAL_USER' },
    company: null,
    savedJobs: [],
    companyFollowed: [],
    ...overrides,
  } as any;
}

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let sessionsService: jest.Mocked<SessionsService>;

  const mockCacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    setex: jest.fn(),
    incr: jest.fn(),
    ttl: jest.fn(),
  };
  const mockMailerService = { sendMail: jest.fn() };
  const mockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findOneByUserEmail: jest.fn(),
            findUserByEmail: jest.fn(),
            findUserByGoogleId: jest.fn(),
            isValidPassword: jest.fn(),
            linkGoogleAccount: jest.fn(),
            createGoogleUser: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_ACCESS_TOKEN_SECRET: 'access-secret',
                JWT_REFRESH_TOKEN_SECRET: 'refresh-secret',
                JWT_ACCESS_EXPIRES_IN: '7d',
                JWT_REFRESH_EXPIRES_IN: '30d',
                NODE_ENV: 'test',
                GOOGLE_CLIENT_ID: 'mock-google-client-id',
                OTP_SECRET: 'otp-secret',
              };
              return config[key];
            }),
          },
        },
        {
          provide: SessionsService,
          useValue: {
            createSession: jest.fn().mockResolvedValue({}),
            enforceSessionLimit: jest.fn().mockResolvedValue({}),
            revokeSession: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
        { provide: MailerService, useValue: mockMailerService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    sessionsService = module.get(SessionsService);
  });

  afterEach(() => jest.clearAllMocks());

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
      const user = makeUser({ password: null });
      usersService.findOneByUserEmail.mockResolvedValue(user);

      await expect(service.validateUser('test@example.com', 'any-password')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validateUser('test@example.com', 'any-password')).rejects.toThrow(
        /Google/,
      );
    });

    it('should throw BadRequestException when account is not activated (isActive=false)', async () => {
      const user = makeUser({ isActive: false });
      usersService.findOneByUserEmail.mockResolvedValue(user);
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        /kích hoạt/,
      );
    });

    it('should throw UnauthorizedException when account is locked (isLocked=true)', async () => {
      const user = makeUser({ isActive: true, isLocked: true });
      usersService.findOneByUserEmail.mockResolvedValue(user);
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        /khóa/,
      );
    });

    it('should NOT return user when account is active but locked (guard ordering)', async () => {
      // Ensures that even though isActive=true, isLocked=true blocks the login
      const user = makeUser({ isActive: true, isLocked: true });
      usersService.findOneByUserEmail.mockResolvedValue(user);
      usersService.isValidPassword.mockReturnValue(true);

      await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('googleLogin', () => {
    // Spy on the private verifyGoogleToken method and login method
    let verifyGoogleTokenSpy: jest.SpyInstance;
    let loginSpy: jest.SpyInstance;

    const mockGoogleProfile = {
      googleId: 'google-id-abc',
      email: 'google@example.com',
      name: 'Google User',
      avatar: 'https://example.com/avatar.jpg',
    };

    const mockLoginResult = {
      access_token: 'mock-access-token',
      user: { _id: 'google-user-id-1', name: 'Google User', email: 'google@example.com' },
    };

    beforeEach(() => {
      verifyGoogleTokenSpy = jest
        .spyOn(service as any, 'verifyGoogleToken')
        .mockResolvedValue(mockGoogleProfile);

      loginSpy = jest.spyOn(service, 'login').mockResolvedValue(mockLoginResult as any);
    });

    it('should return tokens when user exists by Google ID and account is not locked', async () => {
      const googleUser = makeGoogleUser();
      usersService.findUserByGoogleId.mockResolvedValue(googleUser);

      const result = await service.googleLogin('valid-id-token', mockResponse);

      expect(verifyGoogleTokenSpy).toHaveBeenCalledWith('valid-id-token');
      expect(usersService.findUserByGoogleId).toHaveBeenCalledWith('google-id-abc');
      expect(loginSpy).toHaveBeenCalled();
      expect(result).toEqual(mockLoginResult);
    });

    it('should throw UnauthorizedException when existing Google user is locked', async () => {
      const googleUser = makeGoogleUser({ isLocked: true });
      usersService.findUserByGoogleId.mockResolvedValue(googleUser);

      await expect(service.googleLogin('valid-id-token', mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.googleLogin('valid-id-token', mockResponse)).rejects.toThrow(/khóa/);
      expect(loginSpy).not.toHaveBeenCalled();
    });

    it('should create a new Google user and return tokens when no user exists', async () => {
      usersService.findUserByGoogleId.mockResolvedValue(null);
      usersService.findUserByEmail.mockResolvedValue(null);
      const newUser = makeGoogleUser();
      usersService.createGoogleUser.mockResolvedValue(newUser);

      const result = await service.googleLogin('valid-id-token', mockResponse);

      expect(usersService.createGoogleUser).toHaveBeenCalledWith(mockGoogleProfile);
      expect(loginSpy).toHaveBeenCalled();
      expect(result).toEqual(mockLoginResult);
    });

    it('should link Google account to an active, non-locked email account and return tokens', async () => {
      usersService.findUserByGoogleId
        .mockResolvedValueOnce(null) // first call: not found by googleId
        .mockResolvedValueOnce(makeGoogleUser()); // second call: after linking

      const existingEmailUser = makeUser({ isActive: true, isLocked: false });
      usersService.findUserByEmail.mockResolvedValue(existingEmailUser);
      usersService.linkGoogleAccount.mockResolvedValue(undefined);

      const result = await service.googleLogin('valid-id-token', mockResponse);

      expect(usersService.linkGoogleAccount).toHaveBeenCalledWith(
        existingEmailUser._id.toString(),
        'google-id-abc',
      );
      expect(loginSpy).toHaveBeenCalled();
      expect(result).toEqual(mockLoginResult);
    });

    it('should throw UnauthorizedException when email-linked account is locked', async () => {
      usersService.findUserByGoogleId.mockResolvedValue(null);
      // The linked user found by email is locked
      const lockedUser = makeGoogleUser({ isLocked: true });
      usersService.findUserByEmail.mockResolvedValue(lockedUser);
      usersService.linkGoogleAccount.mockResolvedValue(undefined);
      // After linking, findUserByGoogleId returns the locked user
      usersService.findUserByGoogleId.mockResolvedValue(lockedUser);

      await expect(service.googleLogin('valid-id-token', mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.googleLogin('valid-id-token', mockResponse)).rejects.toThrow(/khóa/);
      expect(loginSpy).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when Google ID token is invalid', async () => {
      verifyGoogleTokenSpy.mockRejectedValue(new Error('Token verification failed'));

      await expect(service.googleLogin('invalid-id-token', mockResponse)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.googleLogin('invalid-id-token', mockResponse)).rejects.toThrow(
        /Google authentication failed/,
      );
    });

    it('should re-throw UnauthorizedException directly when thrown inside googleLogin', async () => {
      // Simulate a case where verifyGoogleToken itself throws UnauthorizedException
      verifyGoogleTokenSpy.mockRejectedValue(
        new UnauthorizedException('Token was explicitly rejected'),
      );

      await expect(service.googleLogin('rejected-token', mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.googleLogin('rejected-token', mockResponse)).rejects.toThrow(
        /explicitly rejected/,
      );
    });
  });
});
