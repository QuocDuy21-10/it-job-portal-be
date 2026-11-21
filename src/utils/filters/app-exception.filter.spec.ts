import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import mongoose from 'mongoose';
import {
  AppExceptionFilter,
  toErrorResponse,
  translateFrameworkMessage,
} from './app-exception.filter';

// Keep the real module so '@sentry/nestjs/setup' still loads; only stub captureException.
jest.mock('@sentry/nestjs', () => ({
  ...jest.requireActual('@sentry/nestjs'),
  captureException: jest.fn(),
}));

function httpHost(headersSent = false) {
  const res = {
    headersSent,
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
  };
  const req = { id: 'req-1' };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('translateFrameworkMessage', () => {
  it.each([
    ['Forbidden resource', 'Bạn không có quyền thực hiện thao tác này'],
    ['Forbidden', 'Bạn không có quyền thực hiện thao tác này'],
    ['Unauthorized', 'Bạn cần đăng nhập để tiếp tục'],
    ['Cannot GET /api/v1/nope', 'Không tìm thấy đường dẫn GET /api/v1/nope'],
    ['Not Found', 'Không tìm thấy tài nguyên'],
    ['ThrottlerException: Too Many Requests', 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'],
    ['Validation failed (numeric string is expected)', 'Giá trị phải là số nguyên'],
  ])('%s', (input, expected) => {
    expect(translateFrameworkMessage(input)).toBe(expected);
  });

  it('leaves other messages and message arrays alone', () => {
    expect(translateFrameworkMessage('Không tìm thấy công ty')).toBe('Không tìm thấy công ty');
    expect(translateFrameworkMessage(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('is applied to Nest exceptions thrown without a message', () => {
    expect(toErrorResponse(new NotFoundException()).body.message).toBe('Không tìm thấy tài nguyên');
  });
});

describe('toErrorResponse', () => {
  const multerError = (code: string, message: string) =>
    Object.assign(new Error(message), { name: 'MulterError', code });

  it('maps an unexpected upload field (multer 2 message) to 400, not 500', () => {
    const { status, body, capture } = toErrorResponse(
      multerError('LIMIT_UNEXPECTED_FILE', 'Unexpected file field'),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({ message: 'Trường tệp không hợp lệ', error: 'Bad Request' });
    expect(capture).toBe(false);
  });

  it('maps an oversized upload to 413', () => {
    expect(toErrorResponse(multerError('LIMIT_FILE_SIZE', 'File too large')).status).toBe(413);
  });

  it('maps an oversized JSON body (body-parser) to 413 without capture', () => {
    const error = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
    });
    expect(toErrorResponse(error)).toMatchObject({
      status: 413,
      body: { error: 'Payload Too Large' },
      capture: false,
    });
  });

  it('keeps the HttpException body, including extra fields', () => {
    const { status, body, capture } = toErrorResponse(
      new UnauthorizedException({ message: 'Validation failed', errors: [{ property: 'email' }] }),
    );
    expect(status).toBe(401);
    expect(body).toMatchObject({ message: 'Validation failed', errors: [{ property: 'email' }] });
    expect(capture).toBe(false);
  });

  it('uses a string HttpException response as the message', () => {
    expect(toErrorResponse(new HttpException('Too many', 429)).body).toEqual({
      message: 'Too many',
    });
  });

  it('keeps validation message arrays', () => {
    const { body } = toErrorResponse(new BadRequestException(['email must be an email']));
    expect(body.message).toEqual(['email must be an email']);
  });

  it('maps Mongo duplicate key errors to 409 without leaking the key', () => {
    const error = Object.assign(new Error('E11000 duplicate key { email: "a@b.c" }'), {
      code: 11000,
      keyValue: { email: 'a@b.c' },
    });
    const { status, body, capture } = toErrorResponse(error);
    expect(status).toBe(409);
    expect(body).toEqual({ message: 'Dữ liệu đã tồn tại', error: 'Conflict' });
    expect(JSON.stringify(body)).not.toContain('a@b.c');
    expect(capture).toBe(false);
  });

  it('maps CastError to 400', () => {
    const error = new mongoose.Error.CastError('ObjectId', 'abc', '_id');
    expect(toErrorResponse(error)).toEqual({
      status: 400,
      body: { message: 'Giá trị của _id không hợp lệ', error: 'Bad Request' },
      capture: false,
    });
  });

  it('maps ValidationError to 400 with per-field messages', () => {
    const error = new mongoose.Error.ValidationError();
    error.addError(
      'name',
      new mongoose.Error.ValidatorError({
        message: 'name is required',
        path: 'name',
        type: 'required',
      }),
    );
    const { status, body } = toErrorResponse(error);
    expect(status).toBe(400);
    expect(body).toEqual({ message: ['name là bắt buộc'], error: 'Bad Request' });
  });

  it('hides unknown errors behind a generic 500 and asks for capture', () => {
    const { status, body, capture } = toErrorResponse(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(body).toEqual({
      message: 'Lỗi máy chủ. Vui lòng thử lại sau.',
      error: 'Internal Server Error',
    });
    expect(capture).toBe(true);
  });
});

describe('AppExceptionFilter', () => {
  const filter = new AppExceptionFilter();

  beforeEach(() => jest.clearAllMocks());

  it('writes the error envelope with requestId', () => {
    const { host, res } = httpHost();
    filter.catch(new NotFoundException('Job not found'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Job not found',
      error: 'Not Found',
      statusCode: 404,
      data: null,
      requestId: 'req-1',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports unknown errors to Sentry', () => {
    const { host, res } = httpHost();
    const error = new Error('boom');
    filter.catch(error, host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('only ends the response when headers were already sent', () => {
    const { host, res } = httpHost(true);
    filter.catch(new Error('mid-stream'), host);
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('delegates non-HTTP contexts to SentryGlobalFilter', () => {
    const superCatch = jest
      .spyOn(SentryGlobalFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    const host = { getType: () => 'ws' } as unknown as ArgumentsHost;
    const error = new Error('ws');
    filter.catch(error, host);
    expect(superCatch).toHaveBeenCalledWith(error, host);
    superCatch.mockRestore();
  });
});
