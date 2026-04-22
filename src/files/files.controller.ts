import {
  Controller,
  Headers,
  Post,
  Delete,
  Body,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { ResponseMessage } from 'src/utils/decorators/response-message.decorator';
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
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Roles } from 'src/casl/decorators/roles.decorator';
import { ERole } from 'src/casl/enums/role.enum';
import { UploadAuthGuard } from './guards/upload-auth.guard';
import { UploadFolderType } from './constants/upload-policy';

@ApiTags('File')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseGuards(ThrottlerGuard, UploadAuthGuard)
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(new HttpExceptionFilter())
  @ApiOperation({
    summary: 'Upload a single file',
    description:
      `Specify the upload destination via the 'folder_type' header. ` +
      `Allowed values: ${Object.values(UploadFolderType).join(', ')}. ` +
      `Uploading to 'company' requires HR or SUPER_ADMIN role.`,
  })
  @ResponseMessage('Upload single file')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateFileDto })
  @ApiHeader({
    name: 'folder_type',
    description: `Upload destination folder. Allowed: ${Object.values(UploadFolderType).join(', ')}`,
    required: true,
    enum: Object.values(UploadFolderType),
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully.' })
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers('folder_type') folderType: string,
  ) {
    return this.filesService.getFileInfo(file, folderType);
  }

  @Delete('remove')
  @Roles(ERole.SUPER_ADMIN, ERole.HR)
  @ApiOperation({
    summary: 'Delete a previously uploaded file',
    description: 'Requires HR or SUPER_ADMIN role.',
  })
  @ResponseMessage('Delete file')
  @ApiResponse({ status: 200, description: 'File deleted successfully.' })
  async deleteFile(@Body() deleteFileDto: DeleteFileDto) {
    await this.filesService.deleteFile(deleteFileDto.folderType, deleteFileDto.fileName);
    return { deleted: true };
  }
}
