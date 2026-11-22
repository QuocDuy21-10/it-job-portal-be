import * as fs from 'fs';
import * as path from 'path';
import {
  Injectable,
  BadRequestException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMAGE_SIGNATURE_BYTES, matchesImageSignature } from './constants/upload-policy';

@Injectable()
export class FilesService {
  private readonly baseUrl: string;
  private readonly port: string;
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly configService: ConfigService) {
    this.port = this.configService.get<string>('PORT', '8000');
    // API_DOMAIN is the public host Caddy serves (set in .env.production); local dev has none.
    const apiDomain = this.configService.get<string>('API_DOMAIN');
    this.baseUrl = apiDomain ? `https://${apiDomain}` : `http://localhost:${this.port}`;
  }

  /**
   * Build full URL for uploaded file
   * @param folderType - Folder type (avatar, cv, company, etc.)
   * @param fileName - File name
   * @returns Full URL
   */
  buildFileUrl(folderType: string, fileName: string): string {
    if (!fileName) {
      throw new BadRequestException('Tên tệp là bắt buộc');
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
      throw new BadRequestException('Tệp ảnh đại diện là bắt buộc');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Ảnh đại diện chỉ chấp nhận tệp ảnh (JPEG, JPG, PNG, GIF, WEBP)',
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
      throw new BadRequestException('Tên tệp hoặc loại thư mục không hợp lệ');
    }

    const baseDir = path.resolve(process.cwd(), 'public', 'images');
    const filePath = path.resolve(baseDir, folderType, fileName);

    // Defense-in-depth: ensure resolved path stays within baseDir
    if (!filePath.startsWith(baseDir + path.sep)) {
      throw new BadRequestException('Đường dẫn tệp không hợp lệ');
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
   * Rejects an uploaded image whose bytes are not the type the client declared.
   * multer's fileFilter only sees the client-set MIME type, so this runs after the file is on disk.
   */
  async assertImageContent(file: Express.Multer.File): Promise<void> {
    if (!file) {
      throw new BadRequestException('Tệp là bắt buộc');
    }

    const header = Buffer.alloc(IMAGE_SIGNATURE_BYTES);
    const handle = await fs.promises.open(file.path, 'r');
    try {
      await handle.read(header, 0, IMAGE_SIGNATURE_BYTES, 0);
    } finally {
      await handle.close();
    }

    if (!matchesImageSignature(header, file.mimetype)) {
      await fs.promises
        .unlink(file.path)
        .catch(err =>
          this.logger.warn(`Could not delete rejected upload ${file.path}: ${err.message}`),
        );
      throw new UnprocessableEntityException('Nội dung tệp không khớp với loại tệp đã khai báo');
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

  async listFilesWithAge(
    folderType: string,
  ): Promise<Array<{ fileName: string; ageInMs: number }>> {
    const safeFolderPattern = /^[a-zA-Z0-9_-]+$/;
    if (!safeFolderPattern.test(folderType)) {
      throw new BadRequestException('Loại thư mục không hợp lệ');
    }

    const dirPath = path.resolve(process.cwd(), 'public', 'images', folderType);

    try {
      const entries = await fs.promises.readdir(dirPath);
      const now = Date.now();
      const results: Array<{ fileName: string; ageInMs: number }> = [];

      for (const entry of entries) {
        try {
          const filePath = path.resolve(dirPath, entry);
          // Skip if resolved path escapes the directory
          if (!filePath.startsWith(dirPath + path.sep)) continue;

          const stat = await fs.promises.stat(filePath);
          if (stat.isFile()) {
            results.push({ fileName: entry, ageInMs: now - stat.mtimeMs });
          }
        } catch {}
      }

      return results;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async cleanupOrphanedFiles(
    folderType: string,
    referencedFileNames: Set<string>,
    maxAgeMs: number = 24 * 60 * 60 * 1000,
  ): Promise<{ scanned: number; deleted: number; errors: number }> {
    const files = await this.listFilesWithAge(folderType);
    let deleted = 0;
    let errors = 0;

    for (const file of files) {
      // Skip files still in use or younger than the grace period
      if (referencedFileNames.has(file.fileName) || file.ageInMs < maxAgeMs) {
        continue;
      }

      try {
        await this.deleteFile(folderType, file.fileName);
        deleted++;
      } catch {
        errors++;
      }
    }

    this.logger.log(
      `Orphaned file cleanup [${folderType}]: scanned=${files.length}, deleted=${deleted}, errors=${errors}`,
    );

    return { scanned: files.length, deleted, errors };
  }
}
