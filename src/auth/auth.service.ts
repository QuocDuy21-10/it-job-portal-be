import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import { IUser } from 'src/users/user.interface';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { OAuth2Client } from 'google-auth-library';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MailerService } from '@nestjs-modules/mailer';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { v4 as uuidv4 } from 'uuid';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { SessionsService } from 'src/sessions/sessions.service';
import { IJwtAccessPayload, IJwtRefreshPayload } from './interfaces/jwt-payload.interface';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';
import { generateOtp, hashOtp, verifyOtp } from './utils/otp.utils';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private sessionsService: SessionsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private mailerService: MailerService,
  ) {
    // Initialize Google OAuth2 Client
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!googleClientId) {
      console.warn('GOOGLE_CLIENT_ID not configured in environment variables');
    }
    this.googleClient = new OAuth2Client(googleClientId);
  }
  hashPassword(password: string) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    return hash;
  }
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findOneByUserEmail(email);
    if (user) {
      if (!user.password) {
        throw new BadRequestException(
          'Tài khoản này đăng ký qua Google. Vui lòng đăng nhập bằng Google hoặc thiết lập mật khẩu.',
        );
      }
      const isValid = this.usersService.isValidPassword(password, user.password);
      if (isValid) {
        if (!user.isActive) {
          throw new BadRequestException('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.');
        }
        if (user.isLocked) {
          throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
        }
        // get user role casting data (ObjectId -> {_id: string, name: string})
        const objectUser = {
          ...user.toObject(),
        };
        return objectUser;
      }
    }
    return null;
  }

  async register(registerUserDto: AuthRegisterDto) {
    const { email } = registerUserDto;

    const existingUser = await this.usersService.findUserByEmail(email);
    if (existingUser && existingUser.isActive) {
      throw new BadRequestException('Email đã tồn tại');
    }

    let newUser: any;
    if (existingUser && !existingUser.isActive) {
      // Unverified account already exists — update it in-place and resend OTP
      newUser = await this.usersService.updateUnverifiedUser(
        existingUser._id.toString(),
        registerUserDto,
      );
    } else {
      newUser = await this.usersService.register(registerUserDto);
    }

    // Send OTP verification code
    await this.sendVerificationCode(newUser);

    return {
      _id: newUser?._id,
      createdAt: newUser?.createdAt,
      message: 'Vui lòng kiểm tra email để kích hoạt tài khoản',
    };
  }

  async sendVerificationCode(user: any): Promise<void> {
    const otpSecret = this.configService.get<string>('OTP_SECRET');
    const code = generateOtp();
    const hash = hashOtp(code, otpSecret);
    const email = user.email;

    // Use pipeline for atomic multi-key set
    const pipeline = this.redisClient.pipeline();
    pipeline.set(`otp:value:${email}`, hash, 'EX', 300);
    pipeline.set(`otp:attempts:${email}`, '0', 'EX', 300);
    // SET NX: only create cooldown key if it doesn't already exist
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

    // Check exceeded attempt limit
    const attemptsRaw = await this.redisClient.get(`otp:attempts:${email}`);
    const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;
    if (attempts >= 5) {
      throw new ForbiddenException(
        'Quá nhiều lần thử không thành công. Vui lòng yêu cầu mã xác thực mới.',
      );
    }

    // Get stored hash
    const storedHash = await this.redisClient.get(`otp:value:${email}`);
    if (!storedHash) {
      throw new BadRequestException('Mã xác thực đã hết hạn hoặc không tồn tại');
    }

    // Verify OTP (timing-safe)
    if (!verifyOtp(code, storedHash, otpSecret)) {
      // Increment failed attempt counter
      await this.redisClient.incr(`otp:attempts:${email}`);
      const remaining = 4 - attempts;
      throw new BadRequestException(`Mã xác thực không chính xác. Còn ${remaining} lần thử.`);
    }

    // OTP correct: clean up Redis keys and activate user
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

  async login(user: IUser, response: Response, ipAddress: string, userAgent: string) {
    const { _id } = user;

    // Tạo payload tối ưu (chỉ chứa userId)
    const accessPayload: IJwtAccessPayload = {
      sub: _id,
      type: 'access',
    };

    const refreshPayload: IJwtRefreshPayload = {
      sub: _id,
      type: 'refresh',
    };

    // Tạo tokens
    const access_token = this.createAccessToken(accessPayload);
    const refresh_token = this.createRefreshToken(refreshPayload);

    // Tạo session mới trong DB (thay vì lưu vào User.refreshToken)
    await this.sessionsService.createSession(_id, refresh_token, userAgent, ipAddress);

    // (Optional) Giới hạn số session tối đa - Xóa session cũ nếu vượt quá 5 devices
    await this.sessionsService.enforceSessionLimit(_id, 5);

    // Set refresh token vào cookie HttpOnly
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production', // Chỉ dùng HTTPS ở production
      sameSite: 'strict', // Bảo vệ CSRF
      maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')),
    });

    return {
      access_token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company,
      },
    };
  }

  createAccessToken(payload: IJwtAccessPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_ACCESS_EXPIRES_IN')) / 1000,
    });
  }

  createRefreshToken(payload: IJwtRefreshPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) / 1000,
    });
  }

  async refreshAccessToken(
    oldRefreshToken: string,
    response: Response,
    user: IUser,
    userAgent: string,
    ipAddress: string,
  ) {
    try {
      // BƯỚC 1: Xóa session cũ (Token Rotation - refresh token chỉ dùng 1 lần)
      const deleted = await this.sessionsService.deleteSession(oldRefreshToken);

      if (!deleted) {
        throw new BadRequestException('Session not found or already used');
      }

      // BƯỚC 2: User đã được hydrate đầy đủ từ JwtRefreshStrategy

      // BƯỚC 3: Tạo payload mới (tối ưu - chỉ chứa userId)
      const accessPayload: IJwtAccessPayload = {
        sub: user._id,
        type: 'access',
      };

      const refreshPayload: IJwtRefreshPayload = {
        sub: user._id,
        type: 'refresh',
      };

      // BƯỚC 4: Tạo tokens MỚI
      const newAccessToken = this.createAccessToken(accessPayload);
      const newRefreshToken = this.createRefreshToken(refreshPayload);

      // BƯỚC 5: Tạo session MỚI trong DB
      await this.sessionsService.createSession(user._id, newRefreshToken, userAgent, ipAddress);

      // BƯỚC 6: Xóa cookie cũ và set cookie mới
      response.clearCookie('refresh_token');
      response.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: this.configService.get<string>('NODE_ENV') === 'production',
        sameSite: 'strict',
        maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')),
      });

      // BƯỚC 7: Trả về access token mới
      return {
        access_token: newAccessToken,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: user.company,
        },
      };
    } catch (error) {
      // Nếu có lỗi, xóa cookie để force user login lại
      response.clearCookie('refresh_token');
      throw new BadRequestException(
        `Refresh token không hợp lệ. Vui lòng đăng nhập lại. Error: ${error.message}`,
      );
    }
  }

  async logout(response: Response, refreshToken: string) {
    // Xóa session tương ứng với refresh token hiện tại
    await this.sessionsService.deleteSession(refreshToken);

    // Xóa refresh token trong cookies
    response.clearCookie('refresh_token');

    return { message: 'Logout successfully' };
  }

  async logoutAllDevices(response: Response, userId: string) {
    // Xóa tất cả sessions của user
    const deletedCount = await this.sessionsService.deleteAllUserSessions(userId);

    // Xóa refresh token trong cookies (device hiện tại)
    response.clearCookie('refresh_token');

    return {
      message: `Logged out from all devices successfully`,
      devicesLoggedOut: deletedCount,
    };
  }

  /**
   * Get Active Sessions - Lấy danh sách sessions đang active
   * @param userId - ID của user
   */
  async getActiveSessions(userId: string) {
    const sessions = await this.sessionsService.getActiveSessions(userId);

    return sessions.map(session => ({
      _id: session._id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  /**
   * Google Login - Verify ID token and handle user authentication
   * @param idToken - Google ID token from frontend
   * @param response - Express response object for setting cookies
   * @returns JWT access token and user information
   */
  async googleLogin(idToken: string, response: Response) {
    try {
      // Step 1: Verify Google ID token
      const googleUser = await this.verifyGoogleToken(idToken);

      // Step 2: Find or create user
      let user = await this.usersService.findUserByGoogleId(googleUser.googleId);

      if (!user) {
        // Check if email already exists (user registered with email/password)
        const existingUser = await this.usersService.findUserByEmail(googleUser.email);

        if (existingUser && existingUser.isActive) {
          // Link Google account to verified existing user only
          await this.usersService.linkGoogleAccount(
            existingUser._id.toString(),
            googleUser.googleId,
          );
          user = await this.usersService.findUserByGoogleId(googleUser.googleId);
        } else {
          // Either no existing user, or existing user is unverified (security risk — do not link)
          // If unverified account exists, delete it and create a fresh Google user
          if (existingUser && !existingUser.isActive) {
            await this.usersService.remove(existingUser._id.toString(), {
              _id: existingUser._id.toString(),
              email: existingUser.email,
            } as IUser);
          }
          // Create new user with Google profile (auto-activated)
          user = await this.usersService.createGoogleUser(googleUser);
        }
      }

      // Step 3: Check account is not locked
      if (user.isLocked) {
        throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
      }

      // Step 4: Get user role
      const userRole = user.role as unknown as { _id: string; name: string };

      const userObject: IUser = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        authProvider: user.authProvider,
        hasPassword: !!user.password,
        role: userRole,
        company: user.company
          ? {
              _id: user.company._id?.toString() || '',
              name: user.company.name || '',
              logo: user.company.logo,
            }
          : undefined,
        savedJobs: user.savedJobs?.map(jobId => jobId.toString()) || [],
        companyFollowed: user.companyFollowed?.map(compId => compId.toString()) || [],
      };

      // Step 4: Generate JWT tokens và tạo session
      // Cần truyền thêm ipAddress và userAgent - sẽ được truyền từ controller
      // Tạm thời dùng giá trị mặc định, controller sẽ override
      return await this.login(userObject, response, 'unknown', 'google-login');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException(
        `Google authentication failed: ${error.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Verify Google ID token and extract user information
   * @param idToken - Google ID token from frontend
   * @returns User profile information from Google
   */
  private async verifyGoogleToken(idToken: string): Promise<{
    googleId: string;
    email: string;
    name: string;
    avatar?: string;
  }> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('Invalid Google token: No payload');
      }

      if (!payload.email_verified) {
        throw new UnauthorizedException('Google email not verified');
      }

      return {
        googleId: payload.sub,
        email: payload.email!,
        name: payload.name || payload.email!,
        avatar: payload.picture,
      };
    } catch (error) {
      throw new UnauthorizedException(
        `Google token verification failed: ${error.message || 'Invalid token'}`,
      );
    }
  }

  async changePassword(user: IUser, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    // Lấy thông tin user mới nhất từ DB (bao gồm password hash)
    const userInDb = await this.usersService.findOneByUserEmail(user.email);
    if (!userInDb) throw new BadRequestException('User not found');

    // Guard: tài khoản chưa có mật khẩu (ví dụ: đăng nhập bằng Google lần đầu)
    if (!userInDb.password) {
      throw new BadRequestException(
        'Tài khoản này chưa có mật khẩu. Vui lòng sử dụng chức năng tạo mật khẩu.',
      );
    }

    // Check password cũ
    const isValid = this.usersService.isValidPassword(currentPassword, userInDb.password);
    if (!isValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    // Hash password mới và update
    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(userInDb._id.toString(), newPasswordHash);

    // Thu hồi tất cả sessions để buộc đăng nhập lại trên mọi thiết bị
    await this.sessionsService.deleteAllUserSessions(userInDb._id.toString());

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async setPassword(user: IUser, setPasswordDto: SetPasswordDto) {
    const { newPassword } = setPasswordDto;

    // Lấy thông tin user mới nhất từ DB
    const userInDb = await this.usersService.findOneByUserEmail(user.email);
    if (!userInDb) throw new BadRequestException('User not found');

    // Guard: tài khoản đã có mật khẩu thì phải dùng đổi mật khẩu
    if (userInDb.password) {
      throw new BadRequestException(
        'Tài khoản đã có mật khẩu. Vui lòng sử dụng chức năng đổi mật khẩu.',
      );
    }

    // Hash và lưu mật khẩu mới
    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(userInDb._id.toString(), newPasswordHash);

    // Thu hồi tất cả sessions để buộc đăng nhập lại trên mọi thiết bị
    await this.sessionsService.deleteAllUserSessions(userInDb._id.toString());

    return { message: 'Tạo mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.usersService.findUserByEmail(email);

    // Bảo mật: Luôn trả về success dù email có tồn tại hay không để tránh dò user
    if (!user)
      return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };

    // Tạo token ngẫu nhiên
    const token = uuidv4();

    // Lưu vào Redis: key="reset_pass:email", value=token, TTL=10 phút (600s)
    // Lưu ý: Để an toàn hơn, nên lưu key là token, value là email.
    await this.cacheManager.set(`reset_password:${token}`, email, 600000); // TTL miliseconds

    // Gửi email (Tốt nhất là đẩy vào Queue, ở đây dùng mailerService trực tiếp làm ví dụ)
    const url = `${this.configService.get<string>('FE_URL')}/reset-password?token=${token}&email=${email}`;

    this.mailerService.sendMail({
      to: email,
      subject: 'Reset Password Request',
      template: 'forgot-password',
      context: {
        name: user.name,
        url: url,
        currentYear: new Date().getFullYear(),
      },
    });

    return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
  }

  // Reset Password
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, email, newPassword } = resetPasswordDto;

    // Lấy email từ Redis bằng token
    const emailStored = await this.cacheManager.get(`reset_password:${token}`);

    if (!emailStored || emailStored !== email) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Tìm user và update password
    const user = await this.usersService.findUserByEmail(email);
    if (!user) throw new BadRequestException('User not found');

    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(user._id.toString(), newPasswordHash);

    // Xóa token trong Redis để không dùng lại được
    await this.cacheManager.del(`reset_password:${token}`);

    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
