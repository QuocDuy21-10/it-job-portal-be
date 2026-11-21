import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { IsAccountPassword } from 'src/utils/decorators/is-account-password.decorator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class AuthRegisterDto {
  @IsNotEmpty({ message: 'Tên là bắt buộc' })
  @IsString({ message: 'Tên phải là chuỗi' })
  @MaxLength(100, { message: 'Tên quá dài (tối đa 100 ký tự)' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'Tên chỉ được chứa chữ cái và khoảng trắng' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'Duy', description: 'Name of user' })
  name: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email là bắt buộc' })
  @Transform(lowerCaseTransformer)
  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  email: string;

  @IsAccountPassword()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'StrongP@ss1', description: 'Password of user' })
  password: string;

  @Equals(true, { message: 'Bạn phải đồng ý với điều khoản dịch vụ' })
  @ApiProperty({ example: true, description: 'Must be true: user accepted the terms of service' })
  acceptTerms: boolean;
}
