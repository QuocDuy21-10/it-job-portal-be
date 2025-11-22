import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class SaveJobDto {
  @ApiProperty({
    description: 'ID of the job to save',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty({ message: 'Job ID is required' })
  @IsMongoId({ message: 'Invalid job ID format' })
  jobId: string;
}
