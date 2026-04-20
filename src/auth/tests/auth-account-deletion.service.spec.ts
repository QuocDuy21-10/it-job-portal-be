import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthAccountDeletionService } from '../services/auth-account-deletion.service';
import { EAuthProvider } from '../enums/auth-provider.enum';
import { makeIUser, makeResponse, makeUser } from '../testing/auth-test-data';
import {
  AuthTestingModuleContext,
  createAuthTestingModule,
} from '../testing/create-auth-testing-module';


describe('AuthAccountDeletionService', () => {
  let service: AuthAccountDeletionService;
  let usersService: AuthTestingModuleContext['usersService'];
  let sessionsService: AuthTestingModuleContext['sessionsService'];
  let accountDeletionQueueService: AuthTestingModuleContext['accountDeletionQueueService'];
  let cacheManager: AuthTestingModuleContext['cacheManager'];
  let mailService: AuthTestingModuleContext['mailService'];
  const currentUser = makeIUser();

  beforeEach(async () => {
    const context = await createAuthTestingModule({
      providers: [AuthAccountDeletionService],
    });

    service = context.module.get(AuthAccountDeletionService);
    usersService = context.usersService;
    sessionsService = context.sessionsService;
    accountDeletionQueueService = context.accountDeletionQueueService;
    cacheManager = context.cacheManager;
    mailService = context.mailService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('requestAccountDeletion', () => {
    it('should schedule deletion for a local account with a valid password', async () => {
      const response = makeResponse();
      usersService.findOneByUserEmail.mockResolvedValue(makeUser());
      usersService.isValidPassword.mockReturnValue(true);

      const result = await service.requestAccountDeletion(
        currentUser,
        { password: 'correct' },
        response,
      );

      expect(usersService.scheduleAccountDeletion).toHaveBeenCalled();
      expect(sessionsService.deleteAllUserSessions).toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith('refresh_token');
      expect(accountDeletionQueueService.addDeletionJob).toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('scheduledDeletionAt');
    });

    it('should throw BadRequestException when a local account omits the password', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(
        makeUser({ authProvider: EAuthProvider.LOCAL }),
      );

      await expect(
        service.requestAccountDeletion(currentUser, {} as any, makeResponse()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when a local account password is wrong', async () => {
      usersService.findOneByUserEmail.mockResolvedValue(
        makeUser({ authProvider: EAuthProvider.LOCAL }),
      );
      usersService.isValidPassword.mockReturnValue(false);

      await expect(
        service.requestAccountDeletion(currentUser, { password: 'wrong' }, makeResponse()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException when deletion is already pending', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      usersService.findOneByUserEmail.mockResolvedValue(
        makeUser({ scheduledDeletionAt: futureDate }),
      );

      await expect(
        service.requestAccountDeletion(currentUser, { password: 'any' }, makeResponse()),
      ).rejects.toThrow(ConflictException);
    });

    it('should not fail if sending the email throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      usersService.findOneByUserEmail.mockResolvedValue(makeUser());
      usersService.isValidPassword.mockReturnValue(true);
      mailService.sendAccountDeletionScheduled.mockRejectedValue(new Error('SMTP down'));

      const result = await service.requestAccountDeletion(
        currentUser,
        { password: 'correct' },
        makeResponse(),
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result).toHaveProperty('scheduledDeletionAt');
    });
  });

  describe('cancelAccountDeletion', () => {
    it('should cancel deletion successfully', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      usersService.findOne.mockResolvedValue(makeUser({ scheduledDeletionAt: futureDate }));
      cacheManager.get.mockResolvedValue('some-cancel-token');

      const result = await service.cancelAccountDeletion('user-id-123');

      expect(accountDeletionQueueService.cancelDeletionJob).toHaveBeenCalledWith('user-id-123');
      expect(usersService.cancelAccountDeletion).toHaveBeenCalledWith('user-id-123');
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when user is not found', async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(service.cancelAccountDeletion('user-id-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when no pending deletion exists', async () => {
      usersService.findOne.mockResolvedValue(makeUser({ scheduledDeletionAt: null }));

      await expect(service.cancelAccountDeletion('user-id-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when the grace period has expired', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      usersService.findOne.mockResolvedValue(makeUser({ scheduledDeletionAt: pastDate }));

      await expect(service.cancelAccountDeletion('user-id-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelAccountDeletionByToken', () => {
    it('should cancel deletion when the token is valid and deletion is pending', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      cacheManager.get.mockResolvedValueOnce('user-id-123').mockResolvedValueOnce('the-token');
      usersService.findOne.mockResolvedValue(makeUser({ scheduledDeletionAt: futureDate }));

      const result = await service.cancelAccountDeletionByToken('the-token');

      expect(accountDeletionQueueService.cancelDeletionJob).toHaveBeenCalledWith('user-id-123');
      expect(usersService.cancelAccountDeletion).toHaveBeenCalledWith('user-id-123');
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when the token is invalid or expired', async () => {
      cacheManager.get.mockResolvedValue(null);

      await expect(service.cancelAccountDeletionByToken('bad-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when the grace period has expired', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      cacheManager.get.mockResolvedValueOnce('user-id-123').mockResolvedValueOnce('the-token');
      usersService.findOne.mockResolvedValue(makeUser({ scheduledDeletionAt: pastDate }));

      await expect(service.cancelAccountDeletionByToken('the-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
