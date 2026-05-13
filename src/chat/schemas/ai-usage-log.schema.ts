import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiUsageLogDocument = AiUsageLog & Document;

@Schema({
  timestamps: true,
  collection: 'ai_usage_logs',
})
export class AiUsageLog {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    index: true,
  })
  conversationId?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ChatSession',
    index: true,
  })
  sessionId?: Types.ObjectId;

  @Prop({ required: true, type: String, index: true })
  operationType: string;

  @Prop({ type: String })
  provider?: string;

  @Prop({ type: String })
  model?: string;

  @Prop({ type: Number })
  promptTokens?: number;

  @Prop({ type: Number })
  completionTokens?: number;

  @Prop({ type: Number })
  totalTokens?: number;

  @Prop({ type: Number })
  estimatedPromptTokens?: number;

  @Prop({ type: Number })
  latencyMs?: number;

  @Prop({ required: true, type: Boolean, index: true })
  success: boolean;

  @Prop({ type: Boolean, default: false })
  fallbackUsed?: boolean;

  @Prop({ type: [String], default: [] })
  guardrailFlags: string[];

  @Prop({ type: String, index: true })
  errorCategory?: string;
}

export const AiUsageLogSchema = SchemaFactory.createForClass(AiUsageLog);

AiUsageLogSchema.index({ createdAt: -1 });
AiUsageLogSchema.index({ userId: 1, createdAt: -1 });
AiUsageLogSchema.index({ sessionId: 1, createdAt: -1 });
AiUsageLogSchema.index({ provider: 1, success: 1, createdAt: -1 });
