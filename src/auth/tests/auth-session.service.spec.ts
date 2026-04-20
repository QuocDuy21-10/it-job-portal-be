import { BadRequestException } from '@nestjs/common';
import { AuthSessionService } from '../services/auth-session.service';
import { makeIUser, makeResponse } from '../testing/auth-test-data';
import {
  AuthTestingModuleContext,
  createAuthTestingModule,
} from '../testing/create-auth-testing-module';

describe('AuthSessionService', () => {
  let service: AuthSessionService;
  let jwtService: AuthTestingModuleContext['jwtService'];
  let sessionsService: AuthTestingModuleContext['sessionsService'];

  beforeEach(async () => {
    const context = await createAuthTestingModule({
      providers: [AuthSessionService],
    });

    service = context.module.get(AuthSessionService);
    jwtService = context.jwtService;
    sessionsService = context.sessionsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return access token and user info, set cookie, and create session', async () => {
      const response = makeResponse();
      const user = makeIUser();

      const result = await service.login(user, response, '127.0.0.1', 'TestAgent');

      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(sessionsService.createSession).toHaveBeenCalledWith(
        user._id,
        'mock-jwt-token',
        'TestAgent',
        '127.0.0.1',
      );
      expect(sessionsService.enforceSessionLimit).toHaveBeenCalledWith(user._id, 5);
      expect(response.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'mock-jwt-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        }),
      );
      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user._id).toBe(user._id);
      expect(result.user.email).toBe(user.email);
    });

    it('should set secure=false when NODE_ENV is not production', async () => {
      const response = makeResponse();

      await service.login(makeIUser(), response, '127.0.0.1', 'TestAgent');

      expect(response.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.objectContaining({ secure: false }),
      );
    });
  });

  describe('createAccessToken', () => {
    it('should sign the access token with the access secret', () => {
      const payload = { sub: 'user-id', type: 'access' as const };

      const token = service.createAccessToken(payload);

      expect(token).toBe('mock-jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        payload,
        expect.objectContaining({ secret: 'access-secret' }),
      );
    });
  });

  describe('createRefreshToken', () => {
    it('should sign the refresh token with the refresh secret', () => {
      const payload = { sub: 'user-id', type: 'refresh' as const };

      const token = service.createRefreshToken(payload);

      expect(token).toBe('mock-jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        payload,
        expect.objectContaining({ secret: 'refresh-secret' }),
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('should rotate tokens, delete the old session, create a new session, and set a new cookie', async () => {
      const response = makeResponse();
      const user = makeIUser();

      const result = await service.refreshAccessToken(
        'old-refresh-token',
        response,
        user,
        'TestAgent',
        '127.0.0.1',
      );

      expect(sessionsService.deleteSession).toHaveBeenCalledWith('old-refresh-token');
      expect(sessionsService.createSession).toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(response.cookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result.access_token).toBeDefined();
      expect(result.user._id).toBe(user._id);
    });

    it('should throw BadRequestException when the old session is not found', async () => {
      const response = makeResponse();
      sessionsService.deleteSession.mockResolvedValue(false as never);

      await expect(
        service.refreshAccessToken(
          'invalid-token',
          response,
          makeIUser(),
          'TestAgent',
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token');
    });
  });

  describe('logout', () => {
    it('should delete the session and clear the cookie', async () => {
      const response = makeResponse();

      const result = await service.logout(response, 'some-refresh-token');

      expect(sessionsService.deleteSession).toHaveBeenCalledWith('some-refresh-token');
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(result).toHaveProperty('message');
    });
  });

  describe('logoutAllDevices', () => {
    it('should delete all sessions and clear the cookie', async () => {
      const response = makeResponse();

      const result = await service.logoutAllDevices(response, 'user-id-123');

      expect(sessionsService.deleteAllUserSessions).toHaveBeenCalledWith('user-id-123');
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(result.devicesLoggedOut).toBe(3);
    });
  });

  describe('getActiveSessions', () => {
    it('should return a mapped session list', async () => {
      const rawSessions = [
        {
          _id: 'session-1',
          userAgent: 'Chrome',
          ipAddress: '10.0.0.1',
          lastUsedAt: new Date(),
          createdAt: new Date(),
          expiresAt: new Date(),
        },
      ];
      sessionsService.getActiveSessions.mockResolvedValue(rawSessions as never);

      const result = await service.getActiveSessions('user-id-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('userAgent', 'Chrome');
      expect(result[0]).not.toHaveProperty('refreshToken');
    });
  });
});
