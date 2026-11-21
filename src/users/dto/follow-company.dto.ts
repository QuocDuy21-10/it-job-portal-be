import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class FollowCompanyDto {
  @ApiProperty({
    description: 'ID of the company to follow',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty({ message: 'ID công ty là bắt buộc' })
  @IsMongoId({ message: 'ID công ty không đúng định dạng' })
  companyId: string;
}
