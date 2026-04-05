import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteFileDto {
  @IsNotEmpty({ message: 'File name is required' })
  @IsString({ message: 'File name must be a string' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'File name must contain only alphanumeric characters, dots, hyphens, and underscores',
  })
  @ApiProperty({ example: 'logo-1704067200000.png', description: 'Name of the file to delete' })
  fileName: string;

  @IsNotEmpty({ message: 'Folder type is required' })
  @IsString({ message: 'Folder type must be a string' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Folder type must contain only alphanumeric characters, hyphens, and underscores',
  })
  @ApiProperty({ example: 'company', description: 'Folder type where the file is stored' })
  folderType: string;
}
