import { ApiProperty } from '@nestjs/swagger';
import { ResourceTypeEnum } from '../enums/resource-type.enum';

export class DeleteFileDto {
  @ApiProperty({ description: 'Cloudinary publicId', type: String })
  publicId: string;

  @ApiProperty({
    description: 'Resource type',
    enum: ResourceTypeEnum,
    default: ResourceTypeEnum.RAW,
    required: false,
  })
  resourceType?: ResourceTypeEnum = ResourceTypeEnum.RAW;
}
