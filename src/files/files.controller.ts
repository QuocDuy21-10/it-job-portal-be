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
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateFileDto } from './dto/create-file.dto';
import { HttpExceptionFilter } from 'src/core/http-exception.filter';

@ApiTags('File')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @SkipCheckPermission()
  @ApiOperation({ summary: 'Upload single file (optionally specify folder_type in headers)' })
  @ResponseMessage('Upload single file')
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new HttpExceptionFilter())
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateFileDto })
  @ApiHeader({
    name: 'folder_type',
    description: 'Optional folder type to store file (e.g., avatar, cv, company-logo)',
    required: false,
    example: 'cv',
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully.' })
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers('folder_type') folderType?: string,
  ) {
    return {
      fileName: file.filename,
      fileNameOriginal: file.originalname,
      folderType: folderType || 'default',
    };
  }
}
