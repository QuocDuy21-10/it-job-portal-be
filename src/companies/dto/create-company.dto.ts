import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  COMPANY_FILE_PATTERN,
  MAX_BENEFIT_NOTE_LENGTH,
  MAX_BENEFITS,
  MAX_TECH_STACK,
} from '../company-profile.constants';
import { ECompanyBenefit } from '../enums/company-benefit.enum';
import { ECompanyIndustry } from '../enums/company-industry.enum';

export class CompanyBenefitDto {
  @IsEnum(ECompanyBenefit, { message: 'Loại phúc lợi không hợp lệ' })
  @ApiProperty({ enum: ECompanyBenefit })
  type: ECompanyBenefit;

  @IsOptional()
  @IsString({ message: 'Ghi chú phúc lợi phải là chuỗi' })
  @MaxLength(MAX_BENEFIT_NOTE_LENGTH, {
    message: `Ghi chú phúc lợi tối đa ${MAX_BENEFIT_NOTE_LENGTH} ký tự`,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiPropertyOptional({ maxLength: MAX_BENEFIT_NOTE_LENGTH, nullable: true })
  note?: string | null;
}

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

  @IsOptional()
  @Matches(COMPANY_FILE_PATTERN, { message: 'Tên tệp ảnh bìa không hợp lệ' })
  @ApiPropertyOptional({
    nullable: true,
    description: 'File name returned by POST /files/upload (X-Folder-Type: company)',
  })
  coverImage?: string | null;

  @IsOptional()
  @IsEnum(ECompanyIndustry, { message: 'Lĩnh vực không hợp lệ' })
  @ApiPropertyOptional({ enum: ECompanyIndustry, nullable: true })
  industry?: ECompanyIndustry | null;

  @IsOptional()
  @IsArray({ message: 'Công nghệ phải là danh sách' })
  @ArrayMaxSize(MAX_TECH_STACK, { message: `Tối đa ${MAX_TECH_STACK} công nghệ` })
  @IsString({ each: true, message: 'Mỗi công nghệ phải là chuỗi' })
  @MaxLength(50, { each: true, message: 'Tên công nghệ quá dài (tối đa 50 ký tự)' })
  @ApiPropertyOptional({ type: [String], description: 'Labels or aliases from the skills catalog' })
  techStack?: string[];

  @IsOptional()
  @IsArray({ message: 'Phúc lợi phải là danh sách' })
  @ArrayMaxSize(MAX_BENEFITS, { message: `Tối đa ${MAX_BENEFITS} phúc lợi` })
  // ValidateNested alone lets a nested array such as [[]] through.
  @IsObject({ each: true, message: 'Mỗi phúc lợi phải là một đối tượng' })
  @ValidateNested({ each: true })
  @Type(() => CompanyBenefitDto)
  @ApiPropertyOptional({ type: [CompanyBenefitDto] })
  benefits?: CompanyBenefitDto[];
}
