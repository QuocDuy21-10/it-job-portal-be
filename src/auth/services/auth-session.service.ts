import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import ms from 'ms';
import { SessionsService } from 'src/sessions/sessions.service';
import { IUser } from 'src/users/user.interface';
import { IJwtAccessPayload, IJwtRefreshPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
  ) {}

  async login(user: IUser, response: Response, ipAddress: string, userAgent: string) {
    const accessPayload: IJwtAccessPayload = {
      sub: user._id,
      type: 'access',
    };
    const refreshPayload: IJwtRefreshPayload = {
      sub: user._id,
      type: 'refresh',
    };

    const access_token = this.createAccessToken(accessPayload);
    const refresh_token = this.createRefreshToken(refreshPayload);

    await this.sessionsService.createSession(user._id, refresh_token, userAgent, ipAddress);
    await this.sessionsService.enforceSessionLimit(user._id, 5);

    this.setRefreshCookie(response, refresh_token);

    return {
      access_token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company,
      },
    };
  }

  createAccessToken(payload: IJwtAccessPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_ACCESS_EXPIRES_IN')) / 1000,
    });
  }

  createRefreshToken(payload: IJwtRefreshPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) / 1000,
    });
  }

  async refreshAccessToken(
    oldRefreshToken: string,
    response: Response,
    user: IUser,
    userAgent: string,
    ipAddress: string,
  ) {
    try {
      const deleted = await this.sessionsService.deleteSession(oldRefreshToken);
      if (!deleted) {
        throw new BadRequestException('Session not found or already used');
      }

      const accessPayload: IJwtAccessPayload = {
        sub: user._id,
        type: 'access',
      };
      const refreshPayload: IJwtRefreshPayload = {
        sub: user._id,
        type: 'refresh',
      };

      const newAccessToken = this.createAccessToken(accessPayload);
      const newRefreshToken = this.createRefreshToken(refreshPayload);

      await this.sessionsService.createSession(user._id, newRefreshToken, userAgent, ipAddress);

      this.clearRefreshCookie(response);
      this.setRefreshCookie(response, newRefreshToken);

      return {
        access_token: newAccessToken,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          company: user.company,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.clearRefreshCookie(response);
      throw new BadRequestException(
        `Refresh token không hợp lệ. Vui lòng đăng nhập lại. Error: ${message}`,
      );
    }
  }

  async logout(response: Response, refreshToken: string) {
    await this.sessionsService.deleteSession(refreshToken);
    this.clearRefreshCookie(response);

    return { message: 'Logout successfully' };
  }

  async logoutAllDevices(response: Response, userId: string) {
    const deletedCount = await this.sessionsService.deleteAllUserSessions(userId);
    this.clearRefreshCookie(response);

    return {
      message: 'Logged out from all devices successfully',
      devicesLoggedOut: deletedCount,
    };
  }

  async getActiveSessions(userId: string) {
    const sessions = await this.sessionsService.getActiveSessions(userId);

    return sessions.map(session => ({
      _id: session._id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')),
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie('refresh_token');
  }
}
