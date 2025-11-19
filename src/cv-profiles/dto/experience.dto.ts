import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExperienceDto {
  @ApiProperty({
    description: 'Unique identifier for the experience',
    example: 'exp-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Company name',
    example: 'Tech Corp Vietnam',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  company: string;

  @ApiProperty({
    description: 'Job position/title',
    example: 'Senior Backend Developer',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  position: string;

  @ApiProperty({
    description: 'Start date (string format)',
    example: '2020-01-01',
  })
  @IsString()
  startDate: string;

  @ApiProperty({
    description: 'End date (string format)',
    example: '2023-12-31',
  })
  @IsString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Job description and responsibilities',
    example: 'Developed and maintained microservices using NestJS, MongoDB, and Redis',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
