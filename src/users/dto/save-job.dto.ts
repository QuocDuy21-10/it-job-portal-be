import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class SaveJobDto {
  @ApiProperty({
    description: 'ID of the job to save',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty({ message: 'ID tin tuyển dụng là bắt buộc' })
  @IsMongoId({ message: 'ID tin tuyển dụng không đúng định dạng' })
  jobId: string;
}
