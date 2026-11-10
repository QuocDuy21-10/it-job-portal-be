import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

/**
 * Swagger contract for list pagination. Values stay strings (no global `transform`);
 * services normalize them with `resolvePagination`, which clamps instead of rejecting.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Page number, starts at 1', minimum: 1, default: 1 })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({
    description: 'Items per page; values above 100 are clamped to 100',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  limit?: string;
}
