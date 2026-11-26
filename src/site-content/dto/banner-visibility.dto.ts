import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class BannerVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
