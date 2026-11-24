import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as otpUtils from '../utils/otp.utils';
import { AuthVerificationService } from '../services/auth-verification.service';
import { makeUser, verifyAuthDto } from '../testing/auth-test-data';
import {
  AuthTestingModuleContext,
  createAuthTestingModule,
} from '../testing/create-auth-testing-module';

describe('AuthVerificationService', () => {
  let service: AuthVerificationService;
  let usersService: AuthTestingModuleContext['usersService'];
  let redisClient: AuthTestingModuleContext['redisClient'];
  let redisPipeline: AuthTestingModuleContext['redisPipeline'];
  let mailerService: AuthTestingModuleContext['mailerService'];

  beforeEach(async () => {
    const context = await createAuthTestingModule({
      providers: [AuthVerificationService],
    });

    service = context.module.get(AuthVerificationService);
    usersService = context.usersService;
    redisClient = context.redisClient;
    redisPipeline = context.redisPipeline;
    mailerService = context.mailerService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('sendVerificationCode', () => {
    it('should write OTP keys to Redis and send the verification email', async () => {
      const user = makeUser();
      jest.spyOn(otpUtils, 'generateOtp').mockReturnValue('123456');
      jest.spyOn(otpUtils, 'hashOtp').mockReturnValue('hashed-otp');

      await service.sendVerificationCode(user);

      expect(redisClient.pipeline).toHaveBeenCalled();
      expect(redisPipeline.set).toHaveBeenNthCalledWith(
        1,
        'otp:value:test@example.com',
        'hashed-otp',
        'EX',
        300,
      );
      expect(redisPipeline.set).toHaveBeenNthCalledWith(
        2,
        'otp:attempts:test@example.com',
        '0',
        'EX',
        300,
      );
      expect(redisPipeline.set).toHaveBeenNthCalledWith(
        3,
        'otp:cooldown:test@example.com',
        '1',
        'EX',
        60,
        'NX',
      );
      expect(redisPipeline.exec).toHaveBeenCalled();
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Activate your account at DevLink',
        }),
      );
    });
  });

  describe('verifyEmail', () => {
    // Per-key INCR counters, like Redis.
    const useRedisCounters = (start: Record<string, number> = {}) => {
      const counters = { ...start };
      redisClient.incr.mockImplementation(
        async (key: string) => (counters[key] = (counters[key] ?? 0) + 1),
      );
      return counters;
    };

    it('should verify email successfully and activate user', async () => {
      useRedisCounters();
      redisClient.get.mockResolvedValueOnce('stored-hash');
      jest.spyOn(otpUtils, 'verifyOtp').mockReturnValue(true);
      const user = makeUser();
      usersService.findUserByEmail.mockResolvedValue(user);
      usersService.activateUser.mockResolvedValue(undefined);

      const result = await service.verifyEmail(verifyAuthDto);

      expect(redisClient.del).toHaveBeenCalledWith(
        'otp:value:test@example.com',
        'otp:attempts:test@example.com',
        'otp:cooldown:test@example.com',
      );
      expect(usersService.activateUser).toHaveBeenCalledWith(user._id.toString());
      expect(result).toHaveProperty('message');
    });

    it('should refuse a sixth guess for the same code without comparing it', async () => {
      useRedisCounters({ 'otp:attempts:test@example.com': 5 });
      const verify = jest.spyOn(otpUtils, 'verifyOtp');

      await expect(service.verifyEmail(verifyAuthDto)).rejects.toThrow(ForbiddenException);
      expect(verify).not.toHaveBeenCalled();
    });

    // Resend gives each new code 5 guesses; the daily cap stops resend from resetting the budget forever.
    it('should refuse guesses past the daily cap even with a fresh code', async () => {
      useRedisCounters({ 'otp:attempts:day:test@example.com': 15 });
      const verify = jest.spyOn(otpUtils, 'verifyOtp');

      await expect(service.verifyEmail(verifyAuthDto)).rejects.toThrow(ForbiddenException);
      expect(verify).not.toHaveBeenCalled();
    });

    it('should compare at most 5 of 20 parallel wrong guesses', async () => {
      useRedisCounters();
      redisClient.get.mockResolvedValue('stored-hash');
      const verify = jest.spyOn(otpUtils, 'verifyOtp').mockReturnValue(false);

      await Promise.allSettled(
        Array.from({ length: 20 }, () => service.verifyEmail(verifyAuthDto)),
      );

      expect(verify).toHaveBeenCalledTimes(5);
    });

    it('should give the daily counter a 24 hour expiry on first use', async () => {
      useRedisCounters();
      redisClient.get.mockResolvedValueOnce('stored-hash');
      jest.spyOn(otpUtils, 'verifyOtp').mockReturnValue(false);

      await expect(service.verifyEmail(verifyAuthDto)).rejects.toThrow(BadRequestException);
      expect(redisClient.expire).toHaveBeenCalledWith('otp:attempts:day:test@example.com', 86400);
    });

    it('should throw BadRequestException when OTP is expired or missing', async () => {
      useRedisCounters();
      redisClient.get.mockResolvedValueOnce(null);

      await expect(service.verifyEmail(verifyAuthDto)).rejects.toThrow(BadRequestException);
    });

    it('should report the guesses left when OTP is incorrect', async () => {
      useRedisCounters({ 'otp:attempts:test@example.com': 2 });
      redisClient.get.mockResolvedValueOnce('stored-hash');
      jest.spyOn(otpUtils, 'verifyOtp').mockReturnValue(false);

      await expect(service.verifyEmail(verifyAuthDto)).rejects.toThrow('Còn 2 lần thử');
    });

    it('should throw BadRequestException when user is not found after OTP validation', async () => {
      useRedisCounters();
      redisClient.get.mockResolvedValueOnce('stored-hash');
      jest.spyOn(otpUtils, 'verifyOtp').mockReturnValue(true);
      usersService.findUserByEmail.mockResolvedValue(null);

      await expect(service.verifyEmail(verifyAuthDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendCode', () => {
    it('should resend code when cooldown is not active and user is unverified', async () => {
      redisClient.get.mockResolvedValue(null);
      const user = makeUser({ isActive: false });
      usersService.findUserByEmail.mockResolvedValue(user);
      const sendVerificationCodeSpy = jest
        .spyOn(service, 'sendVerificationCode')
        .mockResolvedValue(undefined);

      const result = await service.resendCode('test@example.com');

      expect(sendVerificationCodeSpy).toHaveBeenCalledWith(user);
      expect(result).toHaveProperty('message');
    });

    it('should throw BadRequestException when cooldown is active', async () => {
      redisClient.get.mockResolvedValue('1');
      redisClient.ttl.mockResolvedValue(45);

      await expect(service.resendCode('test@example.com')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user is not found', async () => {
      redisClient.get.mockResolvedValue(null);
      usersService.findUserByEmail.mockResolvedValue(null);

      await expect(service.resendCode('unknown@example.com')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user is already active', async () => {
      redisClient.get.mockResolvedValue(null);
      usersService.findUserByEmail.mockResolvedValue(makeUser({ isActive: true }));

      await expect(service.resendCode('test@example.com')).rejects.toThrow(BadRequestException);
    });
  });
});
