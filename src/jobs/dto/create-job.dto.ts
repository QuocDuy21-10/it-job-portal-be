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
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CompanyDto } from 'src/companies/dto/company.dto';
import { IsAfter } from 'src/decorator/is-after.decorator';
import { JobLevel } from '../enums/job-level.enum';
import { JobFormOfWork } from '../enums/job-formwork';

export class CreateJobDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({
    example: 'Senior Backend Engineer',
    description: 'Title/name of the job position',
  })
  name: string;

  @IsNotEmpty({ message: 'Skills are required' })
  @IsArray({ message: 'Skills must be an array' })
  @ArrayMinSize(1, { message: 'At least one skill is required' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  @MaxLength(100, { each: true, message: 'Skill name is too long (max: 100 chars)' })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(skill => skill?.trim()).filter(Boolean) : value,
  )
  @ApiProperty({
    example: ['NestJS', 'MongoDB', 'TypeScript', 'Docker'],
    description: 'Required skills for the job',
  })
  skills: string[];

  @IsNotEmptyObject({ nullable: true }, { message: 'Company is required' })
  @IsObject({ message: 'Company must be an object' })
  @ValidateNested()
  @Type(() => CompanyDto)
  @ApiProperty({ type: CompanyDto, description: 'Company of job' })
  company: CompanyDto;

  @IsNotEmpty({ message: 'Location is required' })
  @IsString({ message: 'Location must be a string' })
  @MaxLength(200, { message: 'Location is too long (max: 200 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'Ha Noi, Vietnam', description: 'Job location/office address' })
  location: string;

  @IsNotEmpty({ message: 'Salary is required' })
  @IsNumber({}, { message: 'Salary must be a number' })
  @IsPositive({ message: 'Salary must be greater than 0' })
  @ApiProperty({ example: 25000000, description: 'Monthly salary in VND' })
  salary: number;

  @IsNotEmpty({ message: 'Quantity is required' })
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1000, { message: 'Quantity is too large (max: 1000)' })
  @ApiProperty({ example: 5, description: 'Number of positions available' })
  quantity: number;

  @IsNotEmpty({ message: 'Level is required' })
  @IsEnum(JobLevel, { message: 'Level must be a valid job level' })
  @IsString({ message: 'Level must be a string' })
  @MaxLength(50, { message: 'Level is too long (max: 50 chars)' })
  @ApiProperty({
    example: JobLevel.SENIOR,
    description: 'Experience level required for the job',
    enum: JobLevel,
    enumName: 'JobLevel',
  })
  level: JobLevel;

  @IsNotEmpty({ message: 'Form of work is required' })
  @IsString({ message: 'Form of work must be a string' })
  @IsEnum(JobFormOfWork, {
    message: `formOfWork must be one of the following values: ${Object.values(JobFormOfWork).join(', ')}`,
  })
  @ApiProperty({ example: JobFormOfWork.FULL_TIME, description: 'Job form of work' })
  formOfWork: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  @MaxLength(5000, { message: 'Description is too long (max: 5000 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({
    example: 'We are looking for an experienced backend engineer to join our team...',
    description: 'Detailed job description',
  })
  description: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @Transform(({ value }) => (value ? new Date(value) : value))
  @IsDate({ message: 'startDate must be a valid date' })
  @ApiProperty({ example: '2025-11-01', description: 'Job posting start date (ISO 8601 format)' })
  startDate: Date;

  @IsNotEmpty({ message: 'End date is required' })
  @Transform(({ value }) => (value ? new Date(value) : value))
  @IsDate({ message: 'endDate must be a valid date' })
  @IsAfter('startDate', { message: 'End date must be after start date' })
  @ApiProperty({ example: '2025-12-31', description: 'Job posting end date (ISO 8601 format)' })
  endDate: Date;

  @IsNotEmpty({ message: 'isActive is required' })
  @IsBoolean({ message: 'isActive must be a boolean' })
  @ApiProperty({
    example: true,
    description: 'Whether the job posting is active',
    default: true,
  })
  isActive: boolean;
}
