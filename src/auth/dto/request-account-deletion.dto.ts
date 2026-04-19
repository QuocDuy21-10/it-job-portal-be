import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RequestAccountDeletionDto {
  @ApiPropertyOptional({
    description:
      'Current account password. Required for local accounts. Not required for Google OAuth accounts.',
    example: 'mySecurePassword123',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
