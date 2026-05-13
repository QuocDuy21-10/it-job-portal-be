import { ApiProperty } from '@nestjs/swagger';
import { EChatSessionType } from '../enums/chat-session-type.enum';

export class ChatSessionDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: '507f1f77bcf86cd799439011',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Backward-compatible conversation ID alias',
    example: '507f1f77bcf86cd799439011',
  })
  conversationId: string;

  @ApiProperty({
    description: 'Session type',
    enum: EChatSessionType,
  })
  type: EChatSessionType;

  @ApiProperty({
    description: 'Session title',
    required: false,
  })
  title?: string;

  @ApiProperty({
    description: 'Whether this session is active',
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Last message timestamp',
    required: false,
  })
  lastMessageAt?: Date;

  @ApiProperty({
    description: 'Created timestamp',
    required: false,
  })
  createdAt?: Date;
}

export class ChatSessionListResponseDto {
  @ApiProperty({
    description: 'Chat sessions owned by the current user',
    type: [ChatSessionDto],
  })
  sessions: ChatSessionDto[];
}
