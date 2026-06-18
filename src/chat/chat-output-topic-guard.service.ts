import { Injectable, Logger } from '@nestjs/common';
import { AIService } from 'src/ai/ai.service';
import { TopicGuardClassification } from 'src/ai/interfaces/topic-guard-classification.interface';

export interface TopicGuardResult {
  blocked: boolean;
  onTopic: boolean;
  category: TopicGuardClassification['category'] | null;
  reason: string;
  latencyMs: number;
}

@Injectable()
export class ChatOutputTopicGuardService {
  private readonly logger = new Logger(ChatOutputTopicGuardService.name);

  private static readonly REFUSAL_MESSAGE =
    'Xin lỗi, mình chỉ hỗ trợ tư vấn nghề nghiệp IT tại Việt Nam. ' +
    'Hãy đặt câu hỏi liên quan đến việc làm, CV, kỹ năng lập trình, phỏng vấn, hoặc thị trường IT nhé!\n\n' +
    'Sorry, I only assist with IT career advice in Vietnam. ' +
    'Please ask about jobs, CVs, technical skills, interviews, or the tech industry.';

  constructor(private readonly aiService: AIService) {}

  async classify(text: string): Promise<TopicGuardResult> {
    const startedAt = Date.now();

    try {
      const classification = await this.aiService.classifyTopic(text);

      if (!classification) {
        this.logger.warn('Topic classifier returned null — allowing response through');
        return this.buildResult(
          false,
          true,
          null,
          'classifier_unavailable',
          Date.now() - startedAt,
        );
      }

      const blocked = !classification.onTopic;

      if (blocked) {
        this.logger.warn(
          `Topic guard blocked response. Category: ${classification.category}. Reason: ${classification.reason}`,
        );
      }

      return this.buildResult(
        blocked,
        classification.onTopic,
        classification.category,
        classification.reason,
        Date.now() - startedAt,
      );
    } catch (error) {
      this.logger.error(
        'Topic guard classification threw an error — allowing response through',
        error instanceof Error ? error.stack : String(error),
      );
      return this.buildResult(false, true, null, 'classifier_error', Date.now() - startedAt);
    }
  }

  getRefusalMessage(): string {
    return ChatOutputTopicGuardService.REFUSAL_MESSAGE;
  }

  private buildResult(
    blocked: boolean,
    onTopic: boolean,
    category: TopicGuardClassification['category'] | null,
    reason: string,
    latencyMs: number,
  ): TopicGuardResult {
    return { blocked, onTopic, category, reason, latencyMs };
  }
}
