import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session, SessionDocument } from './schemas/session.schema';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';

/**
 * Sessions Service - Quản lý refresh token sessions cho multi-device authentication
 */
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private configService: ConfigService,
  ) {}

  /**
   * Tạo session mới khi user login
   * @param userId - ID của user
   * @param refreshToken - JWT refresh token
   * @param userAgent - Thông tin thiết bị/browser
   * @param ipAddress - Địa chỉ IP
   * @returns Session document đã tạo
   */
  async createSession(
    userId: string,
    refreshToken: string,
    userAgent: string,
    ipAddress: string,
  ): Promise<SessionDocument> {
    // Tính thời gian hết hạn từ config (VD: 7 days)
    const refreshTokenTTL = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN');
    const expiresAt = new Date(Date.now() + ms(refreshTokenTTL));

    // Tạo session mới
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

  /**
   * Tìm session theo refresh token
   * @param refreshToken - Refresh token cần tìm
   * @returns Session document hoặc null
   */
  async findSessionByToken(refreshToken: string): Promise<SessionDocument | null> {
    return this.sessionModel
      .findOne({
        refreshToken,
        isActive: true,
        expiresAt: { $gt: new Date() }, // Chỉ lấy session chưa hết hạn
      })
      .populate('userId', 'name email role company') // Populate thông tin user
      .exec();
  }

  /**
   * Lấy tất cả sessions đang active của một user
   * @param userId - ID của user
   * @returns Danh sách sessions
   */
  async getActiveSessions(userId: string): Promise<SessionDocument[]> {
    return this.sessionModel
      .find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
      .sort({ lastUsedAt: -1 }) // Sắp xếp theo thời gian sử dụng gần nhất
      .exec();
  }

  /**
   * Xóa một session cụ thể (Logout single device)
   * @param refreshToken - Refresh token của session cần xóa
   * @returns Boolean - Thành công hay không
   */
  async deleteSession(refreshToken: string): Promise<boolean> {
    const result = await this.sessionModel.deleteOne({ refreshToken });
    return result.deletedCount > 0;
  }

  /**
   * Xóa tất cả sessions của một user (Logout all devices)
   * @param userId - ID của user
   * @returns Số lượng sessions đã xóa
   */
  async deleteAllUserSessions(userId: string): Promise<number> {
    const result = await this.sessionModel.deleteMany({ userId });
    return result.deletedCount;
  }

  /**
   * Đánh dấu session là inactive (Soft delete)
   * @param refreshToken - Refresh token của session
   * @returns Boolean - Thành công hay không
   */
  async deactivateSession(refreshToken: string): Promise<boolean> {
    const result = await this.sessionModel.updateOne(
      { refreshToken },
      { $set: { isActive: false } },
    );
    return result.modifiedCount > 0;
  }

  /**
   * Đánh dấu tất cả sessions của user là inactive (Soft delete all)
   * @param userId - ID của user
   * @returns Số lượng sessions đã deactivate
   */
  async deactivateAllUserSessions(userId: string): Promise<number> {
    const result = await this.sessionModel.updateMany(
      { userId },
      { $set: { isActive: false } },
    );
    return result.modifiedCount;
  }

  /**
   * Cập nhật thời gian sử dụng cuối cùng của session
   * @param refreshToken - Refresh token của session
   */
  async updateLastUsedAt(refreshToken: string): Promise<void> {
    await this.sessionModel.updateOne(
      { refreshToken },
      { $set: { lastUsedAt: new Date() } },
    );
  }

  /**
   * Xóa các sessions đã hết hạn (Cleanup job - nên chạy định kỳ)
   * MongoDB TTL index sẽ tự động xóa, nhưng có thể dùng method này để force cleanup
   * @returns Số lượng sessions đã xóa
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount;
  }

  /**
   * Đếm số lượng sessions active của một user
   * @param userId - ID của user
   * @returns Số lượng sessions
   */
  async countActiveSessions(userId: string): Promise<number> {
    return this.sessionModel.countDocuments({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
  }

  /**
   * Giới hạn số lượng sessions tối đa cho một user (Optional - Security feature)
   * Nếu vượt quá limit, xóa session cũ nhất
   * @param userId - ID của user
   * @param maxSessions - Số sessions tối đa cho phép (mặc định 5)
   */
  async enforceSessionLimit(userId: string, maxSessions: number = 5): Promise<void> {
    const sessions = await this.sessionModel
      .find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
      .sort({ lastUsedAt: 1 }) // Sắp xếp theo thời gian sử dụng (cũ nhất trước)
      .exec();

    // Nếu vượt quá limit, xóa các session cũ nhất
    if (sessions.length > maxSessions) {
      const sessionsToDelete = sessions.slice(0, sessions.length - maxSessions);
      const tokensToDelete = sessionsToDelete.map((s) => s.refreshToken);
      await this.sessionModel.deleteMany({ refreshToken: { $in: tokensToDelete } });
    }
  }
}
