import { ConflictException } from '@nestjs/common';
import {
  DUPLICATE_APPLICATION_MESSAGE,
  rethrowDuplicateApplication,
} from './duplicate-application.util';

describe('rethrowDuplicateApplication', () => {
  it('maps Mongo duplicate key errors to 409', () => {
    expect(() => rethrowDuplicateApplication({ code: 11000 })).toThrow(
      new ConflictException(DUPLICATE_APPLICATION_MESSAGE),
    );
  });

  it('rethrows other errors unchanged', () => {
    const error = new Error('boom');
    expect(() => rethrowDuplicateApplication(error)).toThrow(error);
  });
});
