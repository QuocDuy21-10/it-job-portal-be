import {
  Controller,
  Headers,
  Post,
  Delete,
  Body,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { Public } from 'src/utils/decorators/public.decorator';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
import { SkipCheckPermission } from 'src/utils/decorators/skip-check-permission.decorator';
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
import { DeleteFileDto } from './dto/delete-file.dto';
import { HttpExceptionFilter } from 'src/utils/http-exception.filter';

@ApiTags('File')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Public()
  @Post('upload')
  @SkipCheckPermission()
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new HttpExceptionFilter())
  @ApiOperation({ summary: 'Upload single file (optionally specify folder_type in headers)' })
  @ResponseMessage('Upload single file')
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

  @Delete('remove')
  @SkipCheckPermission()
  @ApiOperation({ summary: 'Delete a previously uploaded file by name and folder type' })
  @ResponseMessage('Delete file')
  @ApiResponse({ status: 200, description: 'File deleted successfully.' })
  async deleteFile(@Body() deleteFileDto: DeleteFileDto) {
    await this.filesService.deleteFile(deleteFileDto.folderType, deleteFileDto.fileName);
    return { deleted: true };
  }
}
