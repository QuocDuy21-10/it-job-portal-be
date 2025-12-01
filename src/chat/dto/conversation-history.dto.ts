import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class ConversationHistoryQueryDto {
  @ApiProperty({
    description: 'Page number',
    example: 1,
    required: false,
    default: 1,
    minimum: 1
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
    maximum: 100
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
    enum: ['user', 'assistant']
  })
  role: string;

  @ApiProperty({
    description: 'Message content',
    example: 'What skills should I learn?'
  })
  content: string;

  @ApiProperty({
    description: 'Message timestamp',
    example: '2024-12-01T10:30:00.000Z'
  })
  timestamp: Date;
}

export class ConversationHistoryResponseDto {
  @ApiProperty({
    description: 'Array of messages',
    type: [MessageDto]
  })
  messages: MessageDto[];

  @ApiProperty({
    description: 'Total number of messages',
    example: 100
  })
  total: number;

  @ApiProperty({
    description: 'Current page',
    example: 1
  })
  page: number;

  @ApiProperty({
    description: 'Messages per page',
    example: 50
  })
  limit: number;
}
