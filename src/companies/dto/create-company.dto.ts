import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty({ message: 'Tên là bắt buộc' })
  @IsString({ message: 'Tên phải là chuỗi' })
  @MaxLength(100, { message: 'Tên quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'Google', description: 'Name of company' })
  name: string;

  @IsNotEmpty({ message: 'Địa chỉ là bắt buộc' })
  @IsString({ message: 'Địa chỉ phải là chuỗi' })
  @MaxLength(200, { message: 'Địa chỉ quá dài (tối đa 200 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'Ha Noi', description: 'Address of company' })
  address: string;

  @IsNotEmpty({ message: 'Mô tả là bắt buộc' })
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(3000, { message: 'Mô tả quá dài (tối đa 1000 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'Google ...', description: 'Description of company' })
  description: string;

  @IsNotEmpty({ message: 'Logo là bắt buộc' })
  @IsString({ message: 'Logo phải là chuỗi' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'logo.png', description: 'Logo of company' })
  logo?: string;

  @IsNotEmpty({ message: 'Website là bắt buộc' })
  @IsString({ message: 'Website phải là chuỗi' })
  @MaxLength(100, { message: 'Website quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'https://google.com', description: 'Website of company' })
  website: string;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false }, { message: 'Số lượng nhân viên phải là số' })
  @Type(() => Number)
  @ApiProperty({ example: 5000, description: 'Number of employees in the company' })
  numberOfEmployees?: number;
}
