import {
  Controller,
  Headers,
  Post,
  Delete,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
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
import { Roles } from 'src/casl/decorators/roles.decorator';
import { ERole } from 'src/casl/enums/role.enum';
import { UploadFolderType, getUploadFolderType } from './constants/upload-policy';
import { UploadAuthGuard } from './guards/upload-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { UPLOAD_THROTTLE } from 'src/config/throttle.constants';

@ApiTags('File')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Throttle(UPLOAD_THROTTLE)
  @UseGuards(UploadAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a single file',
    description:
      `Specify the upload destination via the 'X-Folder-Type' header. ` +
      `Allowed values: ${Object.values(UploadFolderType).join(', ')}. ` +
      `Uploading to 'company' requires HR or SUPER_ADMIN role.`,
  })
  @ResponseMessage('Tải tệp lên thành công')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateFileDto })
  @ApiHeader({
    name: 'X-Folder-Type',
    description: `Upload destination folder. Allowed: ${Object.values(UploadFolderType).join(', ')}`,
    required: true,
    enum: Object.values(UploadFolderType),
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully.' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.filesService.assertImageContent(file);
    return this.filesService.getFileInfo(file, getUploadFolderType(headers));
  }

  @Delete('remove')
  // HR is excluded: files carry no owner, so HR could delete any company's logo by name.
  // Logos an HR uploads and then abandons are removed by the orphaned-logo cleanup cron.
  @Roles(ERole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete a previously uploaded file',
    description: 'Requires SUPER_ADMIN role.',
  })
  @ResponseMessage('Xoá tệp thành công')
  @ApiResponse({ status: 200, description: 'File deleted successfully.' })
  async deleteFile(@Body() deleteFileDto: DeleteFileDto) {
    await this.filesService.deleteFile(deleteFileDto.folderType, deleteFileDto.fileName);
    return { deleted: true };
  }
}
