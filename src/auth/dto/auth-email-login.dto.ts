import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class AuthEmailLoginDto {
  @ApiProperty({ example: 'admin@gmail.com', description: 'Email' })
  @Transform(lowerCaseTransformer)
  @IsString({ message: 'Email must be a string' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must be a valid email' })
  email: string;

  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password is required' })
  @Transform(({ value }) => value.trim())
  @ApiProperty({
    example: '123456',
    description: 'password',
  })
  password: string;
}
