import { ApiProperty } from '@nestjs/swagger';
import { ChatRecommendedJobDto } from './chat-recommended-job.dto';
import { EChatIntent } from '../enums/chat-intent.enum';

export class ChatResponseDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: '507f1f77bcf86cd799439011',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Backward-compatible conversation ID alias. This is the chat session ID.',
    example: '507f1f77bcf86cd799439011',
  })
  conversationId: string;

  @ApiProperty({
    description: 'AI assistant response',
    example: 'Based on your current skills, I recommend learning...',
  })
  response: string;

  @ApiProperty({
    description: 'Response timestamp',
    example: '2024-12-01T10:30:00.000Z',
  })
  timestamp: Date;

  @ApiProperty({
    description: 'Detected per-message chat intent',
    enum: EChatIntent,
    required: false,
  })
  intent?: EChatIntent;

  @ApiProperty({
    description: 'Suggested follow-up actions (optional)',
    example: ['View recommended jobs', 'Update CV with new skills'],
    required: false,
  })
  suggestedActions?: string[];

  @ApiProperty({
    description:
      'Validated recommended job IDs persisted with the assistant message so the frontend can rehydrate cards after refresh',
    required: false,
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  recommendedJobIds?: string[];

  @ApiProperty({
    description:
      'Recommended jobs array (Structured Output) - Frontend can render as clickable cards',
    required: false,
    type: [ChatRecommendedJobDto],
    example: [
      {
        _id: '507f1f77bcf86cd799439011',
        name: 'Senior NodeJS Developer',
        company: { _id: '507f1f77bcf86cd799439012', name: 'Tech Corp' },
        location: 'Ho Chi Minh City',
        skills: ['NodeJS', 'NestJS', 'MongoDB'],
        level: 'SENIOR',
      },
    ],
  })
  recommendedJobs?: ChatRecommendedJobDto[];
}
