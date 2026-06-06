import { Injectable, Logger } from '@nestjs/common';
import { AIService } from 'src/ai/ai.service';
import { IUser } from 'src/users/user.interface';
import { EChatIntent } from './enums/chat-intent.enum';
import { EChatSessionType } from './enums/chat-session-type.enum';
import { IChatIntentResult } from './interfaces/chat-intent-result.interface';

interface DetectChatIntentInput {
  message: string;
  sessionType?: EChatSessionType;
  jobId?: string;
  user?: IUser;
  allowAiFallback?: boolean;
}

@Injectable()
export class ChatIntentService {
  private readonly logger = new Logger(ChatIntentService.name);
  private readonly AI_CONFIDENCE_THRESHOLD = 0.65;

  constructor(private readonly aiService: AIService) {}

  async detectIntent(input: DetectChatIntentInput): Promise<IChatIntentResult> {
    const deterministic = this.detectDeterministicIntent(input);

    if (!input.allowAiFallback || deterministic.confidence >= this.AI_CONFIDENCE_THRESHOLD) {
      return deterministic;
    }

    return this.detectIntentWithAi(input.message).catch(error => {
      this.logger.warn(
        'AI intent classification failed; using deterministic fallback',
        error instanceof Error ? error.stack : String(error),
      );
      return { ...deterministic, source: 'fallback' };
    });
  }

  private detectDeterministicIntent(input: DetectChatIntentInput): IChatIntentResult {
    const normalizedMessage = this.normalize(input.message);
    const scores = new Map<EChatIntent, number>();

    this.addKeywordScore(scores, normalizedMessage, EChatIntent.CV_REVIEW, [
      'cv',
      'resume',
      'ho so',
      'profile',
      'review',
      'gop y',
      'sua cv',
      'toi uu cv',
    ]);
    this.addKeywordScore(scores, normalizedMessage, EChatIntent.JOB_MATCHING, [
      'match',
      'matching',
      'phu hop',
      'suitability',
      'score',
      'diem',
      'so sanh',
      'hop voi job',
    ]);
    this.addKeywordScore(scores, normalizedMessage, EChatIntent.COMPANY_INFO, [
      'company',
      'cong ty',
      'employer',
      'nha tuyen dung',
      'van hoa',
      'benefit',
      'phuc loi',
    ]);
    this.addKeywordScore(scores, normalizedMessage, EChatIntent.FAQ, [
      'how to',
      'cach',
      'huong dan',
      'apply',
      'ung tuyen',
      'dang ky',
      'login',
      'policy',
      'chinh sach',
      'tao cv',
    ]);
    this.addKeywordScore(scores, normalizedMessage, EChatIntent.RECRUITER_SUPPORT, [
      'recruiter',
      'hr',
      'dang tin',
      'job posting',
      'candidate',
      'ung vien',
      'quan ly tin',
    ]);
    this.addKeywordScore(scores, normalizedMessage, EChatIntent.JOB_ADVISOR, [
      'job',
      'viec lam',
      'career',
      'nghe nghiep',
      'salary',
      'luong',
      'skill',
      'ky nang',
      'interview',
      'phong van',
    ]);

    const hasMessageSignal = scores.size > 0;
    this.applySessionBias(scores, input.sessionType);

    if (input.jobId) {
      scores.set(EChatIntent.JOB_ADVISOR, (scores.get(EChatIntent.JOB_ADVISOR) ?? 0) + 2);
      if (this.hasMatchTerms(normalizedMessage)) {
        scores.set(EChatIntent.JOB_MATCHING, (scores.get(EChatIntent.JOB_MATCHING) ?? 0) + 4);
      }
    }

    if (this.isRecruiter(input.user)) {
      scores.set(
        EChatIntent.RECRUITER_SUPPORT,
        (scores.get(EChatIntent.RECRUITER_SUPPORT) ?? 0) + 1,
      );
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const [topIntent, topScore] = ranked[0] ?? [EChatIntent.GENERAL, 0];
    const secondScore = ranked[1]?.[1] ?? 0;

    if (!topScore) {
      return this.sessionTypeFallback(input.sessionType);
    }

    if (!hasMessageSignal && input.sessionType) {
      return this.sessionTypeFallback(input.sessionType);
    }

    return {
      intent: topIntent,
      confidence: topScore === secondScore ? 0.55 : Math.min(0.95, 0.55 + topScore * 0.1),
      source: 'deterministic',
    };
  }

  private async detectIntentWithAi(message: string): Promise<IChatIntentResult> {
    const response = await this.aiService.generateChat(
      `Classify this user message: ${message}`,
      [],
      [
        'You classify chat messages for an IT recruitment chatbot.',
        'Return only JSON: {"intent":"job_advisor|company_info|cv_review|job_matching|faq|recruiter_support|general","confidence":0.0}.',
      ].join('\n'),
    );
    const parsed = this.parseAiIntent(response.text);

    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
      source: 'ai',
    };
  }

  private parseAiIntent(text: string): { intent: EChatIntent; confidence: number } {
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text.trim();
    const parsed = JSON.parse(jsonText) as { intent?: string; confidence?: number };
    const intent = Object.values(EChatIntent).find(value => value === parsed.intent);

    if (!intent) {
      throw new Error(`Unsupported AI intent: ${parsed.intent}`);
    }

    return {
      intent,
      confidence:
        typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.7,
    };
  }

  private addKeywordScore(
    scores: Map<EChatIntent, number>,
    message: string,
    intent: EChatIntent,
    keywords: string[],
  ): void {
    const hits = keywords.filter(keyword => message.includes(keyword)).length;
    if (hits > 0) {
      scores.set(intent, (scores.get(intent) ?? 0) + hits);
    }
  }

  private applySessionBias(scores: Map<EChatIntent, number>, sessionType?: EChatSessionType): void {
    const intent = this.mapSessionTypeToIntent(sessionType);
    if (intent) {
      scores.set(intent, (scores.get(intent) ?? 0) + 1);
    }
  }

  private sessionTypeFallback(sessionType?: EChatSessionType): IChatIntentResult {
    return {
      intent: this.mapSessionTypeToIntent(sessionType) ?? EChatIntent.GENERAL,
      confidence: sessionType ? 0.65 : 0.5,
      source: sessionType ? 'session_type' : 'deterministic',
    };
  }

  private mapSessionTypeToIntent(sessionType?: EChatSessionType): EChatIntent | null {
    const map: Partial<Record<EChatSessionType, EChatIntent>> = {
      [EChatSessionType.JOB_ADVISOR]: EChatIntent.JOB_ADVISOR,
      [EChatSessionType.CV_REVIEW]: EChatIntent.CV_REVIEW,
      [EChatSessionType.JOB_MATCHING]: EChatIntent.JOB_MATCHING,
      [EChatSessionType.RECRUITER_SUPPORT]: EChatIntent.RECRUITER_SUPPORT,
      [EChatSessionType.GENERAL]: EChatIntent.GENERAL,
    };

    return sessionType ? (map[sessionType] ?? null) : null;
  }

  private hasMatchTerms(message: string): boolean {
    return ['match', 'matching', 'phu hop', 'score', 'diem', 'so sanh'].some(term =>
      message.includes(term),
    );
  }

  private isRecruiter(user?: IUser): boolean {
    return user?.role === 'HR';
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
