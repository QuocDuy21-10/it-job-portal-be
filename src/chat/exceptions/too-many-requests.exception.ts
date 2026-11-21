import { HttpException, HttpStatus } from '@nestjs/common';
import { IChatQuotaStatus } from '../interfaces/chat-quota-status.interface';

export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class ChatQuotaExceededException extends TooManyRequestsException {
  constructor(readonly quota: IChatQuotaStatus) {
    super(
      'Bạn đã dùng hết lượt chat hôm nay. Vui lòng thử lại sau khi hạn mức được làm mới. / Daily chatbot quota exceeded. Please try again after the quota resets.',
    );
  }
}
