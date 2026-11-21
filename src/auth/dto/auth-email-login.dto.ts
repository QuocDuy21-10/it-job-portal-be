import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class AuthEmailLoginDto {
  @ApiProperty({ example: 'admin@gmail.com', description: 'Email' })
  @Transform(lowerCaseTransformer)
  @IsString({ message: 'Email phải là chuỗi' })
  @IsNotEmpty({ message: 'Email là bắt buộc' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({
    example: '123456',
    description: 'password',
  })
  password: string;
}
