import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import { IUser } from 'src/users/users.interface';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { RolesService } from 'src/roles/roles.service';
import { AuthRegisterDto } from './dto/auth-register.dto';
import { OAuth2Client } from 'google-auth-library';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MailerService } from '@nestjs-modules/mailer';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { v4 as uuidv4 } from 'uuid';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { SessionsService } from 'src/sessions/sessions.service';
import { JwtAccessPayload, JwtRefreshPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private rolesService: RolesService,
    private sessionsService: SessionsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
      const isValid = this.usersService.isValidPassword(password, user.password);
      if (isValid) {
        if (!user.isActive) {
             throw new BadRequestException("Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.");
        }
        // get user role casting data (ObjectId -> {_id: string, name: string})
        const userRole = user.role as unknown as { _id: string; name: string };
        const tempRole = await this.rolesService.findOne(userRole._id);
        const objectUser = {
          ...user.toObject(),
          permissions: tempRole.permissions ?? [],
        };
        return objectUser;
      }
    }
    return null;
  }

  

  async register(registerUserDto: AuthRegisterDto) {
    // Check email exist
    const isExist = await this.usersService.findByEmail(registerUserDto.email);
    if (isExist) {
      throw new BadRequestException('Email đã tồn tại');
    }

    // Tạo user mới (isActive: false mặc định trong schema)
    const newUser = await this.usersService.register(registerUserDto);

    // Gửi mã xác thực
    const code = await this.sendVerificationCode(newUser);

    return {
      _id: newUser?._id,
      createdAt: newUser?.createdAt,
      message: "Vui lòng kiểm tra email để kích hoạt tài khoản" // Trả về ID để FE điều hướng
    };
  }

  async sendVerificationCode(user: any) {
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // Tạo mã 6 số: 123456
    // Hoặc dùng UUID nếu muốn link: const code = uuidv4();

    // Lưu vào Redis: key="verify_user:_id", value=code, TTL=5 phút
    await this.cacheManager.set(`verify_user:${user._id}`, code, 300 * 1000);

    // Gửi mail (Nên đẩy vào Queue như bạn đã làm với Job)
    this.mailerService.sendMail({
      to: user.email,
      subject: 'Activate your account at IT Job Portal',
      template: 'verify-email', // Tạo file template mới
      context: {
        name: user.name,
        code: code,
      },
    });
    return code;
  }

  async verifyEmail(dto: VerifyAuthDto) {
    const { _id, code } = dto;
    
    // Lấy code từ Redis
    const codeStored = await this.cacheManager.get(`verify_user:${_id}`);

    if (!codeStored) {
      throw new BadRequestException('Mã xác thực đã hết hạn hoặc không tồn tại');
    }

    if (codeStored.toString() !== code) {
      throw new BadRequestException('Mã xác thực không chính xác');
    }

    // Update User status
    await this.usersService.updateUserStatus(_id, true); // Cần viết hàm này bên UsersService

    // Xóa Redis key
    await this.cacheManager.del(`verify_user:${_id}`);

    return { message: "Kích hoạt tài khoản thành công. Bạn có thể đăng nhập ngay bây giờ." };
  }

  // 4. Gửi lại mã (Resend)
  async resendCode(id: string) {
    const user = await this.usersService.findOne(id);
    if (!user) throw new BadRequestException("User not found");
    if (user.isActive) throw new BadRequestException("Tài khoản đã được kích hoạt rồi");

    await this.sendVerificationCode(user);
    return { message: "Đã gửi lại mã xác thực mới" };
  }

  /**
   * Login - Tạo access token và refresh token, lưu session vào DB
   * @param user - User object từ validateUser
   * @param response - Express response để set cookie
   * @param ipAddress - IP address của client
   * @param userAgent - User agent của client
   */
  async login(user: IUser, response: Response, ipAddress: string, userAgent: string) {
    const { _id } = user;

    // Tạo payload tối ưu (chỉ chứa userId)
    const accessPayload: JwtAccessPayload = {
      sub: _id,
      type: 'access',
    };

    const refreshPayload: JwtRefreshPayload = {
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

    // Trả về access token + user info (user đã được hydrate đầy đủ từ validateUser)
    return {
      access_token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        company: user.company,
      },
    };
  }

  /**
   * Create Access Token - Token ngắn hạn (15 phút - 1 giờ)
   * Payload tối ưu: chỉ chứa userId (sub) và type
   */
  createAccessToken(payload: JwtAccessPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_ACCESS_EXPIRES_IN')) / 1000,
    });
  }

  /**
   * Create Refresh Token - Token dài hạn (7-30 ngày)
   * Payload tối ưu: chỉ chứa userId (sub) và type
   */
  createRefreshToken(payload: JwtRefreshPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) / 1000,
    });
  }

  /**
   * Refresh Access Token - Token Rotation Pattern
   * Luồng: Xóa session cũ -> Tạo session mới -> Trả về access token + refresh token mới
   * 
   * @param oldRefreshToken - Refresh token hiện tại từ cookie
   * @param response - Express response để set cookie mới
   * @param user - User object từ JwtRefreshStrategy (đã được hydrate)
   * @param userAgent - User agent của client
   * @param ipAddress - IP address của client
   */
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
      // Lấy thêm permissions từ role (nếu cần)
      const userRole = user.role as { _id: string; name: string };
      const tempRole = await this.rolesService.findOne(userRole._id);

      // BƯỚC 3: Tạo payload mới (tối ưu - chỉ chứa userId)
      const accessPayload: JwtAccessPayload = {
        sub: user._id,
        type: 'access',
      };

      const refreshPayload: JwtRefreshPayload = {
        sub: user._id,
        type: 'refresh',
      };

      // BƯỚC 4: Tạo tokens MỚI
      const newAccessToken = this.createAccessToken(accessPayload);
      const newRefreshToken = this.createRefreshToken(refreshPayload);

      // BƯỚC 5: Tạo session MỚI trong DB
      await this.sessionsService.createSession(
        user._id,
        newRefreshToken,
        userAgent,
        ipAddress,
      );

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
          permissions: tempRole?.permissions ?? user.permissions ?? [],
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

  /**
   * Logout - Xóa session hiện tại (single device logout)
   * @param response - Express response để xóa cookie
   * @param refreshToken - Refresh token từ cookie
   */
  async logout(response: Response, refreshToken: string) {
    // Xóa session tương ứng với refresh token hiện tại
    await this.sessionsService.deleteSession(refreshToken);

    // Xóa refresh token trong cookies
    response.clearCookie('refresh_token');

    return { message: 'Logout successfully' };
  }

  /**
   * Logout All Devices - Xóa tất cả sessions của user
   * @param response - Express response để xóa cookie
   * @param userId - ID của user
   */
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
    
    // Format response để ẩn refresh token (bảo mật)
    return sessions.map((session) => ({
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
      let user = await this.usersService.findByGoogleId(googleUser.googleId);

      if (!user) {
        // Check if email already exists (user registered with email/password)
        const existingUser = await this.usersService.findByEmail(googleUser.email);

        if (existingUser) {
          // Link Google account to existing users
          await this.usersService.linkGoogleAccount(
            existingUser._id.toString(),
            googleUser.googleId,
          );
          user = await this.usersService.findByGoogleId(googleUser.googleId);
        } else {
          // Create new user with Google profile
          user = await this.usersService.createGoogleUser(googleUser);
        }
      }

      // Step 3: Get user role and permissions
      const userRole = user.role as unknown as { _id: string; name: string };
      const tempRole = await this.rolesService.findOne(userRole._id);

      const userObject: IUser = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: userRole,
        permissions: tempRole?.permissions?.map((perm: any) => ({
          _id: perm._id?.toString() || '',
          name: perm.name || '',
          apiPath: perm.apiPath || '',
          module: perm.module || '',
        })) ?? [],
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

  // Change Password
  async changePassword(user: IUser, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;
    
    // Lấy thông tin user mới nhất từ DB (bao gồm password hash)
    const userInDb = await this.usersService.findOneByUserEmail(user.email);
    if (!userInDb) throw new BadRequestException('User not found');

    // Check password cũ
    const isValid = this.usersService.isValidPassword(currentPassword, userInDb.password);
    if (!isValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    // Hash password mới và update
    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(userInDb._id.toString(), newPasswordHash);

    return { message: 'Đổi mật khẩu thành công' };
  }

  // Forgot Password
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.usersService.findByEmail(email);
    
    // Bảo mật: Luôn trả về success dù email có tồn tại hay không để tránh dò user
    if (!user) return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };

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
      template: 'forgot-password', // Tên file template .hbs
      context: {
        name: user.name,
        url: url,
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
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');

    const newPasswordHash = this.hashPassword(newPassword);
    await this.usersService.updatePassword(user._id.toString(), newPasswordHash);

    // Xóa token trong Redis để không dùng lại được
    await this.cacheManager.del(`reset_password:${token}`);

    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
