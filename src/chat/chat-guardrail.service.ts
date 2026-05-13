import { BadRequestException, Injectable } from '@nestjs/common';

export interface ChatGuardrailResult {
  sanitizedMessage: string;
  flags: string[];
}

export class ChatGuardrailBlockedException extends BadRequestException {
  constructor(readonly flags: string[]) {
    super('Your message appears to contain instructions that cannot be processed by the chatbot.');
  }
}

@Injectable()
export class ChatGuardrailService {
  private readonly highRiskPatterns: Array<{ flag: string; pattern: RegExp }> = [
    {
      flag: 'ignore_previous_instructions',
      pattern: /ignore\s+(all\s+)?previous\s+(instructions?|prompts?|rules?)/i,
    },
    {
      flag: 'reveal_system_prompt',
      pattern: /(reveal|show|print|dump|expose)\s+(your\s+)?(system\s+)?prompt/i,
    },
    {
      flag: 'role_override',
      pattern: /^\s*(system|instruction|context|prompt)\s*:/i,
    },
    {
      flag: 'role_override',
      pattern: /^\s*role\s*:\s*(system|assistant|developer|admin|chatgpt)/i,
    },
    {
      flag: 'jailbreak',
      pattern: /\b(jailbreak|bypass|developer\s+mode|do\s+anything\s+now)\b/i,
    },
    {
      flag: 'instruction_override',
      pattern: /\b(disregard|override)\s+(all\s+)?(above|previous|system|rules?|instructions?)/i,
    },
  ];

  validateMessage(message: string): ChatGuardrailResult {
    const sanitizedMessage = this.sanitizeMessage(message);
    const flags = this.detectFlags(sanitizedMessage);

    if (!sanitizedMessage) {
      throw new BadRequestException('Message cannot be empty');
    }

    if (flags.length > 0) {
      throw new ChatGuardrailBlockedException(flags);
    }

    return { sanitizedMessage, flags };
  }

  inspectMessage(message: string): ChatGuardrailResult {
    const sanitizedMessage = this.sanitizeMessage(message);
    return {
      sanitizedMessage,
      flags: this.detectFlags(sanitizedMessage),
    };
  }

  private sanitizeMessage(message: string): string {
    return message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  private detectFlags(message: string): string[] {
    const flags = new Set<string>();

    for (const { flag, pattern } of this.highRiskPatterns) {
      if (pattern.test(message)) {
        flags.add(flag);
      }
    }

    return [...flags];
  }
}
