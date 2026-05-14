import { ApiProperty } from '@nestjs/swagger';

export class AiUsageSummaryDto {
  @ApiProperty({ example: 1200 })
  totalRequests: number;

  @ApiProperty({ example: 1140 })
  successfulRequests: number;

  @ApiProperty({ example: 60 })
  failedRequests: number;

  @ApiProperty({ example: 95 })
  successRate: number;

  @ApiProperty({ example: 220 })
  fallbackRequests: number;

  @ApiProperty({ example: 18.33 })
  fallbackRate: number;

  @ApiProperty({ example: 180 })
  cacheHits: number;

  @ApiProperty({ example: 15 })
  cacheHitRate: number;

  @ApiProperty({ example: 1450 })
  averageLatencyMs: number;

  @ApiProperty({ example: 3100 })
  p95LatencyMs: number;

  @ApiProperty({ example: 920000 })
  totalTokens: number;

  @ApiProperty({ example: 4.21 })
  estimatedCostUsd: number;

  @ApiProperty({ example: 12 })
  quotaDenials: number;

  @ApiProperty({ example: 8 })
  guardrailBlocks: number;

  @ApiProperty({
    example: { RATE_LIMIT: 12, SERVICE_UNAVAILABLE: 5 },
  })
  errorsByCategory: Record<string, number>;

  @ApiProperty({ example: '2026-05-14T09:00:00.000Z' })
  generatedAt: Date;
}

export class AiUsageTimeseriesPointDto {
  @ApiProperty({ example: '2026-05-14' })
  date: string;

  @ApiProperty({ example: 120 })
  requests: number;

  @ApiProperty({ example: 116 })
  successfulRequests: number;

  @ApiProperty({ example: 4 })
  failedRequests: number;

  @ApiProperty({ example: 25000 })
  totalTokens: number;

  @ApiProperty({ example: 0.42 })
  estimatedCostUsd: number;

  @ApiProperty({ example: 900 })
  averageLatencyMs: number;
}

export class AiUsageTimeseriesDto {
  @ApiProperty({ type: [AiUsageTimeseriesPointDto] })
  points: AiUsageTimeseriesPointDto[];

  @ApiProperty({ example: '2026-05-14T09:00:00.000Z' })
  generatedAt: Date;
}

export class AiUsageTopUserDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  userId: string;

  @ApiProperty({ example: 75 })
  requests: number;

  @ApiProperty({ example: 71000 })
  totalTokens: number;

  @ApiProperty({ example: 0.92 })
  estimatedCostUsd: number;

  @ApiProperty({ example: 1300 })
  averageLatencyMs: number;
}

export class AiUsageTopUsersDto {
  @ApiProperty({ type: [AiUsageTopUserDto] })
  users: AiUsageTopUserDto[];

  @ApiProperty({ example: '2026-05-14T09:00:00.000Z' })
  generatedAt: Date;
}
