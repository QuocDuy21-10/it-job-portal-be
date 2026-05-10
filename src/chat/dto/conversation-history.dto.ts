import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ChatRecommendedJobDto } from './chat-recommended-job.dto';

export class ConversationHistoryQueryDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Messages per page',
    example: 50,
    required: false,
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class MessageDto {
  @ApiProperty({
    description: 'Message role',
    example: 'user',
    enum: ['user', 'assistant'],
  })
  role: string;

  @ApiProperty({
    description: 'Message content',
    example: 'What skills should I learn?',
  })
  content: string;

  @ApiProperty({
    description: 'Message timestamp',
    example: '2024-12-01T10:30:00.000Z',
  })
  timestamp: Date;

  @ApiProperty({
    description:
      'Validated recommended job IDs for assistant messages. Frontend can use these IDs to rehydrate job cards on history reload.',
    required: false,
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  recommendedJobIds?: string[];

  @ApiProperty({
    description:
      'Hydrated public job cards for assistant messages. Unavailable jobs are omitted while recommendedJobIds stays intact.',
    required: false,
    type: [ChatRecommendedJobDto],
  })
  recommendedJobs?: ChatRecommendedJobDto[];
}

export class ConversationHistoryResponseDto {
  @ApiProperty({
    description: 'Array of messages',
    type: [MessageDto],
  })
  messages: MessageDto[];

  @ApiProperty({
    description: 'Total number of messages',
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Messages per page',
    example: 50,
  })
  limit: number;

  @ApiProperty({
    description: 'Conversation title (auto-generated from first message)',
    example: 'How do I improve my React skills?',
    required: false,
  })
  title?: string;
}
