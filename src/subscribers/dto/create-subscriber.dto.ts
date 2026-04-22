import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
} from 'class-validator';

export class CreateSubscriberDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, {
    message: 'Name can only contain letters and spaces',
  })
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      value = String(value);
    }
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
  })
  @ApiProperty({
    example: 'Nguyen Van Duy',
    description: 'Name of subscriber (letters and spaces only)',
  })
  name: string;

  @IsNotEmpty({ message: 'Skills is required' })
  @IsArray({ message: 'Skills must be an array' })
  @ArrayMinSize(1, { message: 'At least one skill is required' })
  @ArrayMaxSize(20, { message: 'Maximum 20 skills allowed' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;

    return value
      .map(skill => {
        if (typeof skill === 'number') {
          skill = String(skill);
        }
        // Trim và loại bỏ empty strings
        return typeof skill === 'string' ? skill.trim() : skill;
      })
      .filter(skill => skill !== '') // Loại bỏ empty strings
      .filter(
        (skill, index, self) => self.indexOf(skill) === index, // Loại bỏ duplicates
      )
      .slice(0, 20); // Giới hạn 20 skills
  })
  @ApiProperty({
    example: ['JavaScript', 'TypeScript', 'NestJS'],
    description: 'Skills of subscriber (1-20 skills)',
  })
  skills: string[];

  @IsOptional()
  @IsString({ message: 'Location must be a string' })
  @MaxLength(100, { message: 'Location is too long (max: 100 chars)' })
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      value = String(value);
    }
    return typeof value === 'string' ? value.trim() : value;
  })
  @ApiProperty({
    example: 'Hà Nội',
    description: 'Preferred location of subscriber',
    required: false,
  })
  location?: string;
}
