import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ALLOWED_FOLDER_TYPES,
  UPLOAD_POLICIES,
  UploadFolderType,
  getUploadFolderType,
} from '../constants/upload-policy';
import { ERole } from 'src/casl/enums/role.enum';

@Injectable()
export class UploadAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { role?: ERole };
    }>();

    const rawFolder = getUploadFolderType(request.headers);

    if (!rawFolder || !ALLOWED_FOLDER_TYPES.includes(rawFolder)) {
      throw new BadRequestException(
        `Invalid X-Folder-Type '${rawFolder}'. Allowed values: ${ALLOWED_FOLDER_TYPES.join(', ')}`,
      );
    }

    const policy = UPLOAD_POLICIES[rawFolder as UploadFolderType];

    if (policy.requiredRoles && policy.requiredRoles.length > 0) {
      const userRole = request.user?.role;
      if (!userRole || !policy.requiredRoles.includes(userRole)) {
        throw new ForbiddenException(
          `Uploading to '${rawFolder}' requires one of the following roles: ${policy.requiredRoles.join(', ')}`,
        );
      }
    }

    return true;
  }
}
