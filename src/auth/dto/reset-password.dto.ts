import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from 'src/utils/transformer/lower-case.transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsAccountPassword } from 'src/utils/decorators/is-account-password.decorator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received via email' })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ description: 'Email associated with the request' })
  @IsNotEmpty()
  @IsString()
  @Transform(lowerCaseTransformer)
  email: string;

  @ApiProperty({ example: 'NewP@ss123', description: 'New password' })
  @IsAccountPassword()
  newPassword: string;
}
