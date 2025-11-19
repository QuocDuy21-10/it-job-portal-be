import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadCvDto {
  @IsNotEmpty({ message: 'Job ID should not be empty' })
  @IsMongoId({ message: 'Job ID must be a valid MongoDB ObjectId' })
  @ApiProperty({ 
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the job to apply for'
  })
  jobId: string;
}
