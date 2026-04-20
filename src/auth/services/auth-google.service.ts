import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { Response } from 'express';
import { AuthSessionService } from './auth-session.service';
import { EAuthProvider } from '../enums/auth-provider.enum';
import { IUser } from 'src/users/user.interface';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AuthGoogleService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!googleClientId) {
      console.warn('GOOGLE_CLIENT_ID not configured in environment variables');
    }

    this.googleClient = new OAuth2Client(googleClientId);
  }

  async googleLogin(idToken: string, response: Response) {
    try {
      const googleUser = await this.verifyGoogleToken(idToken);

      let user = await this.usersService.findUserByGoogleId(googleUser.googleId);
      if (!user) {
        const existingUser = await this.usersService.findUserByEmail(googleUser.email);

        if (existingUser && existingUser.isActive) {
          await this.usersService.linkGoogleAccount(
            existingUser._id.toString(),
            googleUser.googleId,
          );
          user = await this.usersService.findUserByGoogleId(googleUser.googleId);
        } else {
          if (existingUser && !existingUser.isActive) {
            await this.usersService.remove(existingUser._id.toString(), {
              _id: existingUser._id.toString(),
              email: existingUser.email,
            } as IUser);
          }

          user = await this.usersService.createGoogleUser(googleUser);
        }
      }

      if (user.isLocked) {
        throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ admin.');
      }

      const userRole = user.role as unknown as { _id: string; name: string };

      const userObject: IUser = {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        authProvider: user.authProvider || EAuthProvider.GOOGLE,
        hasPassword: !!user.password,
        role: userRole,
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

      return this.authSessionService.login(userObject, response, 'unknown', 'google-login');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';

      throw new BadRequestException(`Google authentication failed: ${message}`);
    }
  }

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
      const message = error instanceof Error ? error.message : 'Invalid token';
      throw new UnauthorizedException(`Google token verification failed: ${message}`);
    }
  }
}
