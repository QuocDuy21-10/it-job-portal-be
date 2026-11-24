import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { EJobSourceDisplayPolicy } from '../enums/job-source-display-policy.enum';
import { EJobSourceProvider } from '../enums/job-source-provider.enum';

// Board-per-company providers; a new job board needs its own adapter.
const CREATABLE_PROVIDERS = [EJobSourceProvider.GREENHOUSE, EJobSourceProvider.LEVER];

export class CreateJobSourceDto {
  @ApiProperty({ enum: CREATABLE_PROVIDERS })
  @IsIn(CREATABLE_PROVIDERS)
  provider: EJobSourceProvider;

  @ApiProperty({ example: 'axon', description: 'Board name in the Greenhouse or Lever URL' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Mã board chỉ được chứa chữ thường, số và dấu gạch ngang',
  })
  @MaxLength(100)
  boardToken: string;

  @ApiProperty({ example: 'Axon', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName: string;

  @ApiPropertyOptional({ enum: EJobSourceDisplayPolicy, default: 'LINK_ONLY' })
  @IsOptional()
  @IsEnum(EJobSourceDisplayPolicy)
  displayPolicy?: EJobSourceDisplayPolicy;
}
