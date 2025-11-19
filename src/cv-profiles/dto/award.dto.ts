import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AwardDto {
  @ApiProperty({
    description: 'Unique identifier for the award',
    example: 'award-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Award name',
    example: 'Best Developer of the Year',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Date received (string format)',
    example: '2023-12-01',
  })
  @IsString()
  date: string;

  @ApiPropertyOptional({
    description: 'Award description',
    example: 'Awarded for outstanding performance and innovation in backend development',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
