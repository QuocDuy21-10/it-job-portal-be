import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthEmailLoginDto } from '../dto/auth-email-login.dto';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body;
    // Validate DTO trước khi chạy Passport
    const dto = plainToClass(AuthEmailLoginDto, body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors.map(error => ({
        property: error.property,
        constraints: error.constraints,
      }));
      throw new UnauthorizedException({
        message: 'Validation failed',
        errors: messages,
      });
    }
    // Apply transformations
    request.body = dto;
    // Gọi Passport authentication
    return (await super.canActivate(context)) as boolean;
  }
}
