import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { MulterModuleOptions, MulterOptionsFactory } from '@nestjs/platform-express';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  ALLOWED_FOLDER_TYPES,
  MIME_TO_EXT,
  UPLOAD_POLICIES,
  UploadFolderType,
} from './constants/upload-policy';

@Injectable()
export class MulterConfigService implements MulterOptionsFactory {
  private readonly logger = new Logger(MulterConfigService.name);

  createMulterOptions(): MulterModuleOptions {
    return {
      storage: diskStorage({
        destination: (req, file, cb) => {
          // folder_type has already been validated by UploadAuthGuard and fileFilter;
          // validate here again as defense-in-depth before touching the filesystem.
          const rawFolder = (req?.headers?.folder_type as string | undefined)?.toLowerCase() ?? '';

          if (!rawFolder || !ALLOWED_FOLDER_TYPES.includes(rawFolder)) {
            return cb(
              new HttpException(
                `Invalid folder_type. Allowed values: ${ALLOWED_FOLDER_TYPES.join(', ')}`,
                HttpStatus.BAD_REQUEST,
              ),
              '',
            );
          }

          const uploadPath = path.join(process.cwd(), 'public', 'images', rawFolder);

          try {
            fs.mkdirSync(uploadPath, { recursive: true });
          } catch (err) {
            this.logger.error(
              `Failed to create upload directory '${uploadPath}': ${(err as Error).message}`,
            );
            return cb(
              new HttpException(
                'Upload directory could not be created',
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
              '',
            );
          }

          cb(null, uploadPath);
        },

        filename: (_req, file, cb) => {
          const ext = MIME_TO_EXT[file.mimetype] ?? path.extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),

      fileFilter: (req, file, cb) => {
        const rawFolder = (req?.headers?.folder_type as string | undefined)?.toLowerCase() ?? '';
        const policy = rawFolder ? UPLOAD_POLICIES[rawFolder as UploadFolderType] : undefined;

        if (!policy) {
          return cb(
            new HttpException(
              `Invalid folder_type. Allowed values: ${ALLOWED_FOLDER_TYPES.join(', ')}`,
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }

        const fileExtension = (file.originalname.split('.').pop() ?? '').toLowerCase();
        const isMimeAllowed = (policy.allowedMimeTypes as string[]).includes(file.mimetype);
        const isExtAllowed = (policy.allowedExtensions as string[]).includes(fileExtension);

        if (!isMimeAllowed || !isExtAllowed) {
          return cb(
            new HttpException(
              `Invalid file type for '${rawFolder}'. Allowed extensions: ${policy.allowedExtensions.join(', ')}`,
              HttpStatus.UNPROCESSABLE_ENTITY,
            ),
            false,
          );
        }

        cb(null, true);
      },

      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
      },
    };
  }
}
