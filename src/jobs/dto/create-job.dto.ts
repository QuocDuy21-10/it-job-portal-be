import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsInt,
  IsMongoId,
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
import mongoose from 'mongoose';
import { IsAfter } from 'src/decorator/is-after.decorator';

class Company {
  @IsNotEmpty({ message: 'Company ID is required' })
  @IsMongoId({ message: 'Company ID must be a valid MongoDB ObjectId' })
  _id: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'Company name is required' })
  @IsString({ message: 'Company name must be a string' })
  @MaxLength(100, { message: 'Company name is too long (max: 100 chars)' })
  name: string;
}

export class CreateJobDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'Software Engineer', description: 'Name of job' })
  name: string;

  @IsNotEmpty({ message: 'Skill is required' })
  @IsArray({ message: 'Skill must be an array' })
  @ArrayMinSize(1, { message: 'At least one skill is required' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  @MaxLength(100, { each: true, message: 'Skill is too long (max: 100 chars)' })
  @Transform(({ value }) => value.map(skill => skill.trim()))
  @ApiProperty({ example: ['Java', 'Python'], description: 'Skill of job' })
  skill: string[];

  @IsNotEmptyObject({ nullable: true }, { message: 'Company is required' })
  @IsObject({ message: 'Company must be an object' })
  @ValidateNested()
  @Type(() => Company)
  @ApiProperty({ type: Company, description: 'Company of job' })
  company: Company;

  @IsNotEmpty({ message: 'Location is required' })
  @IsString({ message: 'Location must be a string' })
  @MaxLength(200, { message: 'Location is too long (max: 200 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'Ha Noi', description: 'Location of job' })
  location: string;

  @IsNotEmpty({ message: 'Salary is required' })
  @IsNumber({}, { message: 'Salary must be a number' })
  @IsPositive({ message: 'Salary must be greater than 0' })
  @ApiProperty({ example: 1000000, description: 'Salary of job' })
  salary: number;

  @IsNotEmpty({ message: 'Quantity is required' })
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1000, { message: 'Quantity is too large (max: 1000)' })
  @ApiProperty({ example: 10, description: 'Quantity of job' })
  quantity: number;

  @IsNotEmpty({ message: 'Level is required' })
  @IsString({ message: 'Level must be a string' })
  @MaxLength(50, { message: 'Level is too long (max: 50 chars)' })
  @ApiProperty({ example: 'Junior', description: 'Level of job' })
  level: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  @MaxLength(2000, { message: 'Description is too long (max: 2000 chars)' })
  @ApiProperty({ example: 'Description ...', description: 'Description of job' })
  description: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @Transform(({ value }) => new Date(value))
  @IsDate({ message: 'startDate must be a valid date' })
  @ApiProperty({ example: '2023-01-01', description: 'Start date of job' })
  startDate: Date;

  @IsNotEmpty({ message: 'End date is required' })
  @Transform(({ value }) => new Date(value))
  @IsDate({ message: 'endDate must be a valid date' })
  @IsAfter('startDate', { message: 'End date must be after start date' })
  @ApiProperty({ example: '2023-01-01', description: 'End date of job' })
  endDate: Date;

  @IsNotEmpty({ message: 'isActive is required' })
  @IsBoolean({ message: 'isActive must be a boolean' })
  @ApiProperty({ example: false, description: 'isActive of job' })
  isActive: boolean;
}
