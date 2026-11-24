import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { UsersService } from 'src/users/users.service';
import { VerifyAuthDto } from '../dto/verify-auth.dto';
import { generateOtp, hashOtp, verifyOtp } from '../utils/otp.utils';

const OTP_TTL_SECONDS = 300;
const OTP_ATTEMPT_LIMIT = 5;
// Each resend gives a fresh code 5 guesses; this caps the guesses per email across codes.
const OTP_DAILY_ATTEMPT_LIMIT = 15;
const OTP_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

@Injectable()
export class AuthVerificationService {
  private readonly logger = new Logger(AuthVerificationService.name);
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  async sendVerificationCode(user: any): Promise<void> {
    const otpSecret = this.configService.get<string>('OTP_SECRET');
    const code = generateOtp();
    const hash = hashOtp(code, otpSecret);
    const email = user.email;

    const pipeline = this.redisClient.pipeline();
    pipeline.set(`otp:value:${email}`, hash, 'EX', OTP_TTL_SECONDS);
    pipeline.set(`otp:attempts:${email}`, '0', 'EX', OTP_TTL_SECONDS);
    pipeline.set(`otp:cooldown:${email}`, '1', 'EX', 60, 'NX' as any);
    await pipeline.exec();

    await this.mailerService
      .sendMail({
        to: email,
        subject: 'Activate your account at DevLink',
        template: 'verify-email',
        context: {
          name: user.name,
          code,
          currentYear: new Date().getFullYear(),
        },
      })
      .catch(err => this.logger.error('Failed to send verification email', err));
  }

  async verifyEmail(dto: VerifyAuthDto) {
    const { email, code } = dto;
    const otpSecret = this.configService.get<string>('OTP_SECRET');

    const attemptsKey = `otp:attempts:${email}`;
    const dailyKey = `otp:attempts:day:${email}`;
    // INCR before comparing: each parallel guess takes its own slot, so at most the limit are compared.
    const attempts = await this.redisClient.incr(attemptsKey);
    const dailyAttempts = await this.redisClient.incr(dailyKey);
    if (attempts === 1) await this.redisClient.expire(attemptsKey, OTP_TTL_SECONDS);
    if (dailyAttempts === 1) await this.redisClient.expire(dailyKey, OTP_DAILY_WINDOW_SECONDS);

    if (dailyAttempts > OTP_DAILY_ATTEMPT_LIMIT) {
      throw new ForbiddenException(
        'Quá nhiều lần thử không thành công. Vui lòng thử lại sau 24 giờ.',
      );
    }
    if (attempts > OTP_ATTEMPT_LIMIT) {
      throw new ForbiddenException(
        'Quá nhiều lần thử không thành công. Vui lòng yêu cầu mã xác thực mới.',
      );
    }

    const storedHash = await this.redisClient.get(`otp:value:${email}`);
    if (!storedHash) {
      throw new BadRequestException('Mã xác thực đã hết hạn hoặc không tồn tại');
    }

    if (!verifyOtp(code, storedHash, otpSecret)) {
      const remaining = OTP_ATTEMPT_LIMIT - attempts;
      throw new BadRequestException(`Mã xác thực không chính xác. Còn ${remaining} lần thử.`);
    }

    await this.redisClient.del(
      `otp:value:${email}`,
      `otp:attempts:${email}`,
      `otp:cooldown:${email}`,
    );

    const user = await this.usersService.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    await this.usersService.activateUser(user._id.toString());

    return { message: 'Kích hoạt tài khoản thành công. Bạn có thể đăng nhập ngay bây giờ.' };
  }

  async resendCode(email: string) {
    const cooldown = await this.redisClient.get(`otp:cooldown:${email}`);
    if (cooldown) {
      const ttl = await this.redisClient.ttl(`otp:cooldown:${email}`);
      throw new BadRequestException(`Vui lòng chờ ${ttl} giây trước khi yêu cầu mã mới.`);
    }

    const user = await this.usersService.findUserByEmail(email);
    if (!user) throw new BadRequestException('Người dùng không tồn tại');
    if (user.isActive) throw new BadRequestException('Tài khoản đã được kích hoạt rồi');

    await this.sendVerificationCode(user);
    return { message: 'Đã gửi lại mã xác thực mới' };
  }
}
