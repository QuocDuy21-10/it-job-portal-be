import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LanguageDto {
  @ApiProperty({
    description: 'Unique identifier for the language',
    example: 'lang-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Language name',
    example: 'English',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Language proficiency level',
    example: 'Fluent',
    enum: ['Native', 'Fluent', 'Intermediate', 'Basic'],
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  proficiency: string;
}
