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
  @IsNotEmpty({ message: 'label là bắt buộc' })
  @IsString({ message: 'label phải là chuỗi' })
  @MaxLength(100, { message: 'label quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @ApiProperty({ example: 'Node.js', description: 'Canonical display label for the skill' })
  label: string;

  @IsOptional()
  @IsArray({ message: 'aliases phải là mảng' })
  @ArrayMaxSize(30, { message: 'Tối đa 30 tên gọi khác' })
  @IsString({ each: true, message: 'Mỗi tên gọi khác phải là chuỗi' })
  @MaxLength(100, { each: true, message: 'Tên gọi khác quá dài (tối đa 100 ký tự)' })
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
  @IsString({ message: 'category phải là chuỗi' })
  @MaxLength(100, { message: 'category quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @ApiPropertyOptional({ example: 'Backend', description: 'Optional skill taxonomy bucket' })
  category?: string;

  @IsOptional()
  @IsString({ message: 'description phải là chuỗi' })
  @MaxLength(500, { message: 'description quá dài (tối đa 500 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiPropertyOptional({
    example: 'JavaScript runtime commonly used for backend development',
    description: 'Optional admin description for the skill',
  })
  description?: string;

  @IsNotEmpty({ message: 'isActive là bắt buộc' })
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  @ApiProperty({
    example: true,
    default: true,
    description: 'Whether the skill is active in the master catalog',
  })
  isActive: boolean;
}
