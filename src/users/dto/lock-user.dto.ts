import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LockUserDto {
  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(500, { message: 'Reason is too long (max: 500 chars)' })
  @ApiPropertyOptional({
    example: 'Violated community guidelines',
    description: 'Reason for locking the account',
  })
  reason?: string;
}
