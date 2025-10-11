import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsMongoId, IsNotEmpty } from 'class-validator';
import mongoose from 'mongoose';

export class CreateResumeDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email is invalid' })
  email: string;

  @IsNotEmpty({ message: 'userId is required' })
  @IsMongoId({ message: 'userId must be a valid MongoDB ObjectId' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '123456789012345678901234', description: 'User ID' })
  userId: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'url is required' })
  @Type(() => String)
  @ApiProperty({ example: 'https://example.com/resume.pdf', description: 'Resume URL' })
  url: string;

  @IsNotEmpty({ message: 'status is required' })
  @Type(() => String)
  @ApiProperty({ example: 'PENDING', description: 'Status of resume' })
  status: string;

  @IsNotEmpty({ message: 'companyId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @IsMongoId({ message: 'companyId must be a valid MongoDB ObjectId' })
  @ApiProperty({ example: '123456789012345678901234', description: 'Company ID' })
  companyId: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'jobId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @IsMongoId({ message: 'jobId must be a valid MongoDB ObjectId' })
  @ApiProperty({ example: '123456789012345678901234', description: 'Job ID' })
  jobId: mongoose.Schema.Types.ObjectId;

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

  @IsNotEmpty({ message: 'companyId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '123456789012345678901234', description: 'Company ID' })
  @IsMongoId({ message: 'companyId must be a valid MongoDB ObjectId' })
  companyId: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'jobId is required' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '123456789012345678901234', description: 'Job ID' })
  @IsMongoId({ message: 'jobId must be a valid MongoDB ObjectId' })
  jobId: mongoose.Schema.Types.ObjectId;
}
