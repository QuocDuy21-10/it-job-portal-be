import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AI_PROVIDER_GEMINI, AI_PROVIDER_GROQ, AIProvider } from 'src/ai/ai.constants';
import { EChatIntent } from '../enums/chat-intent.enum';

export class AiUsageQueryDto {
  @ApiPropertyOptional({
    description: 'Start date filter',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter',
    example: '2026-05-14T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Provider filter',
    enum: [AI_PROVIDER_GEMINI, AI_PROVIDER_GROQ],
  })
  @IsOptional()
  @IsIn([AI_PROVIDER_GEMINI, AI_PROVIDER_GROQ])
  provider?: AIProvider;

  @ApiPropertyOptional({
    description: 'Model filter',
    example: 'llama-3.3-70b-versatile',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Intent filter',
    enum: EChatIntent,
  })
  @IsOptional()
  @IsEnum(EChatIntent)
  intent?: EChatIntent;
}

export class AiUsageTimeseriesQueryDto extends AiUsageQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of days to return',
    example: 30,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class AiUsageTopUsersQueryDto extends AiUsageQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum users to return',
    example: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
