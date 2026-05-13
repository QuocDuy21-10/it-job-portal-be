import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EChatMessageRole } from '../enums/chat-message-role.enum';
import { IChatMessageMetadata } from '../interfaces/chat-message-metadata.interface';

export type ChatMessageDocument = ChatMessage & Document;

@Schema({
  timestamps: true,
  collection: 'chat_messages',
})
export class ChatMessage {
  @Prop({
    type: Types.ObjectId,
    ref: 'ChatSession',
    required: true,
    index: true,
  })
  sessionId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: EChatMessageRole,
    required: true,
  })
  role: EChatMessageRole;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ required: true, type: Number })
  sequence: number;

  @Prop({ type: [String], default: undefined })
  relatedJobIds?: string[];

  @Prop({ type: Object, default: undefined })
  metadata?: IChatMessageMetadata;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

ChatMessageSchema.index({ sessionId: 1, sequence: 1 });
ChatMessageSchema.index({ userId: 1, createdAt: -1 });
