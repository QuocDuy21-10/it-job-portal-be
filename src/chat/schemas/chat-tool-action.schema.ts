import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EChatToolActionStatus, EChatToolActionType } from '../enums/chat-tool-action.enum';

export type ChatToolActionDocument = ChatToolAction & Document;

@Schema({
  timestamps: true,
  collection: 'chat_tool_actions',
})
export class ChatToolAction {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ChatSession',
    required: true,
    index: true,
  })
  sessionId: Types.ObjectId;

  @Prop({
    type: String,
    enum: EChatToolActionType,
    required: true,
    index: true,
  })
  type: EChatToolActionType;

  @Prop({
    type: String,
    enum: EChatToolActionStatus,
    default: EChatToolActionStatus.PENDING,
    index: true,
  })
  status: EChatToolActionStatus;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: String, required: true })
  label: string;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  @Prop({ type: Date })
  confirmedAt?: Date;

  @Prop({ type: Date })
  canceledAt?: Date;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ChatToolActionSchema = SchemaFactory.createForClass(ChatToolAction);

ChatToolActionSchema.index({ userId: 1, status: 1, expiresAt: 1 });
ChatToolActionSchema.index({ sessionId: 1, status: 1, createdAt: -1 });
