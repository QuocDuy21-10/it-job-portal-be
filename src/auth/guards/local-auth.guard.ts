import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthEmailLoginDto } from '../dto/auth-email-login.dto';
import { translateValidationMessage } from 'src/utils/validation/vi-validation.pipe';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body;
    // Guards run before pipes, so the login DTO is validated here.
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Dữ liệu gửi lên không hợp lệ');
    }
    const dto = plainToClass(AuthEmailLoginDto, body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      // Same shape as the global ValidationPipe; constraint messages never contain submitted values.
      throw new BadRequestException(
        errors
          .flatMap(error => Object.values(error.constraints ?? {}))
          .map(translateValidationMessage),
      );
    }
    request.body = dto;
    return (await super.canActivate(context)) as boolean;
  }
}
