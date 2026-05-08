import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionsService } from 'src/sessions/sessions.service';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { IJwtRefreshPayload } from '../interfaces/jwt-payload.interface';
import { IUser } from 'src/users/user.interface';
import { assertAuthenticatedAccountState } from '../utils/assert-authenticated-account-state.util';

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
      secretOrKey: configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      passReqToCallback: true,  // Cho phép truy cập request object
      // Không ignore expiration - JWT sẽ tự động check hết hạn
      ignoreExpiration: false,
    });
  }

  async validate(req: Request, payload: IJwtRefreshPayload): Promise<IUser> {
    if (!payload.sub || payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const session = await this.sessionsService.findSessionByToken(refreshToken);

    if (!session) {
      throw new UnauthorizedException(
        'Session không tồn tại hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    if (!session.isActive) {
      throw new UnauthorizedException('Session đã bị thu hồi. Vui lòng đăng nhập lại.');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session đã hết hạn. Vui lòng đăng nhập lại.');
    }

    const sessionUserId = (session.userId as any)?._id?.toString() || session.userId.toString();
    if (sessionUserId !== payload.sub) {
      throw new UnauthorizedException('Token không khớp với session. Token đã bị giả mạo.');
    }

    // Update lastUsedAt để track hoạt động (background task)
    // Không await để không block response
    this.sessionsService.updateLastUsedAt(refreshToken).catch(err => {
      console.error('Failed to update session lastUsedAt:', err);
    });

    const user = await this.userModel
      .findById(payload.sub)
      .populate({
        path: 'role',
        select: '_id name',
      })
      .select('-password -refreshToken') 
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('User không tồn tại. Token không hợp lệ.');
    }

    assertAuthenticatedAccountState(user, 'refresh');

    const userRole = user.role as any;
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      authProvider: user.authProvider,
      hasPassword: !!user.password,
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
