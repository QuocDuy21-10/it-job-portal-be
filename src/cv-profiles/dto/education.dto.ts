import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EducationDto {
  @ApiProperty({
    description: 'Unique identifier for the education record',
    example: 'edu-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'School/University name',
    example: 'Đại học Bách Khoa TPHCM',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  school: string;

  @ApiProperty({
    description: 'Degree obtained',
    example: 'Bachelor of Engineering',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  degree: string;

  @ApiProperty({
    description: 'Field of study/Major',
    example: 'Computer Science',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  field: string;

  @ApiProperty({
    description: 'Start date (string format)',
    example: '2013-09-01',
  })
  @IsString()
  startDate: string;

  @ApiProperty({
    description: 'End date (string format)',
    example: '2017-06-30',
  })
  @IsString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Additional details (GPA, honors, etc.)',
    example: 'GPA: 3.8/4.0 - Graduated with honors',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
