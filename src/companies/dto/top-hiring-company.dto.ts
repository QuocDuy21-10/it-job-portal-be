import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class TopHiringCompaniesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @ApiPropertyOptional({
    description: 'Maximum number of companies to return',
    default: 10,
    minimum: 1,
    maximum: 20,
    example: 10,
  })
  limit?: number;
}

export class TopHiringCompanyDto {
  @Transform(({ value }) => value?.toString())
  @ApiProperty({
    description: 'Company identifier',
    example: '681f35d6203298c6209a5e63',
  })
  _id: string;

  @ApiProperty({
    description: 'Company display name',
    example: 'Tech Corp',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Company logo file path or URL',
    example: 'tech-corp-logo.png',
    nullable: true,
  })
  logo?: string | null;

  @ApiProperty({
    description: 'Company address',
    example: 'Ho Chi Minh City, Vietnam',
  })
  address: string;

  @ApiPropertyOptional({
    description: 'Company website',
    example: 'https://techcorp.example',
    nullable: true,
  })
  website?: string | null;

  @ApiPropertyOptional({
    description: 'Approximate number of employees',
    example: 500,
  })
  numberOfEmployees?: number;

  @ApiProperty({
    description: 'Number of approved active non-expired jobs',
    example: 12,
  })
  totalOpenJobs: number;
}
