import { AuthService } from '../auth.service';
import { AuthAccountDeletionService } from '../services/auth-account-deletion.service';
import { AuthCredentialsService } from '../services/auth-credentials.service';
import { AuthGoogleService } from '../services/auth-google.service';
import { AuthSessionService } from '../services/auth-session.service';
import { AuthVerificationService } from '../services/auth-verification.service';
import {
  changePasswordDto,
  forgotPasswordDto,
  makeIUser,
  makeResponse,
  registerDto,
  resetPasswordDto,
  setPasswordDto,
  verifyAuthDto,
} from '../testing/auth-test-data';
import { createAuthTestingModule } from '../testing/create-auth-testing-module';

describe('AuthService facade', () => {
  let service: AuthService;
  let authCredentialsService: jest.Mocked<AuthCredentialsService>;
  let authVerificationService: jest.Mocked<AuthVerificationService>;
  let authSessionService: jest.Mocked<AuthSessionService>;
  let authGoogleService: jest.Mocked<AuthGoogleService>;
  let authAccountDeletionService: jest.Mocked<AuthAccountDeletionService>;

  beforeEach(async () => {
    const context = await createAuthTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthCredentialsService,
          useValue: {
            hashPassword: jest.fn().mockReturnValue('hashed-password'),
            validateUser: jest.fn().mockResolvedValue({ email: 'test@example.com' }),
            register: jest.fn().mockResolvedValue({ message: 'registered' }),
            changePassword: jest.fn().mockResolvedValue({ message: 'changed' }),
            setPassword: jest.fn().mockResolvedValue({ message: 'set' }),
            forgotPassword: jest.fn().mockResolvedValue({ message: 'forgot' }),
            resetPassword: jest.fn().mockResolvedValue({ message: 'reset' }),
          },
        },
        {
          provide: AuthVerificationService,
          useValue: {
            sendVerificationCode: jest.fn().mockResolvedValue(undefined),
            verifyEmail: jest.fn().mockResolvedValue({ message: 'verified' }),
            resendCode: jest.fn().mockResolvedValue({ message: 'resent' }),
          },
        },
        {
          provide: AuthSessionService,
          useValue: {
            login: jest.fn().mockResolvedValue({ access_token: 'token' }),
            createAccessToken: jest.fn().mockReturnValue('access-token'),
            createRefreshToken: jest.fn().mockReturnValue('refresh-token'),
            refreshAccessToken: jest.fn().mockResolvedValue({ access_token: 'new-token' }),
            logout: jest.fn().mockResolvedValue({ message: 'logout' }),
            logoutAllDevices: jest.fn().mockResolvedValue({ message: 'logout-all' }),
            getActiveSessions: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: AuthGoogleService,
          useValue: {
            googleLogin: jest.fn().mockResolvedValue({ access_token: 'google-token' }),
          },
        },
        {
          provide: AuthAccountDeletionService,
          useValue: {
            requestAccountDeletion: jest
              .fn()
              .mockResolvedValue({ message: 'scheduled', scheduledDeletionAt: new Date() }),
            cancelAccountDeletion: jest.fn().mockResolvedValue({ message: 'cancelled' }),
            cancelAccountDeletionByToken: jest.fn().mockResolvedValue({ message: 'cancelled' }),
          },
        },
      ],
    });

    service = context.module.get(AuthService);
    authCredentialsService = context.module.get(AuthCredentialsService);
    authVerificationService = context.module.get(AuthVerificationService);
    authSessionService = context.module.get(AuthSessionService);
    authGoogleService = context.module.get(AuthGoogleService);
    authAccountDeletionService = context.module.get(AuthAccountDeletionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should delegate credential methods to AuthCredentialsService', async () => {
    const user = makeIUser();

    expect(service.hashPassword('plain')).toBe('hashed-password');
    await service.validateUser('test@example.com', 'password');
    await service.register(registerDto);
    await service.changePassword(user, changePasswordDto);
    await service.setPassword(user, setPasswordDto);
    await service.forgotPassword(forgotPasswordDto);
    await service.resetPassword(resetPasswordDto);

    expect(authCredentialsService.hashPassword).toHaveBeenCalledWith('plain');
    expect(authCredentialsService.validateUser).toHaveBeenCalledWith(
      'test@example.com',
      'password',
    );
    expect(authCredentialsService.register).toHaveBeenCalledWith(registerDto);
    expect(authCredentialsService.changePassword).toHaveBeenCalledWith(user, changePasswordDto);
    expect(authCredentialsService.setPassword).toHaveBeenCalledWith(user, setPasswordDto);
    expect(authCredentialsService.forgotPassword).toHaveBeenCalledWith(forgotPasswordDto);
    expect(authCredentialsService.resetPassword).toHaveBeenCalledWith(resetPasswordDto);
  });

  it('should delegate verification methods to AuthVerificationService', async () => {
    const user = { email: 'test@example.com' };

    await service.sendVerificationCode(user);
    await service.verifyEmail(verifyAuthDto);
    await service.resendCode('test@example.com');

    expect(authVerificationService.sendVerificationCode).toHaveBeenCalledWith(user);
    expect(authVerificationService.verifyEmail).toHaveBeenCalledWith(verifyAuthDto);
    expect(authVerificationService.resendCode).toHaveBeenCalledWith('test@example.com');
  });

  it('should delegate session methods to AuthSessionService', async () => {
    const user = makeIUser();
    const response = makeResponse();

    await service.login(user, response, '127.0.0.1', 'TestAgent');
    expect(service.createAccessToken({ sub: user._id, type: 'access' })).toBe('access-token');
    expect(service.createRefreshToken({ sub: user._id, type: 'refresh' })).toBe('refresh-token');
    await service.refreshAccessToken('refresh-token', response, user, 'TestAgent', '127.0.0.1');
    await service.logout(response, 'refresh-token');
    await service.logoutAllDevices(response, user._id);
    await service.getActiveSessions(user._id);

    expect(authSessionService.login).toHaveBeenCalledWith(user, response, '127.0.0.1', 'TestAgent');
    expect(authSessionService.createAccessToken).toHaveBeenCalled();
    expect(authSessionService.createRefreshToken).toHaveBeenCalled();
    expect(authSessionService.refreshAccessToken).toHaveBeenCalledWith(
      'refresh-token',
      response,
      user,
      'TestAgent',
      '127.0.0.1',
    );
    expect(authSessionService.logout).toHaveBeenCalledWith(response, 'refresh-token');
    expect(authSessionService.logoutAllDevices).toHaveBeenCalledWith(response, user._id);
    expect(authSessionService.getActiveSessions).toHaveBeenCalledWith(user._id);
  });

  it('should delegate Google login to AuthGoogleService', async () => {
    const response = makeResponse();

    await service.googleLogin('id-token', response);

    expect(authGoogleService.googleLogin).toHaveBeenCalledWith('id-token', response);
  });

  it('should delegate account deletion methods to AuthAccountDeletionService', async () => {
    const user = makeIUser();
    const response = makeResponse();
    const dto = { password: 'correct' };

    await service.requestAccountDeletion(user, dto, response);
    await service.cancelAccountDeletion(user._id);
    await service.cancelAccountDeletionByToken('magic-token');

    expect(authAccountDeletionService.requestAccountDeletion).toHaveBeenCalledWith(
      user,
      dto,
      response,
    );
    expect(authAccountDeletionService.cancelAccountDeletion).toHaveBeenCalledWith(user._id);
    expect(authAccountDeletionService.cancelAccountDeletionByToken).toHaveBeenCalledWith(
      'magic-token',
    );
  });
});
