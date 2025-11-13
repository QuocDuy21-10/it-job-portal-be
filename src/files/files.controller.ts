import {
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { Public, ResponseMessage, SkipCheckPermission } from 'src/decorator/customize';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateFileDto } from './dto/create-file.dto';
import { DeleteFileDto } from './dto/delete-file.dto';
import { HttpExceptionFilter } from 'src/core/http-exception.filter';
import { ResourceTypeEnum } from './enums/resource-type.enum';

@ApiTags('File')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Public()
  @Post('upload')
  @SkipCheckPermission()
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new HttpExceptionFilter())
  @ApiOperation({ summary: 'Upload single file to Cloudinary' })
  @ResponseMessage('Upload single file')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateFileDto })
  @ApiHeader({
    name: 'folder_type',
    description: 'Folder to store file on Cloudinary (e.g., cvs, avatars, company-logos)',
    required: false,
    example: 'cvs',
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully to Cloudinary.' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers('folder_type') folderType?: string,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    // Upload file lên Cloudinary
    const folder = folderType || 'default';
    const result = await this.filesService.uploadToCloudinary(file, folder);

    return {
      url: result.secure_url, 
      publicId: result.public_id, 
      folder: folder,
      format: result.format,
      resourceType: result.resource_type,
      bytes: result.bytes,
      width: result.width, 
      height: result.height,
      createdAt: result.created_at,
    };
  }

  @Public()
  @Post('delete')
  @SkipCheckPermission()
  @UseFilters(new HttpExceptionFilter())
  @ApiOperation({ summary: 'Delete file from Cloudinary by publicId' })
  @ResponseMessage('Delete file')
  @ApiBody({ type: DeleteFileDto })
  @ApiResponse({ status: 200, description: 'File deleted successfully from Cloudinary.' })
  async deleteFile(
    @Headers('publicid') publicId: string,
    @Headers('resourcetype') resourceType: ResourceTypeEnum = ResourceTypeEnum.RAW,
  ) {
    if (!publicId) {
      throw new Error('No publicId provided');
    }
    const result = await this.filesService.deleteFile(publicId, resourceType);
    return {
      result: result.result,
      message: 'File deleted successfully',
    };
  }
}