import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CompanyDto } from 'src/companies/dto/company.dto';
import { IsAfter } from 'src/utils/decorators/is-after.decorator';
import { EJobLevel } from '../enums/job-level.enum';
import { EJobFormOfWork } from '../enums/job-form-of-work.enum';

export class CreateJobDto {
  @IsNotEmpty({ message: 'Tên là bắt buộc' })
  @IsString({ message: 'Tên phải là chuỗi' })
  @MaxLength(100, { message: 'Tên quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({
    example: 'Senior Backend Engineer',
    description: 'Title/name of the job position',
  })
  name: string;

  @IsNotEmpty({ message: 'Kỹ năng là bắt buộc' })
  @IsArray({ message: 'Kỹ năng phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một kỹ năng' })
  @IsString({ each: true, message: 'Mỗi kỹ năng phải là chuỗi' })
  @MaxLength(100, { each: true, message: 'Tên kỹ năng quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(skill => skill?.trim()).filter(Boolean) : value,
  )
  @ApiProperty({
    example: ['NestJS', 'MongoDB', 'TypeScript', 'Docker'],
    description: 'Required skills for the job',
  })
  skills: string[];

  @IsNotEmptyObject({ nullable: true }, { message: 'Công ty là bắt buộc' })
  @IsObject({ message: 'Công ty phải là object' })
  @ValidateNested()
  @Type(() => CompanyDto)
  @ApiProperty({ type: CompanyDto, description: 'Company of job' })
  company: CompanyDto;

  @IsOptional()
  @IsString({ message: 'locationCode phải là chuỗi' })
  @MaxLength(100, { message: 'locationCode quá dài (tối đa 100 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ApiPropertyOptional({
    example: 'ha-noi',
    description: 'Canonical location code used for exact filtering',
  })
  locationCode?: string;

  @IsOptional()
  @IsString({ message: 'Địa điểm phải là chuỗi' })
  @MaxLength(200, { message: 'Địa điểm quá dài (tối đa 200 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiPropertyOptional({
    example: 'Hà Nội',
    description: 'Legacy display location. Deprecated in favor of locationCode.',
  })
  location?: string;

  @IsNotEmpty({ message: 'Mức lương là bắt buộc' })
  @IsNumber({}, { message: 'Mức lương phải là số' })
  @IsPositive({ message: 'Mức lương phải lớn hơn 0' })
  @ApiProperty({ example: 25000000, description: 'Monthly salary in VND' })
  salary: number;

  @IsNotEmpty({ message: 'Số lượng là bắt buộc' })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng phải từ 1 trở lên' })
  @Max(1000, { message: 'Số lượng quá lớn (tối đa 1000)' })
  @ApiProperty({ example: 5, description: 'Number of positions available' })
  quantity: number;

  @IsNotEmpty({ message: 'Cấp bậc là bắt buộc' })
  @IsEnum(EJobLevel, { message: 'Cấp bậc không hợp lệ' })
  @IsString({ message: 'Cấp bậc phải là chuỗi' })
  @MaxLength(50, { message: 'Cấp bậc quá dài (tối đa 50 ký tự)' })
  @ApiProperty({
    example: EJobLevel.SENIOR,
    description: 'Experience level required for the job',
    enum: EJobLevel,
    enumName: 'EJobLevel',
  })
  level: EJobLevel;

  @IsNotEmpty({ message: 'Hình thức làm việc là bắt buộc' })
  @IsString({ message: 'Hình thức làm việc phải là chuỗi' })
  @IsEnum(EJobFormOfWork, {
    message: `formOfWork phải là một trong các giá trị: ${Object.values(EJobFormOfWork).join(', ')}`,
  })
  @ApiProperty({ example: EJobFormOfWork.FULL_TIME, description: 'Job form of work' })
  formOfWork: string;

  @IsNotEmpty({ message: 'Mô tả là bắt buộc' })
  @IsString({ message: 'Mô tả phải là chuỗi' })
  @MaxLength(5000, { message: 'Mô tả quá dài (tối đa 5000 ký tự)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({
    example: 'We are looking for an experienced backend engineer to join our team...',
    description: 'Detailed job description',
  })
  description: string;

  @IsNotEmpty({ message: 'Ngày bắt đầu là bắt buộc' })
  @Transform(({ value }) => (value ? new Date(value) : value))
  @IsDate({ message: 'startDate phải là ngày hợp lệ' })
  @ApiProperty({ example: '2025-11-01', description: 'Job posting start date (ISO 8601 format)' })
  startDate: Date;

  @IsNotEmpty({ message: 'Ngày kết thúc là bắt buộc' })
  @Transform(({ value }) => (value ? new Date(value) : value))
  @IsDate({ message: 'endDate phải là ngày hợp lệ' })
  @IsAfter('startDate', { message: 'Ngày kết thúc phải sau ngày bắt đầu' })
  @ApiProperty({ example: '2025-12-31', description: 'Job posting end date (ISO 8601 format)' })
  endDate: Date;

  @IsNotEmpty({ message: 'isActive là bắt buộc' })
  @IsBoolean({ message: 'isActive phải là true hoặc false' })
  @ApiProperty({
    example: true,
    description: 'Whether the job posting is active',
    default: true,
  })
  isActive: boolean;
}
