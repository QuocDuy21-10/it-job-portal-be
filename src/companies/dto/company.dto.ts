import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import mongoose from 'mongoose';

export class CompanyDto {
  @IsNotEmpty({ message: 'Company ID is required' })
  @IsMongoId({ message: 'Company ID must be a valid MongoDB ObjectId' })
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
  })
  _id: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'Company name is required' })
  @IsString({ message: 'Company name must be a string' })
  @MaxLength(100, { message: 'Company name is too long (max: 100 chars)' })
  @Transform(({ value }) => value?.trim())
  @ApiProperty({
    example: 'Tech Corp',
    description: 'Name of the company',
    maxLength: 100,
  })
  name: string;

  @IsOptional()
  @IsString({ message: 'Company logo must be a string' })
  @ApiPropertyOptional({
    example: 'logo.png',
    description: 'URL to company logo image',
  })
  logo?: string;
}
