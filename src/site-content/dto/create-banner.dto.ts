import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BANNER_FILE_PATTERN, CTA_URL_PATTERN } from '../site-content.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const FILE_MESSAGE = 'Tên tệp banner không hợp lệ';

export class SlideTextDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 30, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  ctaLabel?: string | null;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    description: 'Site path ("/viec-lam") or https URL',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(CTA_URL_PATTERN, { message: 'Liên kết phải là đường dẫn bắt đầu bằng / hoặc URL https' })
  ctaUrl?: string | null;
}

export class SlideContentDto {
  @ApiProperty({ type: SlideTextDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SlideTextDto)
  vi: SlideTextDto;

  @ApiProperty({ type: SlideTextDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => SlideTextDto)
  en: SlideTextDto;
}

export class CreateBannerDto {
  @ApiProperty({ example: 'Banner Tết 2027', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'File name returned by POST /files/upload (X-Folder-Type: banner)' })
  @Matches(BANNER_FILE_PATTERN, { message: FILE_MESSAGE })
  fileName: string;

  @ApiPropertyOptional({ nullable: true, description: 'Phone image; null uses the desktop image' })
  @IsOptional()
  @Matches(BANNER_FILE_PATTERN, { message: FILE_MESSAGE })
  mobileFileName?: string | null;

  @ApiPropertyOptional({ type: SlideContentDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SlideContentDto)
  content?: SlideContentDto | null;

  @ApiPropertyOptional({ nullable: true, example: '2027-01-31T00:00:00+07:00' })
  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Exclusive end instant' })
  @IsOptional()
  @IsDateString()
  endAt?: string | null;
}
