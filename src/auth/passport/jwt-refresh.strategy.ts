import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SessionsService } from 'src/sessions/sessions.service';

/**
 * JWT Refresh Strategy - Xác thực refresh token từ cookie
 * Strategy này được sử dụng bởi @UseGuards(AuthGuard('jwt-refresh'))
 * 
 * Luồng hoạt động:
 * 1. Đọc refresh token từ cookie 'refresh_token'
 * 2. Verify JWT signature và expiration
 * 3. Tìm session tương ứng trong database
 * 4. Kiểm tra session còn active và chưa hết hạn
 * 5. Attach thông tin user vào request (req.user)
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private sessionsService: SessionsService,
  ) {
    super({
      // Đọc JWT từ cookie thay vì header Authorization
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = request?.cookies?.refresh_token;
          if (!token) {
            throw new UnauthorizedException('Refresh token not found in cookies');
          }
          return token;
        },
      ]),
      // Secret key để verify JWT
      secretOrKey: configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      // Cho phép truy cập request object trong validate method
      passReqToCallback: true,
      // Không ignore expiration - passport-jwt sẽ tự động check
      ignoreExpiration: false,
    });
  }

  /**
   * Validate method - Được gọi sau khi JWT được verify thành công
   * @param req - Express request object
   * @param payload - Decoded JWT payload
   * @returns User object (sẽ được attach vào req.user)
   */
  async validate(req: Request, payload: any) {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }

    // Tìm session tương ứng với refresh token
    const session = await this.sessionsService.findSessionByToken(refreshToken);

    if (!session) {
      throw new UnauthorizedException(
        'Session not found or expired. Please login again.',
      );
    }

    // Kiểm tra session có active không
    if (!session.isActive) {
      throw new UnauthorizedException(
        'Session has been revoked. Please login again.',
      );
    }

    // Kiểm tra session có hết hạn không (double check)
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Session has expired. Please login again.',
      );
    }

    // Cập nhật lastUsedAt để track hoạt động
    await this.sessionsService.updateLastUsedAt(refreshToken);

    // Populate user từ session (đã populate trong findSessionByToken)
    const user = session.userId as any;

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return user object - Passport sẽ attach vào req.user
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      company: user.company,
    };
  }
}