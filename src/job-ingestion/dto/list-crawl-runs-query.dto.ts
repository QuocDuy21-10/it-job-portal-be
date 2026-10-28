import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CRAWL_RUNS_DEFAULT_LIMIT, CRAWL_RUNS_MAX_LIMIT } from '../job-ingestion.constants';

export class ListCrawlRunsQueryDto {
  @ApiProperty({ required: false, example: CRAWL_RUNS_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CRAWL_RUNS_MAX_LIMIT)
  limit?: number;
}
