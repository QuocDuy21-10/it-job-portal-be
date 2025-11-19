import { IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for submitting structured CV (online CV profile)
 * User applies to a job using their pre-created CV profile
 */
export class SubmitCvOnlineDto {
  @ApiProperty({
    description: 'ID of the job to apply for',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty({ message: 'Job ID is required' })
  @IsMongoId({ message: 'Job ID must be a valid MongoDB ObjectId' })
  jobId: string;
}
