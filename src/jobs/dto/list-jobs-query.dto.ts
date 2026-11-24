import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JOB_SEARCH_MAX_KEYWORD_LENGTH } from 'src/job-search/job-search.constants';
import { PaginationQueryDto } from 'src/utils/dto/pagination-query.dto';

export class ListJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search keyword — matches job title, skills, and company name',
    example: 'React',
    maxLength: JOB_SEARCH_MAX_KEYWORD_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(JOB_SEARCH_MAX_KEYWORD_LENGTH)
  keyword?: string;
}
