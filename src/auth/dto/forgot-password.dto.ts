import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@gmail.com', description: 'Email to recover' })
  @IsNotEmpty()
  @IsEmail()
  @Transform(lowerCaseTransformer)
  email: string;
}
