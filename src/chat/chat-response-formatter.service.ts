import { Injectable } from '@nestjs/common';
import {
  ChatGuardrailRiskLevel,
  ChatGuardrailService,
  ChatOutputGuardrailResult,
} from './chat-guardrail.service';

@Injectable()
export class ChatResponseFormatterService {
  constructor(private readonly chatGuardrailService: ChatGuardrailService) {}

  formatAssistantOutput(output: string): ChatOutputGuardrailResult {
    const firstPass = this.chatGuardrailService.sanitizeAssistantOutput(output);
    const formattedOutput = this.normalizeMarkdown(firstPass.sanitizedOutput);
    const secondPass = this.chatGuardrailService.sanitizeAssistantOutput(formattedOutput);

    return {
      sanitizedOutput: secondPass.sanitizedOutput,
      flags: [...new Set([...firstPass.flags, ...secondPass.flags])],
      riskLevel: this.maxRisk(firstPass.riskLevel, secondPass.riskLevel),
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
