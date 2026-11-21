import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import mongoose from 'mongoose';
import { EResumeStatus } from '../enums/resume-status.enum';

export class CreateResumeDto {
  @IsNotEmpty({ message: 'Email là bắt buộc' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @Type(() => String)
  @ApiProperty({ example: 'duy@gmail', description: 'Email of user' })
  email: string;

  @IsNotEmpty({ message: 'userId là bắt buộc' })
  @IsMongoId({ message: 'userId phải là ID hợp lệ' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'User ID' })
  userId: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'url là bắt buộc' })
  @Type(() => String)
  @ApiProperty({ example: 'https://example.com/resume.pdf', description: 'Resume URL' })
  url: string;

  @IsNotEmpty({ message: 'status là bắt buộc' })
  @Type(() => String)
  @IsString({ message: 'Trạng thái phải là chuỗi' })
  @IsEnum(EResumeStatus, {
    message: `Trạng thái phải là một trong các giá trị: ${Object.values(EResumeStatus).join(', ')}`,
  })
  @ApiProperty({ example: EResumeStatus.PENDING, description: 'Status of resume' })
  status: string;

  @IsOptional()
  @IsNotEmpty({ message: 'companyId là bắt buộc' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @IsMongoId({ message: 'companyId phải là ID hợp lệ' })
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Company ID' })
  companyId?: mongoose.Schema.Types.ObjectId;

  @IsOptional()
  @IsNotEmpty({ message: 'jobId là bắt buộc' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @IsMongoId({ message: 'jobId phải là ID hợp lệ' })
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Job ID' })
  jobId?: mongoose.Schema.Types.ObjectId;

  @IsNotEmpty({ message: 'histories là bắt buộc' })
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
  @IsNotEmpty({ message: 'url là bắt buộc' })
  @Type(() => String)
  @ApiProperty({ example: 'https://example.com/resume.pdf', description: 'Resume URL' })
  url: string;

  @IsOptional()
  @IsNotEmpty({ message: 'companyId là bắt buộc' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Company ID' })
  @IsMongoId({ message: 'companyId phải là ID hợp lệ' })
  companyId?: mongoose.Schema.Types.ObjectId;

  @IsOptional()
  @IsNotEmpty({ message: 'jobId là bắt buộc' })
  @Type(() => mongoose.Schema.Types.ObjectId)
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Job ID' })
  @IsMongoId({ message: 'jobId phải là ID hợp lệ' })
  jobId?: mongoose.Schema.Types.ObjectId;
}
