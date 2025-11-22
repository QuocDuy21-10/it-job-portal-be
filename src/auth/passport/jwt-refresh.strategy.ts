import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionsService } from 'src/sessions/sessions.service';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { JwtRefreshPayload } from '../interfaces/jwt-payload.interface';
import { IUser } from 'src/users/users.interface';

/**
 * JWT Refresh Strategy - Optimized Version
 * 
 * Kiến trúc mới:
 * 1. Payload chỉ chứa userId (sub) và type='refresh'
 * 2. Validate token trong session database (multi-device support)
 * 3. Hydrate user mới nhất từ DB (tránh stale data)
 * 4. Track lastUsedAt cho session monitoring
 * 5. Hỗ trợ Token Rotation Pattern (refresh token chỉ dùng 1 lần)
 * 
 * Flow:
 * Client gửi request với refresh_token cookie → Passport verify JWT →
 * validate() được gọi → Kiểm tra session trong DB → Query user →
 * Populate role → Attach vào req.user → AuthService rotate token
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private sessionsService: SessionsService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      // Đọc JWT từ cookie (HttpOnly - bảo mật cao)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.refresh_token;
          if (!token) {
            throw new UnauthorizedException('Refresh token not found in cookies');
          }
          return token;
        },
      ]),
      // Secret key để verify JWT signature
      secretOrKey: configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      // Cho phép truy cập request object
      passReqToCallback: true,
      // Không ignore expiration - JWT sẽ tự động check hết hạn
      ignoreExpiration: false,
    });
  }

  /**
   * Validate Refresh Token - Hydrate user từ DB
   * 
   * @param req - Express request (để lấy refresh token từ cookie)
   * @param payload - Decoded JWT payload {sub: userId, type: 'refresh'}
   * @returns Simplified user object (sẽ được sử dụng trong AuthService.refresh)
   * 
   * Note: Không cần trả về đầy đủ permissions ở đây vì AuthService.refresh
   * sẽ tạo access token mới với payload minimal rồi client dùng access token
   * để gọi API (JwtStrategy sẽ hydrate đầy đủ)
   */
  async validate(req: Request, payload: JwtRefreshPayload): Promise<IUser> {
    // BƯỚC 1: Validate payload structure
    if (!payload.sub || payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    // BƯỚC 2: Lấy refresh token từ cookie
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // BƯỚC 3: Validate session trong database (multi-device + revocation support)
    const session = await this.sessionsService.findSessionByToken(refreshToken);

    if (!session) {
      throw new UnauthorizedException(
        'Session không tồn tại hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    // BƯỚC 4: Kiểm tra session còn active
    if (!session.isActive) {
      throw new UnauthorizedException(
        'Session đã bị thu hồi. Vui lòng đăng nhập lại.',
      );
    }

    // BƯỚC 5: Kiểm tra session chưa hết hạn (double check)
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session đã hết hạn. Vui lòng đăng nhập lại.');
    }

    // BƯỚC 6: Validate userId trong session khớp với payload
    const sessionUserId = (session.userId as any)?._id?.toString() || session.userId.toString();
    if (sessionUserId !== payload.sub) {
      throw new UnauthorizedException('Token không khớp với session. Token đã bị giả mạo.');
    }

    // BƯỚC 7: Update lastUsedAt để track hoạt động (background task)
    // Không await để không block response
    this.sessionsService.updateLastUsedAt(refreshToken).catch((err) => {
      console.error('Failed to update session lastUsedAt:', err);
    });

    // BƯỚC 8: Query user mới nhất từ DB (tránh stale data)
    const user = await this.userModel
      .findById(payload.sub)
      .populate({
        path: 'role',
        select: '_id name',
      })
      .populate({
        path: 'company',
        select: '_id name logo',
      })
      .select('-password -refreshToken') // Không lấy sensitive data
      .lean()
      .exec();

    // BƯỚC 9: Validate user tồn tại
    if (!user) {
      throw new UnauthorizedException('User không tồn tại. Token không hợp lệ.');
    }

    // BƯỚC 10: Validate user còn active
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Tài khoản đã bị vô hiệu hóa. Không thể refresh token.',
      );
    }

    // BƯỚC 11: Validate user chưa bị soft delete
    if (user.isDeleted) {
      throw new UnauthorizedException('Tài khoản đã bị xóa. Token không hợp lệ.');
    }

    // BƯỚC 12: Format response (không cần permissions, sẽ được lấy khi dùng access token)
    const userRole = user.role as any;
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: {
        _id: userRole?._id?.toString() || '',
        name: userRole?.name || '',
      },
      company: user.company
        ? {
            _id: (user.company as any)._id?.toString() || '',
            name: (user.company as any).name || '',
            logo: (user.company as any).logo,
          }
        : undefined,
      savedJobs: user.savedJobs?.map((id: any) => id.toString()) || [],
      companyFollowed: user.companyFollowed?.map((id: any) => id.toString()) || [],
    };
  }
}