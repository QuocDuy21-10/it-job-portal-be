import { IsMongoId, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadCvDto {
  @IsNotEmpty({ message: 'ID tin tuyển dụng không được để trống' })
  @IsMongoId({ message: 'ID tin tuyển dụng không hợp lệ' })
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the job to apply for',
  })
  jobId: string;
}
