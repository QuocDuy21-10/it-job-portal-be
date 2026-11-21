import { ConflictException } from '@nestjs/common';

export const DUPLICATE_APPLICATION_MESSAGE =
  'Bạn đã ứng tuyển vào tin tuyển dụng này. Không thể ứng tuyển lại.';

/** The unique (userId, jobId) index is the real guard; pre-checks only give a nicer fast path. */
export function rethrowDuplicateApplication(error: unknown): never {
  if ((error as { code?: number })?.code === 11000) {
    throw new ConflictException(DUPLICATE_APPLICATION_MESSAGE);
  }
  throw error;
}
