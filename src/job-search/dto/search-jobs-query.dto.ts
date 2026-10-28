import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import {
  JOB_SEARCH_MAX_KEYWORD_LENGTH,
  JOB_SEARCH_MAX_LIMIT,
  JOB_SEARCH_SORTS,
  JOB_SEARCH_SOURCES,
  JobSearchSort,
  JobSearchSource,
} from '../job-search.constants';

const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);

export class SearchJobsQueryDto {
  @ApiProperty({
    required: false,
    example: 'backend',
    description: 'Matches title, skills, company',
  })
  @IsOptional()
  @IsString()
  @MaxLength(JOB_SEARCH_MAX_KEYWORD_LENGTH)
  @Transform(trim)
  keyword?: string;

  @ApiProperty({ required: false, example: 'ho-chi-minh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  locationCode?: string;

  @ApiProperty({ required: false, enum: EJobLevel })
  @IsOptional()
  @IsEnum(EJobLevel)
  level?: EJobLevel;

  @ApiProperty({ required: false, enum: EJobFormOfWork })
  @IsOptional()
  @IsEnum(EJobFormOfWork)
  formOfWork?: EJobFormOfWork;

  @ApiProperty({ required: false, example: 10000000, description: 'VND; internal jobs only' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiProperty({ required: false, example: 50000000, description: 'VND; internal jobs only' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @ApiProperty({ required: false, enum: JOB_SEARCH_SOURCES, default: 'all' })
  @IsOptional()
  @IsIn(JOB_SEARCH_SOURCES)
  source?: JobSearchSource;

  @ApiProperty({ required: false, enum: JOB_SEARCH_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(JOB_SEARCH_SORTS)
  sort?: JobSearchSort;

  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: JOB_SEARCH_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(JOB_SEARCH_MAX_LIMIT)
  limit?: number;
}
