import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteFileDto {
  @IsNotEmpty({ message: 'Tên tệp là bắt buộc' })
  @IsString({ message: 'Tên tệp phải là chuỗi' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Tên tệp chỉ được chứa chữ, số, dấu chấm, dấu gạch ngang và dấu gạch dưới',
  })
  @ApiProperty({ example: 'logo-1704067200000.png', description: 'Name of the file to delete' })
  fileName: string;

  @IsNotEmpty({ message: 'Loại thư mục là bắt buộc' })
  @IsString({ message: 'Loại thư mục phải là chuỗi' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Loại thư mục chỉ được chứa chữ, số, dấu gạch ngang và dấu gạch dưới',
  })
  @ApiProperty({ example: 'company', description: 'Folder type where the file is stored' })
  folderType: string;
}
