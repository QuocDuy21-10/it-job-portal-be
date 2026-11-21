import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

export class BulkDeleteDto {
  @IsArray({ message: 'ids phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một ID' })
  @ArrayMaxSize(100, { message: 'Không thể xoá quá 100 bản ghi cùng lúc' })
  @IsMongoId({ each: true, message: 'Mỗi id phải là ID hợp lệ' })
  @ApiProperty({
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    description: 'Array of MongoDB ObjectId strings to delete (max 100)',
    type: [String],
  })
  ids: string[];
}
