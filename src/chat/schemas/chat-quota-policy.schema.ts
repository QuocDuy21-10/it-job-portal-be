import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatQuotaPolicyDocument = ChatQuotaPolicy & Document;

@Schema({
  timestamps: true,
  collection: 'chat_quota_policies',
})
export class ChatQuotaPolicy {
  @Prop({ required: true, type: String, index: true })
  roleName: string;

  @Prop({ type: Number, default: null })
  dailyLimit: number | null;

  @Prop({ required: true, type: String, default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;
}

export const ChatQuotaPolicySchema = SchemaFactory.createForClass(ChatQuotaPolicy);

ChatQuotaPolicySchema.index({ roleName: 1, isActive: 1 });
