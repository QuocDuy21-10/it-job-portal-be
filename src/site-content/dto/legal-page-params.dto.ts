import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { LEGAL_LOCALES, LEGAL_PAGES, LegalLocale, LegalPageKey } from '../site-content.constants';

export class LegalPageParamsDto {
  @ApiProperty({ enum: LEGAL_PAGES })
  @IsIn(LEGAL_PAGES)
  page: LegalPageKey;

  @ApiProperty({ enum: LEGAL_LOCALES })
  @IsIn(LEGAL_LOCALES)
  locale: LegalLocale;
}
