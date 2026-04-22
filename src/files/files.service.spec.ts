import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { FilesService } from './files.service';

jest.mock('fs', () => ({
  promises: {
    unlink: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FilesService', () => {
  let service: FilesService;
  const PORT = '8081';
  const BASE_URL = `http://localhost:${PORT}`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: string) => {
              if (key === 'PORT') return PORT;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    jest.clearAllMocks();
  });

  describe('buildFileUrl', () => {
    it('returns the correct full URL', () => {
      expect(service.buildFileUrl('avatar', 'test.jpg')).toBe(`${BASE_URL}/images/avatar/test.jpg`);
    });

    it('throws BadRequestException when fileName is empty', () => {
      expect(() => service.buildFileUrl('avatar', '')).toThrow(BadRequestException);
    });
  });

  describe('getFileInfo', () => {
    it('returns complete file metadata with URL', () => {
      const file = {
        filename: 'uuid-abc.jpg',
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 12345,
      } as Express.Multer.File;

      const result = service.getFileInfo(file, 'avatar');
      expect(result).toEqual({
        fileName: 'uuid-abc.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 12345,
        folderType: 'avatar',
        url: `${BASE_URL}/images/avatar/uuid-abc.jpg`,
      });
    });

    it('defaults folderType to "default" when not provided', () => {
      const file = {
        filename: 'uuid-abc.pdf',
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
        size: 500,
      } as Express.Multer.File;

      const result = service.getFileInfo(file);
      expect(result.folderType).toBe('default');
    });
  });

  describe('processAvatarUpload', () => {
    it('returns the avatar URL for a valid image', () => {
      const file = { filename: 'uuid-123.jpg', mimetype: 'image/jpeg' } as Express.Multer.File;
      const result = service.processAvatarUpload(file);
      expect(result).toBe(`${BASE_URL}/images/avatar/uuid-123.jpg`);
    });

    it('throws BadRequestException when no file is provided', () => {
      expect(() => service.processAvatarUpload(null as unknown as Express.Multer.File)).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for non-image MIME type', () => {
      const file = { filename: 'uuid.pdf', mimetype: 'application/pdf' } as Express.Multer.File;
      expect(() => service.processAvatarUpload(file)).toThrow(BadRequestException);
    });
  });

  describe('deleteFile', () => {
    it('deletes a valid file without throwing', async () => {
      (mockFs.promises.unlink as jest.Mock).mockResolvedValue(undefined);
      await expect(service.deleteFile('avatar', 'uuid-123.jpg')).resolves.toBeUndefined();
      expect(mockFs.promises.unlink).toHaveBeenCalled();
    });

    it('silently succeeds when the file does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
      (mockFs.promises.unlink as jest.Mock).mockRejectedValue(err);
      await expect(service.deleteFile('avatar', 'missing.jpg')).resolves.toBeUndefined();
    });

    it('throws BadRequestException for fileName with path-traversal characters', async () => {
      await expect(service.deleteFile('avatar', '../secret.txt')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockFs.promises.unlink).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for folderType with path-traversal characters', async () => {
      await expect(service.deleteFile('../../etc', 'file.jpg')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockFs.promises.unlink).not.toHaveBeenCalled();
    });

    it('does not throw (logs) when unlink fails for a non-ENOENT reason', async () => {
      const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      (mockFs.promises.unlink as jest.Mock).mockRejectedValue(err);
      await expect(service.deleteFile('avatar', 'uuid-123.jpg')).resolves.toBeUndefined();
    });
  });

  describe('cleanupOrphanedFiles', () => {
    it('deletes orphaned files older than maxAgeMs', async () => {
      const OLD_AGE_MS = 48 * 60 * 60 * 1000; // 2 days
      const now = Date.now();

      (mockFs.promises.readdir as jest.Mock).mockResolvedValue(['orphan.jpg', 'current.jpg']);
      // Set up with known mtime values per file
      (mockFs.promises.stat as jest.Mock).mockImplementation((filePath: string) =>
        Promise.resolve({
          isFile: () => true,
          mtimeMs: filePath.includes('orphan') ? now - OLD_AGE_MS : now - 1000,
        }),
      );
      (mockFs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

      const referenced = new Set(['current.jpg']);
      const result = await service.cleanupOrphanedFiles('avatar', referenced, 24 * 60 * 60 * 1000);

      expect(result.scanned).toBe(2);
      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('skips files in the referenced set regardless of age', async () => {
      const now = Date.now();
      (mockFs.promises.readdir as jest.Mock).mockResolvedValue(['logo.png']);
      (mockFs.promises.stat as jest.Mock).mockResolvedValue({
        isFile: () => true,
        mtimeMs: now - 48 * 60 * 60 * 1000,
      });

      const referenced = new Set(['logo.png']);
      const result = await service.cleanupOrphanedFiles('company', referenced);

      expect(result.deleted).toBe(0);
      expect(mockFs.promises.unlink).not.toHaveBeenCalled();
    });

    it('returns empty stats when the directory does not exist', async () => {
      const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
      (mockFs.promises.readdir as jest.Mock).mockRejectedValue(err);

      const result = await service.cleanupOrphanedFiles('avatar', new Set());
      expect(result).toEqual({ scanned: 0, deleted: 0, errors: 0 });
    });
  });

  describe('listFilesWithAge', () => {
    it('throws BadRequestException for an invalid folder type', async () => {
      await expect(service.listFilesWithAge('../traversal')).rejects.toThrow(BadRequestException);
    });

    it('returns an empty array when the directory does not exist', async () => {
      const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
      (mockFs.promises.readdir as jest.Mock).mockRejectedValue(err);
      await expect(service.listFilesWithAge('avatar')).resolves.toEqual([]);
    });

    it('returns file names with age in ms', async () => {
      const now = Date.now();
      const mtime = now - 5000;
      const dirPath = path.resolve(process.cwd(), 'public', 'images', 'avatar');

      (mockFs.promises.readdir as jest.Mock).mockResolvedValue(['file.jpg']);
      (mockFs.promises.stat as jest.Mock).mockResolvedValue({ isFile: () => true, mtimeMs: mtime });

      const result = await service.listFilesWithAge('avatar');
      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('file.jpg');
      // Allow a small tolerance for test execution time
      expect(result[0].ageInMs).toBeGreaterThanOrEqual(4900);

      // Ensure the resolved path stays within the expected directory (no traversal)
      expect(mockFs.promises.stat).toHaveBeenCalledWith(path.resolve(dirPath, 'file.jpg'));
    });
  });
});
