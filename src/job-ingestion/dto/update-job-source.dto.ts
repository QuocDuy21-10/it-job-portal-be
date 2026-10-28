import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { EJobSourceDisplayPolicy } from '../enums/job-source-display-policy.enum';

export class UpdateJobSourceDto {
  @ApiProperty({ required: false, description: 'Whether the source is crawled' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, enum: EJobSourceDisplayPolicy })
  @IsOptional()
  @IsEnum(EJobSourceDisplayPolicy)
  displayPolicy?: EJobSourceDisplayPolicy;
}
