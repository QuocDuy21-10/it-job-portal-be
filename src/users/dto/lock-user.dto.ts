import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LockUserDto {
  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi' })
  @MaxLength(500, { message: 'Lý do quá dài (tối đa 500 ký tự)' })
  @ApiPropertyOptional({
    example: 'Violated community guidelines',
    description: 'Reason for locking the account',
  })
  reason?: string;
}
