import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyAuthDto {
  @ApiProperty({
    description: 'Email address of the user to verify',
    example: 'user@example.com',
    type: String,
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

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
