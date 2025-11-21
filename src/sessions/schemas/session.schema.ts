import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { User } from 'src/users/schemas/user.schema';

export type SessionDocument = HydratedDocument<Session>;

/**
 * Session Schema - Quản lý refresh tokens cho multi-device authentication
 * Mỗi session đại diện cho một thiết bị đăng nhập của user
 */
@Schema({ timestamps: true })
export class Session {
  /**
   * User ID - Reference đến User collection
   * Một user có thể có nhiều sessions (multi-device)
   */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true, index: true })
  userId: mongoose.Schema.Types.ObjectId;

  /**
   * Refresh Token - JWT token để refresh access token
   * Mỗi token là unique và chỉ sử dụng 1 lần (rotation pattern)
   */
  @Prop({ required: true, unique: true, index: true })
  refreshToken: string;

  /**
   * User Agent - Thông tin thiết bị/browser
   * VD: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
   */
  @Prop({ required: true })
  userAgent: string;

  /**
   * IP Address - Địa chỉ IP của thiết bị
   * Dùng để track và phát hiện hoạt động bất thường
   */
  @Prop({ required: true })
  ipAddress: string;

  /**
   * Expires At - Thời điểm session hết hạn
   * Session sẽ tự động bị xóa sau thời gian này (TTL index)
   */
  @Prop({ required: true, index: true })
  expiresAt: Date;

  /**
   * Is Active - Trạng thái session
   * false = đã logout hoặc bị revoke
   */
  @Prop({ default: true })
  isActive: boolean;

  /**
   * Last Used At - Lần cuối session được sử dụng
   * Update mỗi khi refresh token
   */
  @Prop({ type: Date, default: Date.now })
  lastUsedAt: Date;

  // Timestamps tự động thêm bởi Mongoose
  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// ============ INDEXES ============

/**
 * Compound Index: userId + isActive
 * Tối ưu query: "Lấy tất cả sessions đang active của user X"
 */
SessionSchema.index({ userId: 1, isActive: 1 });

/**
 * Compound Index: userId + expiresAt
 * Tối ưu query: "Lấy các sessions chưa hết hạn của user X"
 */
SessionSchema.index({ userId: 1, expiresAt: 1 });

/**
 * TTL Index: Tự động xóa documents đã hết hạn
 * MongoDB sẽ tự động xóa session sau khi expiresAt đã qua
 * expireAfterSeconds: 0 = xóa ngay khi expiresAt đến
 */
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Unique Index: refreshToken
 * Đảm bảo mỗi refresh token chỉ tồn tại 1 lần
 * (Đã được khai báo trong @Prop nhưng khai báo lại để rõ ràng)
 */
SessionSchema.index({ refreshToken: 1 }, { unique: true });
