import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsMongoId } from 'class-validator';

export class ReorderBannersDto {
  @ApiProperty({ type: [String], description: 'Every banner id exactly once, in display order' })
  @IsArray()
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  ids: string[];
}
