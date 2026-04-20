import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

export class BulkDeleteDto {
  @IsArray({ message: 'ids must be an array' })
  @ArrayMinSize(1, { message: 'At least one ID is required' })
  @ArrayMaxSize(100, { message: 'Cannot delete more than 100 records at once' })
  @IsMongoId({ each: true, message: 'Each id must be a valid MongoDB ObjectId' })
  @ApiProperty({
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    description: 'Array of MongoDB ObjectId strings to delete (max 100)',
    type: [String],
  })
  ids: string[];
}
