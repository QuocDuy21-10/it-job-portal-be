
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyAuthDto {

  @ApiProperty({
    description: 'ID của user cần xác thực (ObjectId)',
    example: '655a1b2c3d4e5f6a7b8c9d0e',
    type: String,
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  _id: string;

  @ApiProperty({
    description: 'Mã xác thực OTP được gửi qua email',
    example: '123456',
    type: String,
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  code: string;
}