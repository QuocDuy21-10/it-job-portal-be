import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
