import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUser } from 'src/users/user.interface';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { IJwtAccessPayload } from '../interfaces/jwt-payload.interface';

/**
 * JWT Access Token Strategy
 *
 * Hydrates user from DB on every authenticated request.
 * Populates: role (name only) + company — no permissions (handled by CASL).
 *
 * Flow: Bearer token → verify signature → validate() → attach IUser to req.user
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
    });
  }

  async validate(payload: IJwtAccessPayload): Promise<IUser> {
    if (!payload.sub || payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.userModel
      .findById(payload.sub)
      .populate({
        path: 'role',
        select: '_id name',
      })
      .select('-password')
      .lean()
      .exec();

    if (!user) {
      throw new UnauthorizedException('User not found. Token không hợp lệ.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ admin.');
    }

    if (user.isLocked) {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
    }

    if (user.isDeleted) {
      throw new UnauthorizedException('Tài khoản đã bị xóa. Token không hợp lệ.');
    }

    const userRole = user.role as any;
    if (!userRole || !userRole._id) {
      throw new UnauthorizedException('Role không hợp lệ. Vui lòng liên hệ admin.');
    }

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      authProvider: user.authProvider,
      hasPassword: !!user.password,
      role: {
        _id: userRole._id.toString(),
        name: userRole.name,
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
