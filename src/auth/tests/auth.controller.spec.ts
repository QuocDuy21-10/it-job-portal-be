import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UsersService } from 'src/users/users.service';
import { makeIUser, makeRequest, makeResponse } from '../testing/auth-test-data';
import { createAuthTestingModule } from '../testing/create-auth-testing-module';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const context = await createAuthTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            register: jest.fn(),
            verifyEmail: jest.fn(),
            resendCode: jest.fn(),
            googleLogin: jest.fn(),
            refreshAccessToken: jest.fn(),
            logout: jest.fn(),
            logoutAllDevices: jest.fn(),
            getActiveSessions: jest.fn(),
            changePassword: jest.fn(),
            setPassword: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            requestAccountDeletion: jest.fn(),
            cancelAccountDeletion: jest.fn(),
            cancelAccountDeletionByToken: jest.fn(),
          },
        },
      ],
      overrides: [
        {
          token: ThrottlerGuard,
          type: 'guard',
          useValue: { canActivate: () => true },
        },
      ],
    });

    controller = context.module.get(AuthController);
    authService = context.module.get(AuthService);
    usersService = context.usersService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleLogin', () => {
    it('should call authService.login with user, response, ip, and user-agent', () => {
      const req = makeRequest();
      const res = makeResponse();
      authService.login.mockResolvedValue({ access_token: 'token', user: makeIUser() } as any);

      controller.handleLogin(req, res, '127.0.0.1');

      expect(authService.login).toHaveBeenCalledWith(req.user, res, '127.0.0.1', 'TestAgent/1.0');
    });

    it('should fall back to "Unknown Device" when user-agent header is missing', () => {
      const req = makeRequest({ headers: {} } as any);
      const res = makeResponse();
      authService.login.mockResolvedValue({} as any);

      controller.handleLogin(req, res, '127.0.0.1');

      expect(authService.login).toHaveBeenCalledWith(req.user, res, '127.0.0.1', 'Unknown Device');
    });
  });

  describe('handleRegister', () => {
    it('should delegate to authService.register', () => {
      const dto = {
        name: 'User',
        email: 'u@ex.com',
        password: 'P@ss1',
        age: 25,
        gender: 'male',
        address: 'HN',
      } as any;
      authService.register.mockResolvedValue({
        _id: '1',
        createdAt: new Date(),
        message: 'ok',
      } as any);

      controller.handleRegister(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('handleVerify', () => {
    it('should delegate to authService.verifyEmail', () => {
      const dto = { email: 'u@ex.com', code: '123456' };
      authService.verifyEmail.mockResolvedValue({ message: 'ok' } as any);

      controller.handleVerify(dto);

      expect(authService.verifyEmail).toHaveBeenCalledWith(dto);
    });
  });

  describe('handleResendCode', () => {
    it('should delegate to authService.resendCode with email', () => {
      authService.resendCode.mockResolvedValue({ message: 'sent' });

      controller.handleResendCode('u@ex.com');

      expect(authService.resendCode).toHaveBeenCalledWith('u@ex.com');
    });
  });

  describe('handleGoogleLogin', () => {
    it('should delegate to authService.googleLogin with idToken and response', () => {
      const res = makeResponse();
      authService.googleLogin.mockResolvedValue({} as any);

      controller.handleGoogleLogin({ idToken: 'google-token' } as any, res);

      expect(authService.googleLogin).toHaveBeenCalledWith('google-token', res);
    });
  });

  describe('handleGetAccount', () => {
    it('should return the user profile from usersService', async () => {
      const profile = makeIUser();
      usersService.findUserProfile.mockResolvedValue(profile);

      const result = await controller.handleGetAccount({ _id: 'user-id-123' });

      expect(usersService.findUserProfile).toHaveBeenCalledWith('user-id-123');
      expect(result).toEqual({ user: profile });
    });
  });

  describe('handleRefreshToken', () => {
    it('should call authService.refreshAccessToken with the extracted refresh token', () => {
      const req = makeRequest();
      const res = makeResponse();
      const user = makeIUser();
      authService.refreshAccessToken.mockResolvedValue({} as any);

      controller.handleRefreshToken(req, res, user, '127.0.0.1');

      expect(authService.refreshAccessToken).toHaveBeenCalledWith(
        'mock-refresh-token',
        res,
        user,
        'TestAgent/1.0',
        '127.0.0.1',
      );
    });
  });

  describe('handleLogout', () => {
    it('should call authService.logout with response and refresh token', () => {
      const req = makeRequest();
      const res = makeResponse();
      authService.logout.mockResolvedValue({ message: 'ok' });

      controller.handleLogout(req, res);

      expect(authService.logout).toHaveBeenCalledWith(res, 'mock-refresh-token');
    });
  });

  describe('handleLogoutAll', () => {
    it('should call authService.logoutAllDevices with response and userId', () => {
      const user = makeIUser();
      const res = makeResponse();
      authService.logoutAllDevices.mockResolvedValue({ message: 'ok', devicesLoggedOut: 3 } as any);

      controller.handleLogoutAll(user, res);

      expect(authService.logoutAllDevices).toHaveBeenCalledWith(res, user._id);
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions for the user', async () => {
      const sessions = [{ _id: 's1', userAgent: 'Chrome', ipAddress: '10.0.0.1' }];
      authService.getActiveSessions.mockResolvedValue(sessions as any);

      const result = await controller.getActiveSessions(makeIUser());

      expect(authService.getActiveSessions).toHaveBeenCalledWith('user-id-123');
      expect(result).toEqual(sessions);
    });
  });

  describe('changePassword', () => {
    it('should call authService.changePassword and clear cookie', async () => {
      const user = makeIUser();
      const dto = { currentPassword: 'Old', newPassword: 'New' };
      const res = makeResponse();
      authService.changePassword.mockResolvedValue({ message: 'ok' });

      const result = await controller.changePassword(user, dto as any, res);

      expect(authService.changePassword).toHaveBeenCalledWith(user, dto);
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(result).toEqual({ message: 'ok' });
    });
  });

  describe('setPassword', () => {
    it('should call authService.setPassword and clear cookie', async () => {
      const user = makeIUser({ authProvider: 'google', hasPassword: false });
      const dto = { newPassword: 'NewP@ss1' };
      const res = makeResponse();
      authService.setPassword.mockResolvedValue({ message: 'ok' });

      const result = await controller.setPassword(user, dto as any, res);

      expect(authService.setPassword).toHaveBeenCalledWith(user, dto);
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(result).toEqual({ message: 'ok' });
    });
  });

  describe('forgotPassword', () => {
    it('should delegate to authService.forgotPassword', async () => {
      const dto = { email: 'u@ex.com' };
      authService.forgotPassword.mockResolvedValue({ message: 'ok' });

      await controller.forgotPassword(dto as any);

      expect(authService.forgotPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetPassword', () => {
    it('should delegate to authService.resetPassword', async () => {
      const dto = { token: 't', email: 'u@ex.com', newPassword: 'New' };
      authService.resetPassword.mockResolvedValue({ message: 'ok' });

      await controller.resetPassword(dto as any);

      expect(authService.resetPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('requestAccountDeletion', () => {
    it('should delegate to authService.requestAccountDeletion with user, dto, and response', async () => {
      const user = makeIUser();
      const dto = { password: 'correct' };
      const res = makeResponse();
      authService.requestAccountDeletion.mockResolvedValue({
        message: 'Scheduled',
        scheduledDeletionAt: new Date(),
      });

      const result = await controller.requestAccountDeletion(user, dto as any, res);

      expect(authService.requestAccountDeletion).toHaveBeenCalledWith(user, dto, res);
      expect(result).toHaveProperty('scheduledDeletionAt');
    });
  });

  describe('cancelAccountDeletion', () => {
    it('should delegate to authService.cancelAccountDeletion with userId', async () => {
      const user = makeIUser();
      authService.cancelAccountDeletion.mockResolvedValue({ message: 'Cancelled' });

      const result = await controller.cancelAccountDeletion(user);

      expect(authService.cancelAccountDeletion).toHaveBeenCalledWith(user._id);
      expect(result).toEqual({ message: 'Cancelled' });
    });
  });

  describe('cancelAccountDeletionByToken', () => {
    it('should delegate to authService.cancelAccountDeletionByToken', async () => {
      authService.cancelAccountDeletionByToken.mockResolvedValue({ message: 'Cancelled' });

      const result = await controller.cancelAccountDeletionByToken({ token: 'magic-token' });

      expect(authService.cancelAccountDeletionByToken).toHaveBeenCalledWith('magic-token');
      expect(result).toEqual({ message: 'Cancelled' });
    });
  });
});
