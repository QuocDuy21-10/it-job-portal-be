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
 * KIẾN TRÚC:
 * 1. Payload cực kỳ nhẹ (chỉ chứa userId + type)
 * 2. Strategy hydrate user từ DB để lấy fresh data
 * 3. Populate đầy đủ: role + permissions + company
 * 4. Validate: isActive, isDeleted → chặn user bị khóa
 * 
 * TẠI SAO HYDRATE Ở ĐÂY?
 * - Hầu hết APIs cần user.email (audit log: createdBy, updatedBy)
 * - Một số APIs cần user.role.name, user.company._id (authorization)
 * - Nếu không hydrate → mỗi API phải query DB → N queries thay vì 1 query
 * 
 * API /ME ĐẶC BIỆT:
 * - API /me SẼ QUERY LẠI DB (gọi usersService.findUserProfile)
 * - Lý do: Đảm bảo 100% fresh data khi user F5 trang
 * - Kiểm tra isActive, isDeleted để chặn user bị khóa dù token còn hợp lệ
 * 
 * LUỒNG HOẠT ĐỘNG:
 * Client → Bearer token → Passport verify signature → 
 * validate() → Query user từ DB (1 query tối ưu) →
 * Attach full IUser vào req.user → Controller xử lý
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
   * @param payload - {sub: userId, type: 'access'}
   * @returns IUser - Full user object với role, permissions, company
   * 
   * ⚡ PERFORMANCE:
   * - 1 query duy nhất với nested populate
   * - .lean() để convert sang plain JS object (faster)
   * - Select -password để không trả về sensitive data
   */
  async validate(payload: JwtAccessPayload): Promise<IUser> {
    // BƯỚC 1: Validate payload structure
    if (!payload.sub || payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token payload');
    }

    // BƯỚC 2: Query user với populate tối ưu (1 query duy nhất)
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
      .select('-password') 
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

    // BƯỚC 6: Validate role tồn tại
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
          method: perm.method || '',
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
