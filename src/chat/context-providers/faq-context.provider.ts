import { Injectable } from '@nestjs/common';
import { EChatIntent } from '../enums/chat-intent.enum';
import { ChatContextService } from '../chat-context.service';
import { IntentAwareChatContext } from '../interfaces/chat-context.interface';
import { ChatContextProviderInput } from './chat-context-provider.interface';
import { EMPTY_QUERY_AWARE_CONTEXT } from './base-chat-context.provider';

const FAQ_ITEMS = [
  {
    topic: 'apply',
    keywords: ['apply', 'ung tuyen', 'nop don'],
    answer: 'Users can apply from a job detail page after creating or updating their CV profile.',
  },
  {
    topic: 'cv',
    keywords: ['cv', 'resume', 'tao cv'],
    answer: 'Users can create and update a structured CV profile before applying to jobs.',
  },
  {
    topic: 'account',
    keywords: ['account', 'login', 'dang nhap', 'dang ky'],
    answer: 'Users need an account to save profiles, apply to jobs, and keep chat history.',
  },
  {
    topic: 'job_posting',
    keywords: ['dang tin', 'post job', 'job posting'],
    answer: 'Recruiters can post jobs after their account and company permissions are approved.',
  },
];

@Injectable()
export class FaqContextProvider {
  constructor(private readonly chatContextService: ChatContextService) {}

  async build(input: ChatContextProviderInput): Promise<IntentAwareChatContext> {
    const user = await this.chatContextService.buildUserContext(input.user._id);

    return {
      intent: EChatIntent.FAQ,
      user,
      queryAware: EMPTY_QUERY_AWARE_CONTEXT,
      faq: this.resolveFaq(input.message),
      contextJobs: [],
      validJobIds: [],
    };
  }

  private resolveFaq(message: string) {
    const normalizedMessage = this.normalize(message);
    const item =
      FAQ_ITEMS.find(faq => faq.keywords.some(keyword => normalizedMessage.includes(keyword))) ??
      FAQ_ITEMS[0];

    return {
      topic: item.topic,
      answer: item.answer,
    };
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
