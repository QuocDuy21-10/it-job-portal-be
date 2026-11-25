import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export const LIST_KEYWORD_MAX_LENGTH = 100;

export class KeywordListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Plain-text search, case-insensitive',
    maxLength: LIST_KEYWORD_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(LIST_KEYWORD_MAX_LENGTH)
  keyword?: string;
}
