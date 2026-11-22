import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';

export class ResendCodeDto {
  @ApiProperty({ example: 'user@gmail.com', description: 'Email of the account to verify' })
  @IsNotEmpty()
  @IsEmail()
  @Transform(lowerCaseTransformer)
  email: string;
}
