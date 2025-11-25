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
import { log } from 'console';

/**
 * JWT Access Token Guard với Permission Checking
 * 
 * Sử dụng JwtStrategy để xác thực access token từ Bearer header
 * 
 * Features:
 * - Xác thực JWT access token
 * - Hydrate user data từ DB (thông qua JwtStrategy)
 * - Kiểm tra permissions (RBAC)
 * - Hỗ trợ public routes (@Public decorator)
 * - Hỗ trợ optional auth (@OptionalAuth decorator)
 * - Hỗ trợ skip permission check (@ResponseMessage decorator với skipPermission)
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * async getProfile(@User() user: IUser) {
 *   // user đã được populate đầy đủ (name, email, role, permissions, company)
 *   return user;
 * }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Kiểm tra route có được public không
   */
  canActivate(context: ExecutionContext) {
    // Check @Public decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Check @OptionalAuth decorator
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If route is marked as OptionalAuth, always allow through
    if (isOptionalAuth) {
      return super.canActivate(context) as Promise<boolean> | boolean;
    }

    return super.canActivate(context);
  }

  /**
   * Handle request sau khi JWT được verify
   * Thực hiện permission checking (RBAC)
   */
  handleRequest(err, user, info, context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    // Check @SkipPermission decorator
    const isSkipPermission = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Check @OptionalAuth decorator
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If optional auth and no user, just return undefined (not an error)
    if (isOptionalAuth) {
      return user || undefined;
    }

    // Validate JWT authentication
    if (err || !user) {
      throw err || new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Permission checking (RBAC)
    const targetMethod = request.method;
    const targetPath = request.route?.path as string;

    const permissions = user?.permissions ?? [];
    

    // Tìm permission khớp với method và path
    let isExistPermission = permissions.find((permission) => {
      return permission.apiPath === targetPath && permission.method === targetMethod;
    });

    // Luôn cho phép truy cập các API auth (login, register, refresh, v.v.)
    if (targetPath.startsWith('/api/v1/auth')) {
      isExistPermission = true;
    }

    // Nếu không có permission và không skip → throw ForbiddenException
    if (!isExistPermission && !isSkipPermission) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập tài nguyên này. Vui lòng liên hệ admin.',
      );
    }

    return user;
  }
}
