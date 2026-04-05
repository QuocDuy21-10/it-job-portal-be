import * as fs from 'fs';
import * as path from 'path';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FilesService {
  private readonly baseUrl: string;
  private readonly port: string;
  private readonly logger = new Logger(FilesService.name);

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
      throw new BadRequestException(
        'Only image files (JPEG, JPG, PNG, GIF, WEBP) are allowed for avatar',
      );
    }

    // Use filename (renamed by multer) instead of originalname
    return this.buildFileUrl('avatar', file.filename);
  }

  /**
   * Delete a file from disk.
   * @param folderType - e.g. "company", "avatar"
   * @param fileName   - just the filename, no slashes
   */
  async deleteFile(folderType: string, fileName: string): Promise<void> {
    // Security: allowlist-only characters to prevent path traversal
    const safeNamePattern = /^[a-zA-Z0-9._-]+$/;
    const safeFolderPattern = /^[a-zA-Z0-9_-]+$/;

    if (!safeNamePattern.test(fileName) || !safeFolderPattern.test(folderType)) {
      throw new BadRequestException('Invalid file name or folder type');
    }

    const baseDir = path.resolve(process.cwd(), 'public', 'images');
    const filePath = path.resolve(baseDir, folderType, fileName);

    // Defense-in-depth: ensure resolved path stays within baseDir
    if (!filePath.startsWith(baseDir + path.sep)) {
      throw new BadRequestException('Invalid file path');
    }

    try {
      await fs.promises.unlink(filePath);
      this.logger.log(`Deleted file: public/images/${folderType}/${fileName}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // Log but don't throw — callers treat deletion as best-effort
        this.logger.warn(
          `Could not delete file public/images/${folderType}/${fileName}: ${error.message}`,
        );
      }
      // ENOENT means the file is already gone — treat as success
    }
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
