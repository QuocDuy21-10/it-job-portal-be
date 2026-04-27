import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSkillDto {
  @IsNotEmpty({ message: 'label is required' })
  @IsString({ message: 'label must be a string' })
  @MaxLength(100, { message: 'label is too long (max: 100 chars)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @ApiProperty({ example: 'Node.js', description: 'Canonical display label for the skill' })
  label: string;

  @IsOptional()
  @IsArray({ message: 'aliases must be an array' })
  @ArrayMaxSize(30, { message: 'Maximum 30 aliases allowed' })
  @IsString({ each: true, message: 'Each alias must be a string' })
  @MaxLength(100, { each: true, message: 'Alias is too long (max: 100 chars)' })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;

    return value
      .map(alias => (typeof alias === 'string' ? alias.trim().replace(/\s+/g, ' ') : alias))
      .filter(Boolean)
      .filter((alias, index, self) => self.indexOf(alias) === index);
  })
  @ApiPropertyOptional({
    example: ['node', 'nodejs', 'node js'],
    description: 'Known aliases and variations for the skill',
  })
  aliases?: string[];

  @IsOptional()
  @IsString({ message: 'category must be a string' })
  @MaxLength(100, { message: 'category is too long (max: 100 chars)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @ApiPropertyOptional({ example: 'Backend', description: 'Optional skill taxonomy bucket' })
  category?: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(500, { message: 'description is too long (max: 500 chars)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiPropertyOptional({
    example: 'JavaScript runtime commonly used for backend development',
    description: 'Optional admin description for the skill',
  })
  description?: string;

  @IsNotEmpty({ message: 'isActive is required' })
  @IsBoolean({ message: 'isActive must be a boolean' })
  @ApiProperty({
    example: true,
    default: true,
    description: 'Whether the skill is active in the master catalog',
  })
  isActive: boolean;
}
