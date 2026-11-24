import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

export class BulkIdsDto {
  @ApiProperty({ type: [String], description: '1 to 100 ids' })
  @IsArray({ message: 'ids phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một ID' })
  @ArrayMaxSize(100, { message: 'Không thể xử lý quá 100 bản ghi cùng lúc' })
  @IsMongoId({ each: true, message: 'Mỗi id phải là ID hợp lệ' })
  ids: string[];
}
