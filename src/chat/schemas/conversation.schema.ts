import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ _id: false, timestamps: false })
export class Message {
  @Prop({ 
    required: true, 
    enum: ['user', 'assistant'],
    type: String 
  })
  role: string;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ type: Date, default: () => new Date() })
  timestamp: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

@Schema({ 
  timestamps: true,
  collection: 'conversations'
})
export class Conversation {
  @Prop({ 
    type: Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  })
  userId: Types.ObjectId;

  @Prop({ type: [MessageSchema], default: [] })
  messages: Message[];

  @Prop({ default: true, type: Boolean })
  isActive: boolean;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Add compound index for efficient queries
ConversationSchema.index({ userId: 1, isActive: 1 });
