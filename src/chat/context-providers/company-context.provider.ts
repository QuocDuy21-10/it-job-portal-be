import { Injectable } from '@nestjs/common';
import { EChatIntent } from '../enums/chat-intent.enum';
import { ChatContextService } from '../chat-context.service';
import { IntentAwareChatContext } from '../interfaces/chat-context.interface';
import { ChatContextProviderInput } from './chat-context-provider.interface';
import { jobIds, uniqueJobs } from './base-chat-context.provider';

@Injectable()
export class CompanyContextProvider {
  constructor(private readonly chatContextService: ChatContextService) {}

  async build(input: ChatContextProviderInput): Promise<IntentAwareChatContext> {
    const [platform, user] = await Promise.all([
      this.chatContextService.buildPlatformContext(),
      this.chatContextService.buildUserContext(input.user._id),
    ]);
    const queryAware = await this.chatContextService.buildQueryAwareContext(
      input.message,
      platform,
    );
    const contextJobs = uniqueJobs(queryAware.detectedJobs);

    return {
      intent: EChatIntent.COMPANY_INFO,
      platform,
      user,
      queryAware,
      contextJobs,
      validJobIds: jobIds(contextJobs),
    };
  }
}
