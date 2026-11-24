import { ERole } from 'src/casl/enums/role.enum';

export enum UploadFolderType {
  AVATAR = 'avatar',
  COMPANY = 'company',
  BANNER = 'banner',
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
  [UploadFolderType.COMPANY]: {
    folder: UploadFolderType.COMPANY,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif'],
    maxSizeBytes: 5 * 1024 * 1024,
    requiredRoles: [ERole.SUPER_ADMIN, ERole.HR],
  },
  [UploadFolderType.BANNER]: {
    folder: UploadFolderType.BANNER,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
    maxSizeBytes: 5 * 1024 * 1024,
    requiredRoles: [ERole.SUPER_ADMIN],
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

/**
 * Upload destination from the `x-folder-type` header, lowercased ('' when missing).
 * `folder_type` is still read because proxies may drop underscore headers; remove it once old FE builds are gone.
 */
export const getUploadFolderType = (
  headers: Record<string, string | string[] | undefined> | undefined,
): string => {
  const raw = headers?.['x-folder-type'] ?? headers?.folder_type;
  return typeof raw === 'string' ? raw.toLowerCase() : '';
};

/** Leading bytes of each allowed image type; `null` skips a byte (WebP's RIFF chunk size). */
const IMAGE_SIGNATURES: Readonly<Record<string, readonly (number | null)[]>> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/jpg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  // "RIFF" ???? "WEBP"
  'image/webp': [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
};

/** Number of leading bytes to read so every signature in IMAGE_SIGNATURES can be checked. */
export const IMAGE_SIGNATURE_BYTES = 12;

/** True only when the file's leading bytes are the real signature of the client-declared MIME type. */
export const matchesImageSignature = (header: Buffer, mimeType: string): boolean => {
  const signature = IMAGE_SIGNATURES[mimeType];
  return (
    !!signature &&
    header.length >= signature.length &&
    signature.every((byte, i) => byte === null || header[i] === byte)
  );
};
