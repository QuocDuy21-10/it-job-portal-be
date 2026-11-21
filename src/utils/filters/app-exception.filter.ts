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

// Messages Nest and its libraries produce on their own (guards, passport, router, pipes).
const FRAMEWORK_MESSAGES: Array<[RegExp, (...args: string[]) => string]> = [
  [/^Forbidden( resource)?$/, () => 'Bạn không có quyền thực hiện thao tác này'],
  [/^Unauthorized$/, () => 'Bạn cần đăng nhập để tiếp tục'],
  [
    /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (.+)$/,
    (method, path) => `Không tìm thấy đường dẫn ${method} ${path}`,
  ],
  [/^Not Found$/, () => 'Không tìm thấy tài nguyên'],
  [/^Bad Request$/, () => 'Yêu cầu không hợp lệ'],
  [
    /^(ThrottlerException: )?Too Many Requests$/,
    () => 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
  ],
  [/^Payload Too Large$/, () => 'Dữ liệu gửi lên quá lớn'],
  [/^Conflict$/, () => 'Dữ liệu bị trùng'],
  [/^Unprocessable Entity$/, () => 'Dữ liệu không hợp lệ'],
  [/^Service Unavailable$/, () => 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.'],
  [/^Internal Server Error$/, () => 'Lỗi máy chủ. Vui lòng thử lại sau.'],
  [/^Validation failed \(numeric string is expected\)$/, () => 'Giá trị phải là số nguyên'],
];

export function translateFrameworkMessage(message: unknown): unknown {
  if (typeof message !== 'string') return message;
  for (const [pattern, translate] of FRAMEWORK_MESSAGES) {
    const match = pattern.exec(message);
    if (match) return translate(...match.slice(1));
  }
  return message;
}

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Tệp quá lớn',
  LIMIT_FILE_COUNT: 'Số lượng tệp vượt quá giới hạn',
  LIMIT_UNEXPECTED_FILE: 'Trường tệp không hợp lệ',
  LIMIT_PART_COUNT: 'Biểu mẫu có quá nhiều phần',
  LIMIT_FIELD_KEY: 'Tên trường quá dài',
  LIMIT_FIELD_VALUE: 'Giá trị trường quá dài',
  LIMIT_FIELD_COUNT: 'Biểu mẫu có quá nhiều trường',
};

/** Maps any thrown value to an HTTP status and a body that never leaks internals. */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    const body: Record<string, unknown> =
      typeof response === 'string' ? { message: response } : { ...(response as object) };
    body.message = translateFrameworkMessage(body.message);
    return { status: exception.getStatus(), body, capture: false };
  }

  // Matched by name/code: Nest maps multer errors by message, and multer 2 renamed
  // LIMIT_UNEXPECTED_FILE's message, so an unknown upload field escaped as a 500.
  if (exception instanceof Error && exception.name === 'MulterError') {
    const code = (exception as Error & { code?: string }).code ?? '';
    const tooLarge = code === 'LIMIT_FILE_SIZE';
    return {
      status: tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST,
      body: {
        message: MULTER_MESSAGES[code] ?? 'Tệp tải lên không hợp lệ',
        error: tooLarge ? 'Payload Too Large' : 'Bad Request',
      },
      capture: false,
    };
  }

  // body-parser throws a plain error with type 'entity.too.large' and status 413.
  const bodyParserError = exception as { type?: unknown; status?: unknown } | null;
  if (bodyParserError?.type === 'entity.too.large' || bodyParserError?.status === 413) {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      body: { message: 'Dữ liệu gửi lên quá lớn', error: 'Payload Too Large' },
      capture: false,
    };
  }

  if ((exception as { code?: unknown } | null)?.code === 11000) {
    return {
      status: HttpStatus.CONFLICT,
      body: { message: 'Dữ liệu đã tồn tại', error: 'Conflict' },
      capture: false,
    };
  }

  if (exception instanceof mongoose.Error.CastError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { message: `Giá trị của ${exception.path} không hợp lệ`, error: 'Bad Request' },
      capture: false,
    };
  }

  if (exception instanceof mongoose.Error.ValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        // Schemas define no custom messages, so Mongoose's English defaults are replaced by kind.
        message: Object.values(exception.errors).map(e =>
          e.kind === 'required' ? `${e.path} là bắt buộc` : `Giá trị của ${e.path} không hợp lệ`,
        ),
        error: 'Bad Request',
      },
      capture: false,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { message: 'Lỗi máy chủ. Vui lòng thử lại sau.', error: 'Internal Server Error' },
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
