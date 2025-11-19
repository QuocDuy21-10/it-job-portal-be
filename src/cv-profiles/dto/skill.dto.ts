import {
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SkillDto {
  @ApiProperty({
    description: 'Unique identifier for the skill',
    example: 'skill-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Name of the skill',
    example: 'NestJS',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Proficiency level',
    example: 'Advanced',
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  level: string;
}
