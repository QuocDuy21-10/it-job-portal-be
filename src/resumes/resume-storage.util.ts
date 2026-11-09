import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

/** CV files live outside `public/` so the static file server can never expose them. */
export const RESUME_STORAGE_DIR = path.join(process.cwd(), 'storage', 'resumes');

export const RESUME_FILE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
};

/** Accepts legacy `images/resumes/<file>` urls and bare filenames; basename blocks traversal. */
export function resolveResumeFilePath(url: string): string {
  const fileName = path.basename(url ?? '');
  if (!fileName || fileName === '.' || fileName === '..') {
    throw new BadRequestException('Invalid file path');
  }
  return path.join(RESUME_STORAGE_DIR, fileName);
}
