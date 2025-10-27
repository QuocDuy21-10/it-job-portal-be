import { Res } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ResumeStatus } from '../enums/resume-status.enum';

export class UpdateResumeDto {
  @IsNotEmpty({ message: 'Status should not be empty' })
  @Type(() => String)
  @IsEnum(ResumeStatus, {
    message: `Status must be one of the following values: ${Object.values(ResumeStatus).join(', ')}`,
  })
  @ApiProperty({ example: ResumeStatus.PENDING, description: 'Status of resume' })
  @IsString({ message: 'Status must be a string' })
  status: string;
}
