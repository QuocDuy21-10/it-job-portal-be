import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
