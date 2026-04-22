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
} from '../constants/upload-policy';
import { ERole } from 'src/casl/enums/role.enum';

@Injectable()
export class UploadAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { role?: { name: ERole } };
    }>();

    const rawFolder = (request.headers?.folder_type ?? '').toLowerCase();

    if (!rawFolder || !ALLOWED_FOLDER_TYPES.includes(rawFolder)) {
      throw new BadRequestException(
        `Invalid folder_type '${rawFolder}'. Allowed values: ${ALLOWED_FOLDER_TYPES.join(', ')}`,
      );
    }

    const policy = UPLOAD_POLICIES[rawFolder as UploadFolderType];

    if (policy.requiredRoles && policy.requiredRoles.length > 0) {
      const userRole = request.user?.role?.name as ERole | undefined;
      if (!userRole || !policy.requiredRoles.includes(userRole)) {
        throw new ForbiddenException(
          `Uploading to '${rawFolder}' requires one of the following roles: ${policy.requiredRoles.join(', ')}`,
        );
      }
    }

    return true;
  }
}
