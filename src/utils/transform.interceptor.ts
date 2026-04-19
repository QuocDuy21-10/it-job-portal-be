import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE } from 'src/utils/decorators/response-message.decorator';
import { SKIP_TRANSFORM_KEY } from 'src/utils/decorators/skip-transform.decorator';

export interface Response<T> {
  statusCode: number;
  message?: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  constructor(private reflector: Reflector) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const skipTransform = this.reflector.get<boolean>(SKIP_TRANSFORM_KEY, context.getHandler());
    if (skipTransform) {
      return next.handle();
    }

    return next.handle().pipe(
      map(data => ({
        statusCode: context.switchToHttp().getResponse().statusCode,
        message: this.reflector.get<string>(RESPONSE_MESSAGE, context.getHandler()) || null,
        data: data,
      })),
    );
  }
}
