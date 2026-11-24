import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { BulkIdsDto } from './bulk-ids.dto';

export class RemoveCrawledJobsDto extends BulkIdsDto {
  @ApiProperty({ example: 'Nhà tuyển dụng yêu cầu gỡ', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
