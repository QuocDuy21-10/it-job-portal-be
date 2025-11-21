import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@gmail.com', description: 'Email to recover' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}