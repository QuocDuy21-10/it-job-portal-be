import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/utils/dto/pagination-query.dto';
import { ERejectionReason } from '../enums/rejection-reason.enum';

export const CRAWL_FAILURE_GROUPS = ['error', 'filtered'] as const;
export type CrawlFailureGroup = (typeof CRAWL_FAILURE_GROUPS)[number];

export class ListCrawlFailuresQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'topdev' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceKey?: string;

  @ApiPropertyOptional({ enum: ERejectionReason, description: 'Overrides group' })
  @IsOptional()
  @IsEnum(ERejectionReason)
  reason?: ERejectionReason;

  @ApiPropertyOptional({ enum: CRAWL_FAILURE_GROUPS, default: 'error' })
  @IsOptional()
  @IsIn(CRAWL_FAILURE_GROUPS)
  group?: CrawlFailureGroup;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z', description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-25T23:59:59.999Z', description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
