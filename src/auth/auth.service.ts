import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private rolesService: RolesService,
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
    const { _id, name, email, role, permissions, company } = user;
    const payload = {
      sub: 'token login',
      iss: 'from server',
      _id,
      name,
      email,
      role,
      company,
    };
    const refresh_token = this.createRefreshToken(payload);

    // update user with refresh token
    this.usersService.updateUserToken(_id, refresh_token);

    // set refresh token as cookies
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')),
    });
    return {
      access_token: this.jwtService.sign(payload),
      user: { _id, name, email, role, permissions, company },
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
        const { _id, name, email, role, company } = user;
        const payload = { sub: 'token refresh', iss: 'from server', _id, name, email, role, company };

        const refresh_token = this.createRefreshToken(payload);

        // update user with refresh token
        this.usersService.updateUserToken(_id.toString(), refresh_token);

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
          user: { _id, name, email, role, permissions: tempRole.permissions, company },
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
          // Link Google account to existing user
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
      };

      // Step 4: Generate JWT tokens
      return await this.login(userObject, response);
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
}
