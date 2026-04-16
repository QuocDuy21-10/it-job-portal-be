import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_OPTIONAL_AUTH } from 'src/utils/decorators/optional-auth.decorator';
import { IS_PUBLIC_KEY } from 'src/utils/decorators/public.decorator';

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

    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isOptionalAuth) {
      return super.canActivate(context) as Promise<boolean> | boolean;
    }

    return super.canActivate(context);
  }

  handleRequest(err, user, info, context: ExecutionContext) {
    const isOptionalAuth = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isOptionalAuth) {
      return user || undefined;
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    return user;
  }
}
