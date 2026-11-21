import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString, IsStrongPassword, MaxLength } from 'class-validator';

// Single password policy for every DTO that sets a password; mirrors the frontend register schema.
export const IsAccountPassword = () =>
  applyDecorators(
    IsNotEmpty({ message: 'Mật khẩu là bắt buộc' }),
    IsString({ message: 'Mật khẩu phải là chuỗi' }),
    MaxLength(128, { message: 'Mật khẩu không được dài quá 128 ký tự' }),
    IsStrongPassword(
      { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 },
      {
        message:
          'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt',
      },
    ),
  );
