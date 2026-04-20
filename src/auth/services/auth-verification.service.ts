import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { UsersService } from 'src/users/users.service';
import { VerifyAuthDto } from '../dto/verify-auth.dto';
import { generateOtp, hashOtp, verifyOtp } from '../utils/otp.utils';

@Injectable()
export class AuthVerificationService {
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
    pipeline.set(`otp:value:${email}`, hash, 'EX', 300);
    pipeline.set(`otp:attempts:${email}`, '0', 'EX', 300);
    pipeline.set(`otp:cooldown:${email}`, '1', 'EX', 60, 'NX' as any);
    await pipeline.exec();

    this.mailerService.sendMail({
      to: email,
      subject: 'Activate your account at IT Job Portal',
      template: 'verify-email',
      context: {
        name: user.name,
        code,
        currentYear: new Date().getFullYear(),
      },
    });
  }

  async verifyEmail(dto: VerifyAuthDto) {
    const { email, code } = dto;
    const otpSecret = this.configService.get<string>('OTP_SECRET');

    const attemptsRaw = await this.redisClient.get(`otp:attempts:${email}`);
    const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;
    if (attempts >= 5) {
      throw new ForbiddenException(
        'Quá nhiều lần thử không thành công. Vui lòng yêu cầu mã xác thực mới.',
      );
    }

    const storedHash = await this.redisClient.get(`otp:value:${email}`);
    if (!storedHash) {
      throw new BadRequestException('Mã xác thực đã hết hạn hoặc không tồn tại');
    }

    if (!verifyOtp(code, storedHash, otpSecret)) {
      await this.redisClient.incr(`otp:attempts:${email}`);
      const remaining = 4 - attempts;
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
