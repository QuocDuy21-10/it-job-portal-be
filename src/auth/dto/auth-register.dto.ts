import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { IsAccountPassword } from 'src/utils/decorators/is-account-password.decorator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class AuthRegisterDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @Matches(/^[a-zA-ZÀ-ỹ\s]+$/, { message: 'Name can only contain letters and spaces' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'Duy', description: 'Name of user' })
  name: string;

  @IsEmail({}, { message: 'Email is invalid' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(lowerCaseTransformer)
  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  email: string;

  @IsAccountPassword()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ApiProperty({ example: 'StrongP@ss1', description: 'Password of user' })
  password: string;

  @Equals(true, { message: 'You must accept the terms of service' })
  @ApiProperty({ example: true, description: 'Must be true: user accepted the terms of service' })
  acceptTerms: boolean;
}
