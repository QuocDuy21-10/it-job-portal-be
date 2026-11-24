import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({ example: 'Banner Tết 2027', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'File name returned by POST /files/upload (X-Folder-Type: banner)' })
  @Matches(/^[0-9a-f-]{36}\.(jpg|png|webp)$/, { message: 'Tên tệp banner không hợp lệ' })
  fileName: string;
}
