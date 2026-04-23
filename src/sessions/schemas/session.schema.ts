import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { User } from 'src/users/schemas/user.schema';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ timestamps: true })
export class Session {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true, index: true })
  userId: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  refreshToken: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ required: true })
  ipAddress: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: Date.now })
  lastUsedAt: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ userId: 1, expiresAt: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ refreshToken: 1 }, { unique: true });
