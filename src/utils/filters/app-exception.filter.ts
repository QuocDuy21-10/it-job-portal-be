import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

interface ErrorResponse {
  status: number;
  body: Record<string, unknown>;
  capture: boolean;
}

/** Maps any thrown value to an HTTP status and a body that never leaks internals. */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const body = typeof response === 'string' ? { message: response } : { ...(response as object) };
    return { status: exception.getStatus(), body, capture: false };
  }

  if ((exception as { code?: unknown } | null)?.code === 11000) {
    return {
      status: HttpStatus.CONFLICT,
      body: { message: 'Resource already exists', error: 'Conflict' },
      capture: false,
    };
  }

  if (exception instanceof mongoose.Error.CastError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { message: `Invalid value for ${exception.path}`, error: 'Bad Request' },
      capture: false,
    };
  }

  if (exception instanceof mongoose.Error.ValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { message: Object.values(exception.errors).map(e => e.message), error: 'Bad Request' },
      capture: false,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { message: 'Internal server error', error: 'Internal Server Error' },
    capture: true,
  };
}

/** HTTP errors get one envelope `{ statusCode, message, error, data: null, requestId }`; other contexts keep Sentry's default. */
@Catch()
export class AppExceptionFilter extends SentryGlobalFilter {
  private readonly errorLogger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    if (res.headersSent) {
      // Streaming routes report errors in-band; the status line is already gone.
      res.end();
      return;
    }

    const { status, body, capture } = toErrorResponse(exception);
    if (capture) {
      Sentry.captureException(exception);
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.errorLogger.error(error.message, error.stack);
    }

    const req = http.getRequest<Request & { id?: string }>();
    res.status(status).json({ ...body, statusCode: status, data: null, requestId: req.id });
  }
}
