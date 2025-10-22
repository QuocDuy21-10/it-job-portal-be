import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from 'src/decorator/customize';
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
    return super.canActivate(context);
  }

  handleRequest(err, user, info, context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
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

    if (!isExistPermission) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return user;
  }
}
