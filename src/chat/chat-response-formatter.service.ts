import { Injectable } from '@nestjs/common';
import {
  ChatGuardrailRiskLevel,
  ChatGuardrailService,
  ChatOutputGuardrailResult,
} from './chat-guardrail.service';
import { ChatOutputTopicGuardService, TopicGuardResult } from './chat-output-topic-guard.service';

export interface FormattedAssistantOutput extends ChatOutputGuardrailResult {
  topicGuardResult?: TopicGuardResult;
}

@Injectable()
export class ChatResponseFormatterService {
  constructor(
    private readonly chatGuardrailService: ChatGuardrailService,
    private readonly chatOutputTopicGuardService: ChatOutputTopicGuardService,
  ) {}

  async formatAssistantOutput(
    output: string,
    options?: { skipTopicGuard?: boolean },
  ): Promise<FormattedAssistantOutput> {
    const firstPass = this.chatGuardrailService.sanitizeAssistantOutput(output);
    const formattedOutput = this.normalizeMarkdown(firstPass.sanitizedOutput);
    const secondPass = this.chatGuardrailService.sanitizeAssistantOutput(formattedOutput);

    let sanitizedOutput = secondPass.sanitizedOutput;
    const flags = [...new Set([...firstPass.flags, ...secondPass.flags])];
    let riskLevel = this.maxRisk(firstPass.riskLevel, secondPass.riskLevel);
    let topicGuardResult: TopicGuardResult | undefined;

    if (!options?.skipTopicGuard) {
      topicGuardResult = await this.chatOutputTopicGuardService.classify(sanitizedOutput);
      if (topicGuardResult.blocked) {
        sanitizedOutput = this.chatOutputTopicGuardService.getRefusalMessage();
        flags.push('topic_guard_blocked');
        riskLevel = ChatGuardrailRiskLevel.HIGH;
      }
    }

    return {
      sanitizedOutput,
      flags,
      riskLevel,
      topicGuardResult,
    };
  }

  private normalizeMarkdown(output: string): string {
    return output
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/([.!?])(?=\p{L})/gu, '$1 ')
      .replace(/([,;:])(?=\p{L})/gu, '$1 ')
      .replace(
        /\s+(?=(Let me know|Would you like|Do you want|Can I help|If you want|Hãy cho tôi biết|Bạn có muốn|Nếu bạn muốn|Bạn có cần|Nếu cần|Nếu bạn cần|Cho tôi biết|Hãy hỏi)\b)/iu,
        '\n\n',
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private maxRisk(
    first: ChatGuardrailRiskLevel,
    second: ChatGuardrailRiskLevel,
  ): ChatGuardrailRiskLevel {
    const score = {
      [ChatGuardrailRiskLevel.LOW]: 0,
      [ChatGuardrailRiskLevel.MEDIUM]: 1,
      [ChatGuardrailRiskLevel.HIGH]: 2,
    };

    return score[second] > score[first] ? second : first;
  }
}
