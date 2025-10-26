import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class AuthRegisterDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name is too long (max: 100 chars)' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: 'Duy', description: 'Name of user' })
  name: string;

  @IsEmail({}, { message: 'Email is invalid' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(lowerCaseTransformer)
  @ApiProperty({ example: 'user@gmail.com', description: 'Email of user' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({ example: '123456', description: 'Password of user' })
  password: string;
}
