import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateResumeDto {
  @IsNotEmpty({ message: 'Status should not be empty' })
  @Type(() => String)
  @ApiProperty({ example: 'PENDING', description: 'Status of resume' })
  @IsString({ message: 'Status must be a string' })
  status: string;
}
