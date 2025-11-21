import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received via email' })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ description: 'Email associated with the request' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ example: 'newPass123', description: 'New password' })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}