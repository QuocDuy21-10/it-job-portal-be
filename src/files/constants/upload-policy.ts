import { ERole } from 'src/casl/enums/role.enum';

export enum UploadFolderType {
  AVATAR = 'avatar',
  CV = 'cv',
  RESUMES = 'resumes',
  COMPANY = 'company',
}

export interface UploadPolicy {
  folder: UploadFolderType;
  allowedMimeTypes: readonly string[];
  allowedExtensions: readonly string[];
  maxSizeBytes: number;
  requiredRoles?: ERole[];
}

export const UPLOAD_POLICIES: Readonly<Record<UploadFolderType, UploadPolicy>> = {
  [UploadFolderType.AVATAR]: {
    folder: UploadFolderType.AVATAR,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
  [UploadFolderType.CV]: {
    folder: UploadFolderType.CV,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    allowedExtensions: ['pdf', 'doc', 'docx'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
  [UploadFolderType.RESUMES]: {
    folder: UploadFolderType.RESUMES,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    allowedExtensions: ['pdf', 'doc', 'docx', 'txt'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
  [UploadFolderType.COMPANY]: {
    folder: UploadFolderType.COMPANY,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif'],
    maxSizeBytes: 5 * 1024 * 1024,
    requiredRoles: [ERole.SUPER_ADMIN, ERole.HR],
  },
};

/** Maps MIME type → safe file extension for opaque server-side filenames. */
export const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

/** Flat list of all supported folder type strings, used for quick allowlist checks. */
export const ALLOWED_FOLDER_TYPES: readonly string[] = Object.values(UploadFolderType);
