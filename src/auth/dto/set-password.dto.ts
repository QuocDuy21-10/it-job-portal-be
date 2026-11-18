import { ApiProperty } from '@nestjs/swagger';
import { IsAccountPassword } from 'src/utils/decorators/is-account-password.decorator';

export class SetPasswordDto {
  @ApiProperty({ example: 'NewPass@123', description: 'New password to set for the account' })
  @IsAccountPassword()
  newPassword: string;
}
