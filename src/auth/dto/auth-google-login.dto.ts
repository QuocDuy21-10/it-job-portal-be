import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthGoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token from frontend',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjdkMDRhOTQxOG...',
  })
  @IsNotEmpty({ message: 'ID token không được để trống' })
  @IsString({ message: 'ID token phải là chuỗi ký tự' })
  idToken: string;
}
