import { Injectable } from '@nestjs/common';
import { EChatIntent } from '../enums/chat-intent.enum';
import { ChatContextService } from '../chat-context.service';
import { IntentAwareChatContext, UserContext } from '../interfaces/chat-context.interface';
import { ChatContextProviderInput } from './chat-context-provider.interface';
import { EMPTY_QUERY_AWARE_CONTEXT } from './base-chat-context.provider';

@Injectable()
export class CvReviewContextProvider {
  constructor(private readonly chatContextService: ChatContextService) {}

  async build(input: ChatContextProviderInput): Promise<IntentAwareChatContext> {
    const user = await this.chatContextService.buildUserContext(input.user._id);

    return {
      intent: EChatIntent.CV_REVIEW,
      user,
      queryAware: EMPTY_QUERY_AWARE_CONTEXT,
      cvReview: {
        hasProfile: Boolean(user.profile),
        missingFields: this.findMissingFields(user),
        recommendations: this.buildRecommendations(user),
      },
      contextJobs: [],
      validJobIds: [],
    };
  }

  private findMissingFields(user: UserContext): string[] {
    if (!user.profile) {
      return ['profile'];
    }

    const missingFields: string[] = [];
    if (user.profile.skills.length === 0) missingFields.push('skills');
    if (user.profile.experience.length === 0) missingFields.push('experience');
    if (user.profile.education.length === 0) missingFields.push('education');
    if (!user.profile.summary) missingFields.push('summary');
    return missingFields;
  }

  private buildRecommendations(user: UserContext): string[] {
    const recommendations: string[] = [];
    const missingFields = this.findMissingFields(user);

    if (missingFields.includes('skills')) recommendations.push('Add technical skills');
    if (missingFields.includes('experience')) recommendations.push('Add work experience');
    if (missingFields.includes('summary'))
      recommendations.push('Add a concise professional summary');
    return recommendations;
  }
}
