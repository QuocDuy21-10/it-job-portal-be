import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from './schemas/session.schema';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private configService: ConfigService,
  ) {}

  async createSession(
    userId: string,
    refreshToken: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<SessionDocument> {
    const refreshTokenTTL = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN');
    const expiresAt = new Date(Date.now() + ms(refreshTokenTTL));

    const newSession = await this.sessionModel.create({
      userId,
      refreshToken,
      userAgent,
      ipAddress,
      expiresAt,
      isActive: true,
      lastUsedAt: new Date(),
    });

    return newSession;
  }

  async findSessionByToken(refreshToken: string): Promise<SessionDocument | null> {
    return this.sessionModel
      .findOne({
        refreshToken,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
      .populate('userId', 'name email role company')
      .exec();
  }

  async getActiveSessions(userId: string): Promise<SessionDocument[]> {
    return this.sessionModel
      .find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
      .sort({ lastUsedAt: -1 })
      .exec();
  }

  async deleteSession(refreshToken: string): Promise<boolean> {
    const result = await this.sessionModel.deleteOne({ refreshToken });
    return result.deletedCount > 0;
  }

  async deleteAllUserSessions(userId: string): Promise<number> {
    const result = await this.sessionModel.deleteMany({ userId });
    return result.deletedCount;
  }

  async deactivateSession(refreshToken: string): Promise<boolean> {
    const result = await this.sessionModel.updateOne(
      { refreshToken },
      { $set: { isActive: false } },
    );
    return result.modifiedCount > 0;
  }

  async deactivateAllUserSessions(userId: string): Promise<number> {
    const result = await this.sessionModel.updateMany({ userId }, { $set: { isActive: false } });
    return result.modifiedCount;
  }

  async updateLastUsedAt(refreshToken: string): Promise<void> {
    await this.sessionModel.updateOne({ refreshToken }, { $set: { lastUsedAt: new Date() } });
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount;
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.sessionModel.countDocuments({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
  }

  async enforceSessionLimit(userId: string, maxSessions: number = 5): Promise<void> {
    const sessions = await this.sessionModel
      .find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
      .sort({ lastUsedAt: 1 })
      .exec();

    if (sessions.length > maxSessions) {
      const sessionsToDelete = sessions.slice(0, sessions.length - maxSessions);
      const tokensToDelete = sessionsToDelete.map(s => s.refreshToken);
      await this.sessionModel.deleteMany({ refreshToken: { $in: tokensToDelete } });
    }
  }
}
