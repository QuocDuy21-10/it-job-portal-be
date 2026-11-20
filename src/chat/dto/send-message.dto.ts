import { ApiProperty } from '@nestjs/swagger';
import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'User message to AI career advisor',
    example: 'Tôi nên học skill gì để trở thành Senior Backend Engineer?',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MinLength(1, { message: 'Message must be at least 1 character' })
  @MaxLength(1000, { message: 'Message cannot exceed 1000 characters' })
  message: string;

  @ApiProperty({
    description: 'Optional job ID for job-specific Q&A or CV-job matching',
    example: '507f1f77bcf86cd799439011',
    required: false,
  })
  @IsOptional()
  @IsMongoId({ message: 'jobId must be a valid MongoDB ObjectId' })
  jobId?: string;

  @ApiProperty({
    description:
      'Client-generated id of this message; a repeat within 5 minutes is rejected as a duplicate',
    example: '3f1c2b8e-9a4d-4c1e-8f2a-1b2c3d4e5f60',
    required: false,
  })
  @IsOptional()
  @IsUUID('all', { message: 'clientMessageId must be a UUID' })
  clientMessageId?: string;
}
