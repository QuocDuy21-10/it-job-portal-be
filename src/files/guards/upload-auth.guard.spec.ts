import { ExecutionContext, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UploadAuthGuard } from './upload-auth.guard';
import { UploadFolderType } from '../constants/upload-policy';
import { ERole } from 'src/casl/enums/role.enum';

function buildContext(folderType: string, userRole?: ERole): ExecutionContext {
  const mockRequest = {
    headers: { folder_type: folderType },
    user: userRole ? { role: { name: userRole } } : undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
  } as unknown as ExecutionContext;
}

describe('UploadAuthGuard', () => {
  let guard: UploadAuthGuard;

  beforeEach(() => {
    guard = new UploadAuthGuard();
  });

  describe('folder_type validation', () => {
    it('allows a valid user-scoped folder type for any authenticated user', () => {
      const ctx = buildContext(UploadFolderType.AVATAR, ERole.NORMAL_USER);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows cv folder for normal user', () => {
      expect(guard.canActivate(buildContext(UploadFolderType.CV, ERole.NORMAL_USER))).toBe(true);
    });

    it('allows resumes folder for normal user', () => {
      expect(guard.canActivate(buildContext(UploadFolderType.RESUMES, ERole.NORMAL_USER))).toBe(
        true,
      );
    });

    it('throws BadRequestException when folder_type is empty', () => {
      expect(() => guard.canActivate(buildContext('', ERole.NORMAL_USER))).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when folder_type is not in the allowlist', () => {
      expect(() => guard.canActivate(buildContext('../../etc', ERole.NORMAL_USER))).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for arbitrary string folder types', () => {
      expect(() => guard.canActivate(buildContext('default', ERole.NORMAL_USER))).toThrow(
        BadRequestException,
      );
    });
  });

  describe('role-restricted folder (company)', () => {
    it('allows HR to upload to company folder', () => {
      expect(guard.canActivate(buildContext(UploadFolderType.COMPANY, ERole.HR))).toBe(true);
    });

    it('allows SUPER_ADMIN to upload to company folder', () => {
      expect(guard.canActivate(buildContext(UploadFolderType.COMPANY, ERole.SUPER_ADMIN))).toBe(
        true,
      );
    });

    it('throws ForbiddenException when NORMAL_USER tries to upload to company', () => {
      expect(() =>
        guard.canActivate(buildContext(UploadFolderType.COMPANY, ERole.NORMAL_USER)),
      ).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when no user is attached to the request', () => {
      // Simulate a case where JwtAuthGuard somehow let an anonymous request through
      const mockRequest = {
        headers: { folder_type: UploadFolderType.COMPANY },
        user: undefined,
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
