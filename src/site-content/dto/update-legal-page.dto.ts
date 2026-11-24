import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LEGAL_CONTENT_MAX_LENGTH } from '../site-content.constants';

export class UpdateLegalPageDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ maxLength: 300 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @ApiProperty({ maxLength: LEGAL_CONTENT_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(LEGAL_CONTENT_MAX_LENGTH)
  contentHtml: string;

  @ApiProperty({ description: 'false: shown with a draft notice and kept out of search indexes' })
  @IsBoolean()
  isPublished: boolean;
}
