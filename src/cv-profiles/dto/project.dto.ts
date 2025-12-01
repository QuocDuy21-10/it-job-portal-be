import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectDto {
  @ApiProperty({
    description: 'Unique identifier for the project',
    example: 'proj-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Project name',
    example: 'E-commerce Platform',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Full-stack e-commerce solution with payment integration and real-time inventory',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Position held in the project',
    example: 'Lead Developer',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  position: string;

  @ApiPropertyOptional({
    description: 'Project link (GitHub, demo, etc.)',
    example: 'https://github.com/username/ecommerce',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  link?: string;
}
