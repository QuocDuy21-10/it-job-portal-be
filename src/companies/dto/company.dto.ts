import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompanyDto {
  @IsOptional()
  @IsNotEmpty({ message: 'ID công ty là bắt buộc' })
  @IsMongoId({ message: 'ID công ty không hợp lệ' })
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
  })
  _id?: string;

  @IsOptional()
  @IsNotEmpty({ message: 'Tên công ty là bắt buộc' })
  @IsString({ message: 'Tên công ty phải là chuỗi' })
  @MaxLength(100, { message: 'Tên công ty quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({
    example: 'Tech Corp',
    description: 'Name of the company',
    maxLength: 100,
  })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Logo công ty phải là chuỗi' })
  @ApiPropertyOptional({
    example: 'logo.png',
    description: 'URL to company logo image',
  })
  logo?: string;
}
