import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EChatSessionType } from '../enums/chat-session-type.enum';

export type ChatSessionDocument = ChatSession & Document;

@Schema({
  timestamps: true,
  collection: 'chat_sessions',
})
export class ChatSession {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true, type: String, default: 'UNKNOWN', index: true })
  userRole: string;

  @Prop({
    type: String,
    enum: EChatSessionType,
    default: EChatSessionType.GENERAL,
    index: true,
  })
  type: EChatSessionType;

  @Prop({ type: String })
  title?: string;

  @Prop({ type: String })
  summary?: string;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({ type: Date, default: () => new Date(), index: true })
  lastMessageAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', index: true })
  legacyConversationId?: Types.ObjectId;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

ChatSessionSchema.index({ userId: 1, isActive: 1, lastMessageAt: -1 });
ChatSessionSchema.index({ legacyConversationId: 1 }, { sparse: true });
