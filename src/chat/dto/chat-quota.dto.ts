import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicChatQuotaStatusDto {
  @ApiProperty({
    description: 'Messages remaining in the current quota window. Null means unlimited.',
    example: 38,
    nullable: true,
  })
  remainingQuota: number | null;

  @ApiProperty({
    description: 'Unix timestamp in seconds when the current quota window resets.',
    example: 1778836964,
  })
  nextResetTime: number;
}

export class ChatQuotaStatusDto {
  @ApiProperty({
    description: 'Daily quota limit. Null means unlimited.',
    example: 30,
    nullable: true,
  })
  limit: number | null;

  @ApiProperty({
    description: 'Messages used in the current quota window',
    example: 7,
  })
  used: number;

  @ApiProperty({
    description: 'Messages remaining in the current quota window. Null means unlimited.',
    example: 23,
    nullable: true,
  })
  remaining: number | null;

  @ApiProperty({
    description: 'When the current quota window resets',
    example: '2026-05-15T00:00:00.000Z',
  })
  resetAt: Date;

  @ApiProperty({
    description: 'Whether this user is exempt from daily chat quotas',
    example: false,
  })
  unlimited: boolean;

  @ApiPropertyOptional({
    description: 'True when Redis quota storage was unavailable and the request was allowed open',
    example: false,
  })
  unavailable?: boolean;
}
