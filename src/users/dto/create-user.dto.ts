import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import mongoose from 'mongoose';
import { CompanyDto } from 'src/companies/dto/company.dto';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @Transform(({ value }) => value.trim())
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @ApiProperty({ example: 'Quoc Duy', description: 'Name of user' })
  name: string;

  @IsEmail({}, { message: 'Email is invalid' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'duy@gmail.com', description: 'Email of user' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: '123456', description: 'Password of user' })
  password: string;

  @IsNotEmpty({ message: 'Age is required' })
  @IsNumber({}, { message: 'Age must be a number' })
  @Type(() => Number)
  @Min(18, { message: 'Age must be at least 18' })
  @Max(100, { message: 'Age must be at most 100' })
  @ApiProperty({ example: 20, description: 'Age of user' })
  age: number;

  @IsNotEmpty({ message: 'Gender is required' })
  @IsString({ message: 'Gender must be a string' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'male', description: 'Gender of user' })
  gender: string;

  @IsNotEmpty({ message: 'Address is required' })
  @IsString({ message: 'Address must be a string' })
  @MaxLength(200, { message: 'Address is too long (max: 200 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'Ha Noi', description: 'Address of user' })
  address: string;

  @IsNotEmptyObject({ nullable: true }, { message: 'Company is required' })
  @IsOptional()
  @IsObject({ message: 'Company must be an object' })
  @ValidateNested()
  @Type(() => CompanyDto)
  @ApiProperty({ type: CompanyDto, description: 'Company of user' })
  company?: CompanyDto;

  @IsNotEmpty({ message: 'Role is required' })
  @IsString({ message: 'Role must be a string' })
  @Transform(({ value }) => value.trim())
  @IsMongoId({ message: 'Role must be a valid MongoDB ObjectId' })
  role: mongoose.Schema.Types.ObjectId;
}
