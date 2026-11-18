import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsAccountPassword } from 'src/utils/decorators/is-account-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ example: '123456', description: 'Current password' })
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewP@ss123', description: 'New password' })
  @IsAccountPassword()
  newPassword: string;
}
