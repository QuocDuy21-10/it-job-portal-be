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
  @IsNotEmpty({ message: 'Tên là bắt buộc' })
  @IsString({ message: 'Tên phải là chuỗi' })
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  @MaxLength(100, { message: 'Tên quá dài (tối đa 100 ký tự)' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, {
    message: 'Tên chỉ được chứa chữ cái và khoảng trắng',
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

  @IsNotEmpty({ message: 'Kỹ năng là bắt buộc' })
  @IsArray({ message: 'Kỹ năng phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một kỹ năng' })
  @ArrayMaxSize(20, { message: 'Tối đa 20 kỹ năng' })
  @IsString({ each: true, message: 'Mỗi kỹ năng phải là chuỗi' })
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
  @IsString({ message: 'locationCode phải là chuỗi' })
  @MaxLength(100, { message: 'locationCode quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      value = String(value);
    }
    return typeof value === 'string' ? value.trim().toLowerCase() : value;
  })
  @ApiProperty({
    example: 'ha-noi',
    description: 'Canonical location code used for exact matching',
    required: false,
  })
  locationCode?: string;

  @IsOptional()
  @IsString({ message: 'Địa điểm phải là chuỗi' })
  @MaxLength(100, { message: 'Địa điểm quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => {
    if (typeof value === 'number') {
      value = String(value);
    }
    return typeof value === 'string' ? value.trim() : value;
  })
  @ApiProperty({
    example: 'Hà Nội',
    description: 'Legacy display location. Deprecated in favor of locationCode.',
    required: false,
  })
  location?: string;
}
