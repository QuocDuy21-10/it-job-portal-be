import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class FollowCompanyDto {
  @ApiProperty({
    description: 'ID of the company to follow',
    example: '507f1f77bcf86cd799439011',
  })
  @IsNotEmpty({ message: 'Company ID is required' })
  @IsMongoId({ message: 'Invalid company ID format' })
  companyId: string;
}
