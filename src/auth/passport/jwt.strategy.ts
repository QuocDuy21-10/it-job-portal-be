import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IUser } from 'src/users/users.interface';
import { RolesService } from 'src/roles/roles.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private rolesService: RolesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
    });
  }

  // decode payload
  async validate(payload: IUser) {
    const { _id, name, email, role, company } = payload;
    // assign permission to req.user
    const userRole = role as unknown as { _id: string; name: string };
    const roleData = await this.rolesService.findOne(userRole._id);
    
    // Kiểm tra nghiêm ngặt: không cho phép user với role không tồn tại
    if (!roleData) {
      throw new UnauthorizedException(
        `Role với ID ${userRole._id} không tồn tại. Token không hợp lệ.`,
      );
    }

    const temp = roleData.toObject();

    //req.user
    return {
      _id,
      name,
      email,
      role,
      permissions: temp?.permissions ?? [],
      company, // Thêm company info để sử dụng cho authorization
    };
  }
}
