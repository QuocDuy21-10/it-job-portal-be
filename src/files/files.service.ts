import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FilesService {
  private readonly baseUrl: string;
  private readonly port: string;

  constructor(private readonly configService: ConfigService) {
    this.port = this.configService.get<string>('PORT', '8000');
    this.baseUrl = `http://localhost:${this.port}`;
  }

  /**
   * Build full URL for uploaded file
   * @param folderType - Folder type (avatar, cv, company, etc.)
   * @param fileName - File name
   * @returns Full URL
   */
  buildFileUrl(folderType: string, fileName: string): string {
    if (!fileName) {
      throw new BadRequestException('File name is required');
    }
    return `${this.baseUrl}/images/${folderType}/${fileName}`;
  }

  /**
   * Validate and process avatar file upload
   * @param file - Uploaded file
   * @returns Full avatar URL
   */
  processAvatarUpload(file: Express.Multer.File): string {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only image files (JPEG, JPG, PNG, GIF, WEBP) are allowed for avatar');
    }
    
    // Use filename (renamed by multer) instead of originalname
    return this.buildFileUrl('avatar', file.filename);
  }

  /**
   * Get file info from uploaded file
   */
  getFileInfo(file: Express.Multer.File, folderType: string = 'default') {
    return {
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      folderType,
      url: this.buildFileUrl(folderType, file.filename),
    };
  }
}
