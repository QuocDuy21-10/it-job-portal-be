import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/utils/dto/pagination-query.dto';
import { ECrawledJobState } from '../enums/crawled-job-state.enum';

export class ListCrawledJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'topdev' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceKey?: string;

  @ApiPropertyOptional({ enum: ECrawledJobState })
  @IsOptional()
  @IsEnum(ECrawledJobState)
  state?: ECrawledJobState;

  @ApiPropertyOptional({ description: 'Matches title and company name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z', description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-25T23:59:59.999Z', description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
