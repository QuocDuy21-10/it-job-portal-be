import { BadRequestException, Injectable } from '@nestjs/common';

export interface ChatGuardrailResult {
  sanitizedMessage: string;
  flags: string[];
  riskLevel: ChatGuardrailRiskLevel;
}

export interface ChatOutputGuardrailResult {
  sanitizedOutput: string;
  flags: string[];
  riskLevel: ChatGuardrailRiskLevel;
}

export enum ChatGuardrailRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class ChatGuardrailBlockedException extends BadRequestException {
  constructor(readonly flags: string[]) {
    super('Your message appears to contain instructions that cannot be processed by the chatbot.');
  }
}

@Injectable()
export class ChatGuardrailService {
  private readonly inputPatterns: Array<{
    flag: string;
    pattern: RegExp;
    riskLevel: ChatGuardrailRiskLevel;
  }> = [
    {
      flag: 'ignore_previous_instructions',
      pattern: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?)/i,
      riskLevel: ChatGuardrailRiskLevel.HIGH,
    },
    {
      flag: 'reveal_system_prompt',
      pattern: /(reveal|show|print|dump|expose)\s+(your\s+)?(system\s+)?prompt/i,
      riskLevel: ChatGuardrailRiskLevel.HIGH,
    },
    {
      flag: 'role_override',
      pattern: /^\s*(system|instruction|context|prompt)\s*:/i,
      riskLevel: ChatGuardrailRiskLevel.HIGH,
    },
    {
      flag: 'role_override',
      pattern: /^\s*role\s*:\s*(system|assistant|developer|admin|chatgpt)/i,
      riskLevel: ChatGuardrailRiskLevel.HIGH,
    },
    {
      flag: 'jailbreak',
      pattern: /\b(jailbreak|bypass|developer\s+mode|do\s+anything\s+now)\b/i,
      riskLevel: ChatGuardrailRiskLevel.HIGH,
    },
    {
      flag: 'instruction_override',
      pattern: /\b(disregard|override)\s+(all\s+)?(above|previous|system|rules?|instructions?)/i,
      riskLevel: ChatGuardrailRiskLevel.HIGH,
    },
    {
      flag: 'prompt_probe',
      pattern: /\b(system prompt|hidden instruction|developer message)\b/i,
      riskLevel: ChatGuardrailRiskLevel.MEDIUM,
    },
  ];

  validateMessage(message: string): ChatGuardrailResult {
    const sanitizedMessage = this.sanitizeMessage(message);
    const inspection = this.inspectMessage(sanitizedMessage);

    if (!sanitizedMessage) {
      throw new BadRequestException('Message cannot be empty');
    }

    if (inspection.riskLevel === ChatGuardrailRiskLevel.HIGH) {
      throw new ChatGuardrailBlockedException(inspection.flags);
    }

    return inspection;
  }

  inspectMessage(message: string): ChatGuardrailResult {
    const sanitizedMessage = this.sanitizeMessage(message);
    const matchedPatterns = this.detectInputPatterns(sanitizedMessage);

    return {
      sanitizedMessage,
      flags: matchedPatterns.map(item => item.flag),
      riskLevel: this.resolveRiskLevel(matchedPatterns.map(item => item.riskLevel)),
    };
  }

  sanitizeAssistantOutput(output: string): ChatOutputGuardrailResult {
    const flags = new Set<string>();
    let sanitizedOutput = this.sanitizeMessage(output);

    if (/<script[\s>]/i.test(sanitizedOutput) || /<\/script>/i.test(sanitizedOutput)) {
      flags.add('output_script_removed');
      sanitizedOutput = sanitizedOutput.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    }

    if (/\son[a-z]+\s*=/i.test(sanitizedOutput)) {
      flags.add('output_event_handler_removed');
      sanitizedOutput = sanitizedOutput.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
    }

    if (/javascript:/i.test(sanitizedOutput)) {
      flags.add('output_javascript_url_removed');
      sanitizedOutput = sanitizedOutput.replace(/javascript:/gi, '');
    }

    return {
      sanitizedOutput,
      flags: [...flags],
      riskLevel: flags.size > 0 ? ChatGuardrailRiskLevel.MEDIUM : ChatGuardrailRiskLevel.LOW,
    };
  }

  private sanitizeMessage(message: string): string {
    return message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  private detectInputPatterns(
    message: string,
  ): Array<{ flag: string; riskLevel: ChatGuardrailRiskLevel }> {
    const matches = new Map<string, ChatGuardrailRiskLevel>();

    for (const { flag, pattern, riskLevel } of this.inputPatterns) {
      if (pattern.test(message)) {
        matches.set(flag, this.maxRisk(matches.get(flag), riskLevel));
      }
    }

    return [...matches.entries()].map(([flag, riskLevel]) => ({ flag, riskLevel }));
  }

  private resolveRiskLevel(riskLevels: ChatGuardrailRiskLevel[]): ChatGuardrailRiskLevel {
    return riskLevels.reduce(
      (highest, current) => this.maxRisk(highest, current),
      ChatGuardrailRiskLevel.LOW,
    );
  }

  private maxRisk(
    current: ChatGuardrailRiskLevel | undefined,
    next: ChatGuardrailRiskLevel,
  ): ChatGuardrailRiskLevel {
    const score = {
      [ChatGuardrailRiskLevel.LOW]: 0,
      [ChatGuardrailRiskLevel.MEDIUM]: 1,
      [ChatGuardrailRiskLevel.HIGH]: 2,
    };

    if (!current) {
      return next;
    }

    return score[next] > score[current] ? next : current;
  }
}
