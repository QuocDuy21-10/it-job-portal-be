import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import { IUser } from 'src/users/users.interface';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { RolesService } from 'src/roles/roles.service';
import { AuthRegisterDto } from './dto/auth-register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private rolesService: RolesService,
  ) {}
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

  async register(user: AuthRegisterDto) {
    let newUser = await this.usersService.register(user);
    return {
      _id: newUser?._id,
      createAt: newUser?.createdAt,
    };
  }

  async login(user: IUser, response: Response) {
    const { _id, name, email, role, permissions } = user;
    const payload = { sub: 'token login', iss: 'from server', _id, name, email, role };
    const refresh_token = this.createRefreshToken(payload);

    // update user with refresh token
    this.usersService.updateUserToken(refresh_token, _id);

    // set refresh token as cookies
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')),
    });
    return {
      access_token: this.jwtService.sign(payload),
      user: { _id, name, email, role, permissions },
    };
  }

  createRefreshToken(payload: any) {
    const refresh_token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) / 1000,
    });
    return refresh_token;
  }

  async refreshAccessToken(refreshToken: string, response: Response) {
    try {
      this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      });

      const user = await this.usersService.findUserByRefreshToken(refreshToken);

      if (!user) {
        throw new BadRequestException('Refresh token không hợp lệ. Vui lòng đăng nhập lại');
      } else {
        const { _id, name, email, role } = user;
        const payload = { sub: 'token refresh', iss: 'from server', _id, name, email, role };

        const refresh_token = this.createRefreshToken(payload);

        // update user with refresh token
        this.usersService.updateUserToken(refresh_token, _id.toString());

        // get user role casting data (ObjectId -> {_id: string, name: string})
        const userRole = user.role as unknown as { _id: string; name: string };
        const tempRole = await this.rolesService.findOne(userRole._id);

        // delete old refresh token
        response.clearCookie('refresh_token');

        // set refresh token as cookies
        response.cookie('refresh_token', refresh_token, {
          httpOnly: true,
          maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')),
        });

        return {
          access_token: this.jwtService.sign(payload),
          user: { _id, name, email, role, permissions: tempRole.permissions },
        };
      }
    } catch (error) {
      throw new BadRequestException('Refresh token không hợp lệ. Vui lòng đăng nhập lại');
    }
  }

  async logout(response: Response, user: IUser) {
    // update refresh token
    await this.usersService.updateUserToken(user._id, '');
    // delete refresh token in cookies
    response.clearCookie('refresh_token');
    return 'ok';
  }
}
