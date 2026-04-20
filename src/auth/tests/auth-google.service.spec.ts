import { UnauthorizedException } from '@nestjs/common';
import { AuthGoogleService } from '../services/auth-google.service';
import { AuthSessionService } from '../services/auth-session.service';
import {
  makeGoogleUser,
  makeResponse,
  makeUser,
  mockGoogleLoginResult,
  mockGoogleProfile,
} from '../testing/auth-test-data';
import {
  AuthTestingModuleContext,
  createAuthTestingModule,
} from '../testing/create-auth-testing-module';

describe('AuthGoogleService', () => {
  let service: AuthGoogleService;
  let usersService: AuthTestingModuleContext['usersService'];
  let authSessionService: {
    login: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  };
  let verifyIdTokenMock: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;

  beforeEach(async () => {
    authSessionService = {
      login: jest.fn().mockResolvedValue(mockGoogleLoginResult),
    };

    const context = await createAuthTestingModule({
      providers: [AuthGoogleService, { provide: AuthSessionService, useValue: authSessionService }],
    });

    service = context.module.get(AuthGoogleService);
    usersService = context.usersService;
    verifyIdTokenMock = jest.fn() as jest.MockedFunction<
      (...args: unknown[]) => Promise<unknown>
    >;

    (service as any).googleClient = {
      verifyIdToken: verifyIdTokenMock,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  function mockGoogleTicket(overrides: Record<string, unknown> = {}) {
    return {
      getPayload: jest.fn().mockReturnValue({
        sub: mockGoogleProfile.googleId,
        email: mockGoogleProfile.email,
        name: mockGoogleProfile.name,
        picture: mockGoogleProfile.avatar,
        email_verified: true,
        ...overrides,
      }),
    };
  }

  describe('googleLogin', () => {
    it('should return tokens when a user exists by Google ID and is not locked', async () => {
      verifyIdTokenMock.mockResolvedValue(mockGoogleTicket());
      usersService.findUserByGoogleId.mockResolvedValue(makeGoogleUser());

      const result = await service.googleLogin('valid-id-token', makeResponse());

      expect(usersService.findUserByGoogleId).toHaveBeenCalledWith(mockGoogleProfile.googleId);
      expect(authSessionService.login).toHaveBeenCalled();
      expect(result).toEqual(mockGoogleLoginResult);
    });

    it('should throw UnauthorizedException when an existing Google user is locked', async () => {
      verifyIdTokenMock.mockResolvedValue(mockGoogleTicket());
      usersService.findUserByGoogleId.mockResolvedValue(makeGoogleUser({ isLocked: true }));

      await expect(service.googleLogin('valid-id-token', makeResponse())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authSessionService.login).not.toHaveBeenCalled();
    });

    it('should create a new Google user and return tokens when no user exists', async () => {
      verifyIdTokenMock.mockResolvedValue(mockGoogleTicket());
      usersService.findUserByGoogleId.mockResolvedValue(null);
      usersService.findUserByEmail.mockResolvedValue(null);
      usersService.createGoogleUser.mockResolvedValue(makeGoogleUser());

      const result = await service.googleLogin('valid-id-token', makeResponse());

      expect(usersService.createGoogleUser).toHaveBeenCalledWith(mockGoogleProfile);
      expect(authSessionService.login).toHaveBeenCalled();
      expect(result).toEqual(mockGoogleLoginResult);
    });

    it('should link Google account to an active email account and return tokens', async () => {
      verifyIdTokenMock.mockResolvedValue(mockGoogleTicket());
      usersService.findUserByGoogleId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeGoogleUser());
      const existingEmailUser = makeUser({ isActive: true, isLocked: false });
      usersService.findUserByEmail.mockResolvedValue(existingEmailUser);
      usersService.linkGoogleAccount.mockResolvedValue(undefined);

      const result = await service.googleLogin('valid-id-token', makeResponse());

      expect(usersService.linkGoogleAccount).toHaveBeenCalledWith(
        existingEmailUser._id.toString(),
        mockGoogleProfile.googleId,
      );
      expect(result).toEqual(mockGoogleLoginResult);
    });

    it('should delete an unverified local account and create a new Google user', async () => {
      verifyIdTokenMock.mockResolvedValue(mockGoogleTicket());
      usersService.findUserByGoogleId.mockResolvedValue(null);
      usersService.findUserByEmail.mockResolvedValue(makeUser({ isActive: false }));
      usersService.createGoogleUser.mockResolvedValue(makeGoogleUser());

      const result = await service.googleLogin('valid-id-token', makeResponse());

      expect(usersService.remove).toHaveBeenCalled();
      expect(usersService.createGoogleUser).toHaveBeenCalledWith(mockGoogleProfile);
      expect(result).toEqual(mockGoogleLoginResult);
    });

    it('should throw UnauthorizedException when Google rejects the token', async () => {
      verifyIdTokenMock.mockRejectedValue(new Error('Token verification failed'));

      await expect(service.googleLogin('invalid-id-token', makeResponse())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should re-throw UnauthorizedException when the Google email is not verified', async () => {
      verifyIdTokenMock.mockResolvedValue(mockGoogleTicket({ email_verified: false }));

      await expect(service.googleLogin('unverified-id-token', makeResponse())).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
