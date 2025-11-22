import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUser } from 'src/users/users.interface';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { JwtAccessPayload } from '../interfaces/jwt-payload.interface';

/**
 * JWT Access Token Strategy - Optimized Version
 * 
 * Kiến trúc mới:
 * 1. Payload chỉ chứa userId (sub) và type - cực kỳ nhẹ
 * 2. Strategy query DB để lấy user data mới nhất (hydrate pattern)
 * 3. Tránh stale data (name, email, role thay đổi)
 * 4. Validate user còn active và role hợp lệ
 * 5. Populate đầy đủ permissions từ role
 * 
 * Flow:
 * Client gửi request với Bearer token → Passport verify JWT signature → 
 * validate() được gọi → Query user từ DB → Populate role + permissions →
 * Attach vào req.user → Controller xử lý
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

  /**
   * Validate JWT Payload - Hydrate user từ DB
   * 
   * @param payload - Decoded JWT payload {sub: userId, type: 'access'}
   * @returns IUser object sẽ được attach vào req.user
   * 
   * Lợi ích:
   * - Luôn lấy data mới nhất từ DB (không bị stale)
   * - Validate user còn tồn tại và active
   * - Populate đầy đủ role + permissions + company
   * - Token nhẹ → request nhanh hơn
   */
  async validate(payload: JwtAccessPayload): Promise<IUser> {
    // BƯỚC 1: Validate payload structure
    if (!payload.sub || payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token payload');
    }

    // BƯỚC 2: Query user từ DB với populate đầy đủ
    const user = await this.userModel
      .findById(payload.sub)
      .populate({
        path: 'role',
        select: '_id name permissions',
        populate: {
          path: 'permissions',
          select: '_id name apiPath method module',
        },
      })
      .populate({
        path: 'company',
        select: '_id name logo address',
      })
      .select('-password -refreshToken') 
      .lean()
      .exec();

    // BƯỚC 3: Validate user tồn tại
    if (!user) {
      throw new UnauthorizedException('User not found. Token không hợp lệ.');
    }

    // BƯỚC 4: Validate user còn active
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ admin.',
      );
    }

    // BƯỚC 5: Validate user chưa bị soft delete
    if (user.isDeleted) {
      throw new UnauthorizedException('Tài khoản đã bị xóa. Token không hợp lệ.');
    }

    // BƯỚC 6: Validate role tồn tại (TypeScript type assertion)
    const userRole = user.role as any;
    if (!userRole || !userRole._id) {
      throw new UnauthorizedException('Role không hợp lệ. Vui lòng liên hệ admin.');
    }

    // BƯỚC 7: Format response theo IUser interface
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: {
        _id: userRole._id.toString(),
        name: userRole.name,
      },
      permissions:
        userRole.permissions?.map((perm: any) => ({
          _id: perm._id?.toString() || '',
          name: perm.name || '',
          apiPath: perm.apiPath || '',
          module: perm.module || '',
        })) ?? [],
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
