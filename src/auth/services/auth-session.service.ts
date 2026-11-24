import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import ms from 'ms';
import { randomUUID } from 'crypto';
import { SessionsService } from 'src/sessions/sessions.service';
import { IUser } from 'src/users/user.interface';
import {
  IJwtAccessPayload,
  IJwtRefreshPayload,
  JWT_ALGORITHM,
} from '../interfaces/jwt-payload.interface';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
  ) {}

  async login(user: IUser, response: Response, ipAddress: string, userAgent: string) {
    const refreshPayload: IJwtRefreshPayload = {
      sub: user._id,
      type: 'refresh',
    };

    const refresh_token = this.createRefreshToken(refreshPayload);
    const session = await this.sessionsService.createSession(
      user._id,
      refresh_token,
      userAgent,
      ipAddress,
    );
    await this.sessionsService.enforceSessionLimit(user._id, 5);

    const access_token = this.createAccessToken({
      sub: user._id,
      type: 'access',
      sid: session._id.toString(),
    });

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
      algorithm: JWT_ALGORITHM,
      expiresIn: ms(this.configService.get<string>('JWT_ACCESS_EXPIRES_IN')) / 1000,
    });
  }

  createRefreshToken(payload: IJwtRefreshPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      algorithm: JWT_ALGORITHM,
      expiresIn: ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) / 1000,
      // Unique per token: two logins in the same second would otherwise hit the refreshTokenHash unique index.
      jwtid: randomUUID(),
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
      const refreshPayload: IJwtRefreshPayload = {
        sub: user._id,
        type: 'refresh',
      };
      const newRefreshToken = this.createRefreshToken(refreshPayload);

      const session = await this.sessionsService.rotateSession(
        oldRefreshToken,
        newRefreshToken,
        userAgent,
        ipAddress,
      );
      if (!session) {
        throw new BadRequestException('Không tìm thấy phiên đăng nhập hoặc phiên đã được sử dụng');
      }

      const newAccessToken = this.createAccessToken({
        sub: user._id,
        type: 'access',
        sid: session._id.toString(),
      });

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

  async logout(response: Response, refreshToken: string | undefined, user?: IUser) {
    if (refreshToken) {
      await this.sessionsService.deleteSession(refreshToken);
    }
    // The access token's own session ends even when the refresh cookie is missing or stale.
    if (user?.sessionId) {
      await this.sessionsService.deleteSessionById(user.sessionId, user._id);
    }
    this.clearRefreshCookie(response);

    return { message: 'Đăng xuất thành công' };
  }

  async logoutAllDevices(response: Response, userId: string) {
    const deletedCount = await this.sessionsService.deleteAllUserSessions(userId);
    this.clearRefreshCookie(response);

    return {
      message: 'Đã đăng xuất khỏi tất cả thiết bị',
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
