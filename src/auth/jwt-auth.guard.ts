import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_OPTIONAL_AUTH, IS_PUBLIC_KEY, IS_PUBLIC_PERMISSION } from 'src/decorator/customize';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH,
      [context.getHandler(), context.getClass()],
    );

    // If route is marked as OptionalAuth, always allow through
    if (isOptionalAuth) {
      return super.canActivate(context) as Promise<boolean> | boolean;
    }

    return super.canActivate(context);
  }

  handleRequest(err, user, info, context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    // Skip check permission
    const isSkipPermission = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH,
      [context.getHandler(), context.getClass()],
    );
    // If optional auth and no user, just return undefined (not an error)
    if (isOptionalAuth) {
      return user || undefined;
    }

    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException('Token is invalid or expired');
    }

    // check permissions
    const targetMethod = request.method;
    const targetPath = request.route?.path as string;

    const permissions = user?.permissions ?? [];

    let isExistPermission = permissions.find(permission => {
      return permission.apiPath === targetPath && permission.method === targetMethod;
    });

    if (targetPath.startsWith('/api/v1/auth')) {
      isExistPermission = true;
    }

    if (!isExistPermission && !isSkipPermission) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return user;
  }
}
