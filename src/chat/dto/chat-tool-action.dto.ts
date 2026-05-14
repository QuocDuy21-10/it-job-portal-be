import { ApiProperty } from '@nestjs/swagger';
import { EChatToolActionType } from '../enums/chat-tool-action.enum';

export class PendingChatToolActionDto {
  @ApiProperty({
    description: 'Pending action identifier',
    example: '507f1f77bcf86cd799439011',
  })
  actionId: string;

  @ApiProperty({
    description: 'Tool action type',
    enum: EChatToolActionType,
    example: EChatToolActionType.SAVE_JOB,
  })
  type: EChatToolActionType;

  @ApiProperty({
    description: 'Human-readable confirmation label',
    example: 'Save Backend Developer',
  })
  label: string;

  @ApiProperty({
    description: 'Action payload for frontend display',
    example: { jobId: '507f1f77bcf86cd799439012', jobName: 'Backend Developer' },
  })
  payload: Record<string, unknown>;

  @ApiProperty({
    description: 'Action expiry time',
    example: '2026-05-14T10:15:00.000Z',
  })
  expiresAt: Date;
}

export class ChatToolActionResultDto {
  @ApiProperty({
    description: 'Tool action identifier',
    example: '507f1f77bcf86cd799439011',
  })
  actionId: string;

  @ApiProperty({
    description: 'Tool action type',
    enum: EChatToolActionType,
  })
  type: EChatToolActionType;

  @ApiProperty({
    description: 'Final action status',
    example: 'confirmed',
  })
  status: string;

  @ApiProperty({
    description: 'Result message',
    example: 'Job saved successfully',
  })
  message: string;
}
