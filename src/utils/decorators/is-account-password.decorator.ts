import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString, IsStrongPassword, MaxLength } from 'class-validator';

// Single password policy for every DTO that sets a password; mirrors the frontend register schema.
export const IsAccountPassword = () =>
  applyDecorators(
    IsNotEmpty({ message: 'Password is required' }),
    IsString({ message: 'Password must be a string' }),
    MaxLength(128, { message: 'Password must be at most 128 characters' }),
    IsStrongPassword(
      { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 },
      {
        message:
          'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character',
      },
    ),
  );
