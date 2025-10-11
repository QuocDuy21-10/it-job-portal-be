import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  name: string;

  @IsNotEmpty({ message: 'Skill is required' })
  @IsArray({ message: 'Skill must be an array' })
  @ArrayMinSize(1, { message: 'At least one skill is required' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  skill: string[];

  @IsNotEmptyObject({ nullable: true }, { message: 'Company is required' })
  @IsObject({ message: 'Company must be an object' })
  @ValidateNested()
  @Type(() => Company)
  company: Company;

  @IsNotEmpty({ message: 'Location is required' })
  @IsString({ message: 'Location must be a string' })
  @MaxLength(200, { message: 'Location is too long (max: 200 chars)' })
  location: string;

  @IsNotEmpty({ message: 'Salary is required' })
  @IsNumber({}, { message: 'Salary must be a number' })
  @IsPositive({ message: 'Salary must be greater than 0' })
  salary: number;

  @IsNotEmpty({ message: 'Quantity is required' })
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1000, { message: 'Quantity is too large (max: 1000)' })
  quantity: number;

  @IsNotEmpty({ message: 'Level is required' })
  @IsString({ message: 'Level must be a string' })
  @MaxLength(50, { message: 'Level is too long (max: 50 chars)' })
  level: string;

  @IsNotEmpty({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  @MaxLength(2000, { message: 'Description is too long (max: 2000 chars)' })
  description: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @Transform(({ value }) => new Date(value))
  startDate: Date;

  @IsNotEmpty({ message: 'End date is required' })
  @Transform(({ value }) => new Date(value))
  @IsAfter('startDate', { message: 'End date must be after start date' })
  endDate: Date;

  @IsNotEmpty({ message: 'isActive is required' })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive: boolean;
}
