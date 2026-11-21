import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { GeminiService } from 'src/gemini/gemini.service';
import { GroqService } from 'src/groq/groq.service';
import {
  AIProvider,
  AI_PROVIDER_GEMINI,
  AI_PROVIDER_GROQ,
  DEFAULT_AI_CHAT_FALLBACK_ENABLED,
  DEFAULT_AI_CHAT_FIRST_TOKEN_TIMEOUT_MS,
  DEFAULT_AI_CHAT_PRIMARY_PROVIDER,
  DEFAULT_AI_GROQ_HISTORY_LIMIT,
  DEFAULT_AI_GROQ_MAX_COMPANY_ITEMS,
  DEFAULT_AI_GROQ_MAX_INPUT_TOKENS,
  DEFAULT_AI_GROQ_MAX_MATCHING_JOBS,
  DEFAULT_AI_GROQ_MAX_SEARCH_RESULTS,
  DEFAULT_AI_GROQ_MAX_SUMMARY_CHARS,
  DEFAULT_AI_GROQ_MAX_TOP_COMPANIES,
  DEFAULT_AI_GROQ_MAX_TOP_SKILLS,
  DEFAULT_AI_SUMMARY_FALLBACK_ENABLED,
  DEFAULT_AI_SUMMARY_PRIMARY_PROVIDER,
} from './ai.constants';
import { IAIChatMessage } from './interfaces/ai-chat-message.interface';
import { IAIChatResponse } from './interfaces/ai-chat-response.interface';
import { IAIChatStreamResult } from './interfaces/ai-chat-stream-result.interface';
import { TopicGuardClassification } from './interfaces/topic-guard-classification.interface';

class ChatFirstTokenTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Chat provider first token timeout after ${timeoutMs}ms`);
  }
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly chatPrimaryProvider: AIProvider;
  private readonly summaryPrimaryProvider: AIProvider;
  private readonly isChatFallbackEnabled: boolean;
  private readonly isSummaryFallbackEnabled: boolean;
  private readonly chatFirstTokenTimeoutMs: number;
  private readonly groqHistoryLimit: number;
  private readonly groqMaxInputTokens: number;
  private readonly groqMaxMatchingJobs: number;
  private readonly groqMaxSearchResults: number;
  private readonly groqMaxCompanyItems: number;
  private readonly groqMaxTopSkills: number;
  private readonly groqMaxTopCompanies: number;
  private readonly groqSummaryMaxChars: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly groqService: GroqService,
  ) {
    this.chatPrimaryProvider = this.readProviderConfig(
      'AI_CHAT_PRIMARY_PROVIDER',
      DEFAULT_AI_CHAT_PRIMARY_PROVIDER,
    );
    this.summaryPrimaryProvider = this.readProviderConfig(
      'AI_SUMMARY_PRIMARY_PROVIDER',
      DEFAULT_AI_SUMMARY_PRIMARY_PROVIDER,
    );
    this.isChatFallbackEnabled = this.readBooleanConfig(
      'AI_CHAT_GEMINI_FALLBACK_ENABLED',
      DEFAULT_AI_CHAT_FALLBACK_ENABLED,
    );
    this.isSummaryFallbackEnabled = this.readBooleanConfig(
      'AI_SUMMARY_GEMINI_FALLBACK_ENABLED',
      DEFAULT_AI_SUMMARY_FALLBACK_ENABLED,
    );
    this.chatFirstTokenTimeoutMs = this.readOptionalPositiveIntConfig(
      'AI_CHAT_FIRST_TOKEN_TIMEOUT_MS',
      DEFAULT_AI_CHAT_FIRST_TOKEN_TIMEOUT_MS,
    );
    this.groqHistoryLimit = this.readRequiredPositiveIntConfig(
      'AI_GROQ_HISTORY_LIMIT',
      DEFAULT_AI_GROQ_HISTORY_LIMIT,
    );
    this.groqMaxInputTokens = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_INPUT_TOKENS',
      DEFAULT_AI_GROQ_MAX_INPUT_TOKENS,
    );
    this.groqMaxMatchingJobs = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_MATCHING_JOBS',
      DEFAULT_AI_GROQ_MAX_MATCHING_JOBS,
    );
    this.groqMaxSearchResults = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_SEARCH_RESULTS',
      DEFAULT_AI_GROQ_MAX_SEARCH_RESULTS,
    );
    this.groqMaxCompanyItems = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_COMPANY_ITEMS',
      DEFAULT_AI_GROQ_MAX_COMPANY_ITEMS,
    );
    this.groqMaxTopSkills = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_TOP_SKILLS',
      DEFAULT_AI_GROQ_MAX_TOP_SKILLS,
    );
    this.groqMaxTopCompanies = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_TOP_COMPANIES',
      DEFAULT_AI_GROQ_MAX_TOP_COMPANIES,
    );
    this.groqSummaryMaxChars = this.readRequiredPositiveIntConfig(
      'AI_GROQ_MAX_SUMMARY_CHARS',
      DEFAULT_AI_GROQ_MAX_SUMMARY_CHARS,
    );
  }

  async parseCV(cvText: string): Promise<ParsedDataDto> {
    return this.geminiService.parseCV(cvText);
  }

  async generateChat(
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
  ): Promise<IAIChatResponse> {
    const primaryProvider = this.chatPrimaryProvider;
    const preparedRequest = this.prepareChatRequest(
      primaryProvider,
      message,
      conversationHistory,
      systemPrompt,
    );

    try {
      return await this.generateChatWithProvider(
        primaryProvider,
        message,
        preparedRequest.conversationHistory,
        preparedRequest.systemPrompt,
      );
    } catch (error) {
      if (!this.shouldFallbackToGemini(primaryProvider, error, this.isChatFallbackEnabled)) {
        throw error;
      }

      this.logger.warn(
        `Primary chat provider ${primaryProvider} failed. Falling back to Gemini.`,
        error instanceof Error ? error.stack : undefined,
      );

      const fallbackResponse = await this.generateChatWithProvider(
        AI_PROVIDER_GEMINI,
        message,
        conversationHistory,
        systemPrompt,
      );

      return {
        ...fallbackResponse,
        fallbackUsed: true,
      };
    }
  }

  async *streamChat(
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> {
    const startedAt = Date.now();
    const primaryProvider = this.chatPrimaryProvider;
    const preparedRequest = this.prepareChatRequest(
      primaryProvider,
      message,
      conversationHistory,
      systemPrompt,
    );
    const primaryController = new AbortController();
    const primarySignal = signal
      ? AbortSignal.any([signal, primaryController.signal])
      : primaryController.signal;
    const primaryGenerator = this.streamChatWithProvider(
      primaryProvider,
      message,
      preparedRequest.conversationHistory,
      preparedRequest.systemPrompt,
      primarySignal,
    );

    let firstResult: IteratorResult<string, IAIChatStreamResult>;
    try {
      firstResult = await this.awaitFirstChunk(primaryGenerator, primaryController);
    } catch (error) {
      if (signal?.aborted || !this.canFallbackStream(primaryProvider, error)) {
        throw error;
      }

      this.logger.warn(
        `Primary streaming provider ${primaryProvider} failed before the first token. Falling back to Gemini.`,
        error instanceof Error ? error.message : undefined,
      );

      const fallbackGenerator = this.streamChatWithProvider(
        AI_PROVIDER_GEMINI,
        message,
        conversationHistory,
        systemPrompt,
        signal,
      );
      return yield* this.streamWithTiming(fallbackGenerator, startedAt, true);
    }

    return yield* this.streamWithTiming(primaryGenerator, startedAt, false, firstResult);
  }

  async summarizeConversation(messages: IAIChatMessage[]): Promise<string> {
    const primaryProvider = this.summaryPrimaryProvider;

    try {
      return await this.summarizeConversationWithProvider(primaryProvider, messages);
    } catch (error) {
      if (!this.shouldFallbackToGemini(primaryProvider, error, this.isSummaryFallbackEnabled)) {
        throw error;
      }

      this.logger.warn(
        `Primary summary provider ${primaryProvider} failed. Falling back to Gemini.`,
        error instanceof Error ? error.stack : undefined,
      );

      return this.summarizeConversationWithProvider(AI_PROVIDER_GEMINI, messages);
    }
  }

  estimateTokens(text: string): number {
    return this.geminiService.estimateTokens(text);
  }

  async classifyTopic(text: string): Promise<TopicGuardClassification | null> {
    const systemPrompt = [
      'You are a strict content classifier for a Vietnam IT career advisor chatbot.',
      'Determine whether the provided text is on-topic for the chatbot domain.',
      '',
      'VALID topics: IT career advice, job search, CV/resume review, interview preparation,',
      'IT skills and learning paths, salary information, company information, Vietnam tech industry,',
      'explanations of IT concepts and technologies, technical interview questions answered in words.',
      '',
      'INVALID topics: source code (HTML, CSS, JavaScript, Python, SQL, any language), creative writing,',
      'general knowledge unrelated to IT careers, harmful or offensive content.',
      '',
      'Respond ONLY with valid JSON:',
      '{"onTopic": boolean, "reason": "<under 15 words>", "category": "on_topic"|"code_generation"|"off_topic"|"harmful"}',
    ].join('\n');

    try {
      const raw = await this.groqService.classifyContent(systemPrompt, text.slice(0, 1500));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<TopicGuardClassification>;
      if (typeof parsed.onTopic !== 'boolean' || !parsed.category) {
        this.logger.warn('Topic classifier returned malformed JSON');
        return null;
      }

      return {
        onTopic: parsed.onTopic,
        reason: parsed.reason ?? '',
        category: parsed.category,
      };
    } catch (error) {
      this.logger.warn(
        'Topic classification failed',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  isRateLimitError(error: unknown): boolean {
    return this.geminiService.isRateLimitError(error) || this.groqService.isRateLimitError(error);
  }

  isServiceUnavailableError(error: unknown): boolean {
    if (this.groqService.isFallbackEligibleError(error)) {
      return true;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('unavailable') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('internal server error') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500')
    );
  }

  private async generateChatWithProvider(
    provider: AIProvider,
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
  ): Promise<IAIChatResponse> {
    if (provider === AI_PROVIDER_GROQ) {
      return this.groqService.chatWithContext(message, conversationHistory, systemPrompt);
    }

    const response = await this.geminiService.chatWithContext(
      message,
      conversationHistory,
      systemPrompt,
    );

    return {
      ...response,
      provider: AI_PROVIDER_GEMINI,
    };
  }

  private streamChatWithProvider(
    provider: AIProvider,
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> {
    if (provider === AI_PROVIDER_GROQ) {
      return this.groqService.chatWithContextStreamAndTools(
        message,
        conversationHistory,
        systemPrompt,
        signal,
      );
    }

    return this.geminiService.chatWithContextStreamAndTools(
      message,
      conversationHistory,
      systemPrompt,
      signal,
    );
  }

  private async awaitFirstChunk(
    generator: AsyncGenerator<string, IAIChatStreamResult, unknown>,
    controller: AbortController,
  ): Promise<IteratorResult<string, IAIChatStreamResult>> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ChatFirstTokenTimeoutError(this.chatFirstTokenTimeoutMs));
      }, this.chatFirstTokenTimeoutMs);
    });

    try {
      return await Promise.race([generator.next(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async *streamWithTiming(
    generator: AsyncGenerator<string, IAIChatStreamResult, unknown>,
    startedAt: number,
    fallbackUsed: boolean,
    firstResult?: IteratorResult<string, IAIChatStreamResult>,
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> {
    let result = firstResult ?? (await generator.next());
    let timeToFirstTokenMs: number | undefined;

    while (!result.done) {
      timeToFirstTokenMs ??= Date.now() - startedAt;
      yield result.value as string;
      result = await generator.next();
    }

    const streamResult = result.value;
    return {
      ...streamResult,
      ...(fallbackUsed ? { fallbackUsed: true } : {}),
      metadata: {
        ...(streamResult.metadata ?? { provider: streamResult.provider }),
        timeToFirstTokenMs,
      },
    };
  }

  private canFallbackStream(primaryProvider: AIProvider, error: unknown): boolean {
    if (error instanceof ChatFirstTokenTimeoutError) {
      return this.isChatFallbackEnabled && primaryProvider === AI_PROVIDER_GROQ;
    }

    return this.shouldFallbackToGemini(primaryProvider, error, this.isChatFallbackEnabled);
  }

  private summarizeConversationWithProvider(
    provider: AIProvider,
    messages: IAIChatMessage[],
  ): Promise<string> {
    if (provider === AI_PROVIDER_GROQ) {
      return this.groqService.summarizeConversation(messages);
    }

    return this.geminiService.summarizeConversation(messages);
  }

  private shouldFallbackToGemini(
    primaryProvider: AIProvider,
    error: unknown,
    fallbackEnabled: boolean,
  ): boolean {
    if (!fallbackEnabled || primaryProvider !== AI_PROVIDER_GROQ) {
      return false;
    }

    return this.groqService.isFallbackEligibleError(error);
  }

  private prepareChatRequest(
    provider: AIProvider,
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
  ): {
    conversationHistory: IAIChatMessage[];
    systemPrompt: string;
  } {
    if (provider !== AI_PROVIDER_GROQ) {
      return {
        conversationHistory,
        systemPrompt,
      };
    }

    let trimmedHistory = conversationHistory.slice(-this.groqHistoryLimit);
    let trimmedPrompt = systemPrompt;

    trimmedHistory = this.trimHistoryToBudget(message, trimmedHistory, trimmedPrompt);

    if (
      this.estimateChatRequestTokens(message, trimmedHistory, trimmedPrompt) <=
      this.groqMaxInputTokens
    ) {
      return {
        conversationHistory: trimmedHistory,
        systemPrompt: trimmedPrompt,
      };
    }

    trimmedPrompt = this.trimJsonSection(
      trimmedPrompt,
      'SEARCH RESULTS',
      this.groqMaxSearchResults,
    );
    trimmedPrompt = this.trimJsonSection(
      trimmedPrompt,
      'YOUR MATCHING JOBS',
      this.groqMaxMatchingJobs,
    );
    trimmedPrompt = this.trimJsonSection(
      trimmedPrompt,
      'COMPANY INFO',
      this.groqMaxCompanyItems,
      value => ({
        name: value?.name,
        address: value?.address,
        activeJobs: value?.activeJobs,
      }),
    );
    trimmedPrompt = this.trimCsvLine(trimmedPrompt, '- Top skills:', this.groqMaxTopSkills);
    trimmedPrompt = this.trimCsvLine(trimmedPrompt, '- Top companies:', this.groqMaxTopCompanies);
    trimmedPrompt = this.truncateLine(trimmedPrompt, 'PREVIOUS CONTEXT:', this.groqSummaryMaxChars);
    trimmedHistory = this.trimHistoryToBudget(message, trimmedHistory, trimmedPrompt);

    if (
      this.estimateChatRequestTokens(message, trimmedHistory, trimmedPrompt) >
      this.groqMaxInputTokens
    ) {
      trimmedPrompt = this.truncatePromptPreservingRules(trimmedPrompt);
      trimmedHistory = this.trimHistoryToBudget(message, trimmedHistory, trimmedPrompt);
    }

    if (trimmedHistory.length !== conversationHistory.length || trimmedPrompt !== systemPrompt) {
      this.logger.debug(
        `Prepared Groq-safe chat request. History: ${conversationHistory.length} -> ${trimmedHistory.length}, tokens: ${this.estimateChatRequestTokens(message, conversationHistory, systemPrompt)} -> ${this.estimateChatRequestTokens(message, trimmedHistory, trimmedPrompt)}`,
      );
    }

    return {
      conversationHistory: trimmedHistory,
      systemPrompt: trimmedPrompt,
    };
  }

  private trimHistoryToBudget(
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
  ): IAIChatMessage[] {
    const trimmedHistory = [...conversationHistory];

    while (
      trimmedHistory.length > 0 &&
      this.estimateChatRequestTokens(message, trimmedHistory, systemPrompt) >
        this.groqMaxInputTokens
    ) {
      trimmedHistory.shift();
    }

    return trimmedHistory;
  }

  private estimateChatRequestTokens(
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
  ): number {
    const historyText = conversationHistory.map(item => `${item.role}: ${item.content}`).join('\n');
    return this.estimateTokens(`${systemPrompt}\n${historyText}\n${message}`);
  }

  private trimJsonSection<T extends Record<string, unknown>>(
    prompt: string,
    label: string,
    limit: number,
    mapItem?: (item: T) => Record<string, unknown>,
  ): string {
    const pattern = new RegExp(`^${this.escapeRegExp(label)}: (.+)$`, 'm');
    const match = prompt.match(pattern);

    if (!match) {
      return prompt;
    }

    try {
      const parsed = JSON.parse(match[1]) as unknown;
      if (!Array.isArray(parsed)) {
        return prompt;
      }

      const trimmedItems = parsed.slice(0, limit).map(item => {
        if (!mapItem || !item || typeof item !== 'object') {
          return item;
        }

        return mapItem(item as T);
      });

      return prompt.replace(pattern, `${label}: ${JSON.stringify(trimmedItems)}`);
    } catch {
      return prompt;
    }
  }

  private trimCsvLine(prompt: string, prefix: string, limit: number): string {
    const pattern = new RegExp(`^${this.escapeRegExp(prefix)} (.+)$`, 'm');
    const match = prompt.match(pattern);

    if (!match || match[1] === 'N/A') {
      return prompt;
    }

    const trimmedItems = match[1].split(', ').filter(Boolean).slice(0, limit).join(', ');

    return prompt.replace(pattern, `${prefix} ${trimmedItems || 'N/A'}`);
  }

  private truncateLine(prompt: string, prefix: string, maxChars: number): string {
    const pattern = new RegExp(`^${this.escapeRegExp(prefix)}(.*)$`, 'm');
    const match = prompt.match(pattern);

    if (!match || match[1].length <= maxChars) {
      return prompt;
    }

    return prompt.replace(pattern, `${prefix} ${match[1].trim().slice(0, maxChars)}...`);
  }

  private truncatePromptPreservingRules(prompt: string): string {
    const maxChars = this.groqMaxInputTokens * 4;
    if (prompt.length <= maxChars) {
      return prompt;
    }

    const rulesMarker = '\n\nRULES:';
    const rulesIndex = prompt.indexOf(rulesMarker);
    if (rulesIndex === -1) {
      return `${prompt.slice(0, maxChars - 18)}\n[context trimmed]`;
    }

    const rulesSection = prompt.slice(rulesIndex);
    const availableHeadLength = Math.max(0, maxChars - rulesSection.length - 18);

    return `${prompt.slice(0, availableHeadLength)}\n[context trimmed]${rulesSection}`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private readProviderConfig(key: string, fallback: AIProvider): AIProvider {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (value === AI_PROVIDER_GEMINI || value === AI_PROVIDER_GROQ) {
      return value;
    }

    return fallback;
  }

  private readBooleanConfig(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (!value) {
      return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(value);
  }

  private readOptionalPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key)?.trim();
    if (!rawValue) {
      return fallback;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      throw new Error(`${key} must be a positive integer. Default: ${fallback}.`);
    }

    return parsedValue;
  }

  private readRequiredPositiveIntConfig(key: string, recommendedValue: number): number {
    const rawValue = this.configService.get<string>(key)?.trim();

    if (!rawValue) {
      throw new Error(
        `Missing required environment variable ${key}. Set it to a positive integer, for example ${recommendedValue}.`,
      );
    }

    const parsedValue = Number.parseInt(rawValue, 10);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      throw new Error(`${key} must be a positive integer. Recommended value: ${recommendedValue}.`);
    }

    return parsedValue;
  }
}
