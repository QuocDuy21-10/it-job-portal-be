import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import mongoose from 'mongoose';
import { ResumeStatus } from '../enums/resume-status.enum';

export class CreateResumeDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email is invalid' })
  @Type(() => String)
  @ApiProperty({ example: 'duy@gmail', description: 'Email of user' })
  email: string;

  @IsNotEmpty({ message: 'userId is required' })
  @IsMongoId({ message: 'userId must be a valid MongoDB ObjectId' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'User ID' })
  userId: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'url is required' })
  @Type(() => String)
  @ApiProperty({ example: 'https://example.com/resume.pdf', description: 'Resume URL' })
  url: string;

  @IsNotEmpty({ message: 'status is required' })
  @Type(() => String)
  @IsString({ message: 'Status must be a string' })
  @IsEnum(ResumeStatus, {
    message: `Status must be one of the following values: ${Object.values(ResumeStatus).join(', ')}`,
  })
  @ApiProperty({ example: ResumeStatus.PENDING, description: 'Status of resume' })
  status: string;

  @IsOptional()
  @IsNotEmpty({ message: 'companyId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @IsMongoId({ message: 'companyId must be a valid MongoDB ObjectId' })
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Company ID' })
  companyId?: mongoose.Schema.Types.ObjectId;

  @IsOptional()
  @IsNotEmpty({ message: 'jobId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @IsMongoId({ message: 'jobId must be a valid MongoDB ObjectId' })
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Job ID' })
  jobId?: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'histories is required' })
  @Type(() => Object)
  @ApiProperty({ type: Object, description: 'Histories of resume' })
  histories: {
    status: string;
    updatedAt: Date;
    updatedBy: {
      _id: mongoose.Schema.Types.ObjectId;
      email: string;
    };
  }[];
}

export class CreateUserCvDto {
  @IsNotEmpty({ message: 'url is required' })
  @Type(() => String)
  @ApiProperty({ example: 'https://example.com/resume.pdf', description: 'Resume URL' })
  url: string;

  @IsOptional()
  @IsNotEmpty({ message: 'companyId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Company ID' })
  @IsMongoId({ message: 'companyId must be a valid MongoDB ObjectId' })
  companyId?: mongoose.Schema.Types.ObjectId;

  @IsOptional()
  @IsNotEmpty({ message: 'jobId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Job ID' })
  @IsMongoId({ message: 'jobId must be a valid MongoDB ObjectId' })
  jobId?: mongoose.Schema.Types.ObjectId;
}
