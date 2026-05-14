import { Injectable } from '@nestjs/common';
import { EChatIntent } from './enums/chat-intent.enum';
import { ChatContextService } from './chat-context.service';
import { IntentAwareChatContext } from './interfaces/chat-context.interface';
import { ChatContextProviderInput } from './context-providers/chat-context-provider.interface';
import { CompanyContextProvider } from './context-providers/company-context.provider';
import { CvReviewContextProvider } from './context-providers/cv-review-context.provider';
import { EMPTY_QUERY_AWARE_CONTEXT } from './context-providers/base-chat-context.provider';
import { FaqContextProvider } from './context-providers/faq-context.provider';
import { JobMatchingContextProvider } from './context-providers/job-matching-context.provider';
import { JobSearchContextProvider } from './context-providers/job-search-context.provider';

@Injectable()
export class ChatContextProviderRegistry {
  constructor(
    private readonly chatContextService: ChatContextService,
    private readonly jobSearchContextProvider: JobSearchContextProvider,
    private readonly companyContextProvider: CompanyContextProvider,
    private readonly cvReviewContextProvider: CvReviewContextProvider,
    private readonly jobMatchingContextProvider: JobMatchingContextProvider,
    private readonly faqContextProvider: FaqContextProvider,
  ) {}

  async build(
    intent: EChatIntent,
    input: ChatContextProviderInput,
  ): Promise<IntentAwareChatContext> {
    switch (intent) {
      case EChatIntent.JOB_ADVISOR:
        return this.jobSearchContextProvider.build(input);
      case EChatIntent.COMPANY_INFO:
        return this.companyContextProvider.build(input);
      case EChatIntent.CV_REVIEW:
        return this.cvReviewContextProvider.build(input);
      case EChatIntent.JOB_MATCHING:
        return this.jobMatchingContextProvider.build(input);
      case EChatIntent.FAQ:
        return this.faqContextProvider.build(input);
      default:
        return this.buildGeneralContext(intent, input);
    }
  }

  private async buildGeneralContext(
    intent: EChatIntent,
    input: ChatContextProviderInput,
  ): Promise<IntentAwareChatContext> {
    return {
      intent,
      user: await this.chatContextService.buildUserContext(input.user._id),
      queryAware: EMPTY_QUERY_AWARE_CONTEXT,
      contextJobs: [],
      validJobIds: [],
    };
  }
}
