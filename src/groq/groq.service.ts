import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
  RateLimitError,
} from 'groq-sdk';
import { IAIChatMessage } from 'src/ai/interfaces/ai-chat-message.interface';
import { IAIChatResponse } from 'src/ai/interfaces/ai-chat-response.interface';
import { AI_PROVIDER_GROQ } from 'src/ai/ai.constants';
import { IAIChatUsageMetadata } from 'src/ai/interfaces/ai-chat-usage-metadata.interface';
import { IAIChatStreamResult } from 'src/ai/interfaces/ai-chat-stream-result.interface';

const DEFAULT_GROQ_CHAT_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_GROQ_SUMMARY_MODEL = DEFAULT_GROQ_CHAT_MODEL;
const DEFAULT_GROQ_TIMEOUT_MS = 30000;
const DEFAULT_GROQ_MAX_RETRIES = 2;

interface IGroqToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface IGroqUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private readonly client: Groq | null;
  private readonly chatModelName: string;
  private readonly summaryModelName: string;
  private readonly maxCompletionTokens = 1200;
  private readonly summaryMaxCompletionTokens = 200;
  // private readonly temperature = 0.4;
  private readonly temperature = 0.7;
  private readonly summaryTemperature = 0.3;
  private readonly recommendJobsTool = {
    type: 'function' as const,
    function: {
      name: 'recommend_jobs',
      description:
        'Call this function when you want to recommend specific jobs to the user. ' +
        'Only use job IDs that appear verbatim in the YOUR MATCHING JOBS or SEARCH RESULTS sections of the prompt. ' +
        'Never fabricate or guess job IDs.',
      parameters: {
        type: 'object',
        properties: {
          jobIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of job IDs from the provided context to recommend.',
          },
        },
        required: ['jobIds'],
      },
    },
  };

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY')?.trim();
    const timeout = this.readPositiveIntConfig('GROQ_TIMEOUT_MS', DEFAULT_GROQ_TIMEOUT_MS);
    const maxRetries = this.readPositiveIntConfig('GROQ_MAX_RETRIES', DEFAULT_GROQ_MAX_RETRIES);

    this.chatModelName =
      this.configService.get<string>('GROQ_CHAT_MODEL')?.trim() || DEFAULT_GROQ_CHAT_MODEL;
    this.summaryModelName =
      this.configService.get<string>('GROQ_SUMMARY_MODEL')?.trim() || DEFAULT_GROQ_SUMMARY_MODEL;

    if (!apiKey) {
      this.client = null;
      this.logger.warn('GROQ_API_KEY is not configured. Groq chat provider will be unavailable.');
      return;
    }

    this.client = new Groq({
      apiKey,
      timeout,
      maxRetries,
    });

    this.logger.log(
      `Groq service initialized with chat model: ${this.chatModelName}, summary model: ${this.summaryModelName}`,
    );
  }

  async chatWithContext(
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
  ): Promise<IAIChatResponse> {
    const stream = this.chatWithContextStreamAndTools(message, conversationHistory, systemPrompt);
    let text = '';
    let next = await stream.next();

    while (!next.done) {
      text += next.value;
      next = await stream.next();
    }

    return {
      text,
      recommendedJobIds: next.value.recommendedJobIds,
      provider: AI_PROVIDER_GROQ,
      metadata: next.value.metadata,
    };
  }

  async *chatWithContextStreamAndTools(
    message: string,
    conversationHistory: IAIChatMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> {
    const client = this.getClient();
    const messages = this.buildChatMessages(systemPrompt, conversationHistory, message);
    const startedAt = Date.now();
    const usages: IGroqUsage[] = [];

    const firstTurn = await client.chat.completions.create(
      {
        model: this.chatModelName,
        messages,
        temperature: this.temperature,
        max_completion_tokens: this.maxCompletionTokens,
        tools: [this.recommendJobsTool],
        tool_choice: 'auto',
        parallel_tool_calls: false,
        stream: true,
      },
      { signal },
    );

    let prefaceText = '';
    const toolCallParts: IGroqToolCall[] = [];

    for await (const chunk of firstTurn) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        prefaceText += delta.content;
        yield delta.content;
      }

      for (const part of delta?.tool_calls ?? []) {
        const toolCall = (toolCallParts[part.index] ??= {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        });
        toolCall.id += part.id ?? '';
        toolCall.function.name += part.function?.name ?? '';
        toolCall.function.arguments += part.function?.arguments ?? '';
      }

      if (chunk.x_groq?.usage) {
        usages.push(chunk.x_groq.usage);
      }
    }

    const toolCalls = toolCallParts.filter(Boolean);
    if (toolCalls.length === 0) {
      if (!prefaceText) {
        throw new Error('Groq returned an empty chat response');
      }

      return this.buildStreamResult([], usages, startedAt);
    }

    const recommendedJobIds = this.extractRecommendedJobIds(toolCalls);
    const secondTurn = await client.chat.completions.create(
      {
        model: this.chatModelName,
        messages: [
          ...messages,
          { role: 'assistant', content: prefaceText || null, tool_calls: toolCalls },
          ...this.buildToolResponseMessages(toolCalls),
        ],
        temperature: this.temperature,
        max_completion_tokens: this.maxCompletionTokens,
        stream: true,
      },
      { signal },
    );

    let answerText = prefaceText;
    for await (const chunk of secondTurn) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        answerText += content;
        yield content;
      }

      if (chunk.x_groq?.usage) {
        usages.push(chunk.x_groq.usage);
      }
    }

    if (!answerText) {
      throw new Error('Groq returned an empty chat response');
    }

    return this.buildStreamResult(recommendedJobIds, usages, startedAt);
  }

  async summarizeConversation(messages: IAIChatMessage[]): Promise<string> {
    const client = this.getClient();
    const conversationText = messages.map(item => `${item.role}: ${item.content}`).join('\n\n');

    const response = await client.chat.completions.create({
      model: this.summaryModelName,
      messages: [
        {
          role: 'system',
          content:
            'You summarize career-advice conversations for context carry-over. Keep the summary factual and concise.',
        },
        {
          role: 'user',
          content:
            "Summarize this conversation in 2-3 sentences, focusing on the user's main goals, concerns, and useful follow-up context.\n\n" +
            conversationText,
        },
      ],
      temperature: this.summaryTemperature,
      max_completion_tokens: this.summaryMaxCompletionTokens,
    });

    return response.choices[0]?.message?.content?.trim() || 'Previous conversation context';
  }
  async classifyContent(systemPrompt: string, content: string): Promise<string | null> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: this.chatModelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      temperature: 0.1,
      max_completion_tokens: 80,
      response_format: { type: 'json_object' },
    });

    return response.choices[0]?.message?.content?.trim() ?? null;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getChatModelName(): string {
    return this.chatModelName;
  }

  isRateLimitError(error: unknown): boolean {
    return (
      error instanceof RateLimitError ||
      (error instanceof Error &&
        (error.message.includes('429') ||
          error.message.includes('rate limit') ||
          error.message.includes('Too Many Requests')))
    );
  }

  isFallbackEligibleError(error: unknown): boolean {
    if (error instanceof RateLimitError) {
      return true;
    }

    if (
      error instanceof APIConnectionError ||
      error instanceof APIConnectionTimeoutError ||
      error instanceof InternalServerError
    ) {
      return true;
    }

    if (error instanceof APIError) {
      // Groq answers 400 json_validate_failed when the model breaks the response schema; Gemini can still answer.
      if (error.status === 400 && error.message.includes('json_validate_failed')) {
        return true;
      }

      return typeof error.status === 'number' && error.status >= 500;
    }

    return error instanceof Error && error.message.includes('Groq');
  }

  private buildChatMessages(
    systemPrompt: string,
    conversationHistory: IAIChatMessage[],
    message: string,
  ): any[] {
    return [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory.map(item => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];
  }

  private buildToolResponseMessages(
    toolCalls: Array<{ id: string; function: { arguments: string; name: string } }>,
  ): any[] {
    return toolCalls.map(toolCall => {
      const jobIds = this.parseRecommendedJobIds(toolCall.function.arguments);

      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          status: 'accepted',
          tool: toolCall.function.name,
          count: jobIds.length,
        }),
      };
    });
  }

  private extractRecommendedJobIds(
    toolCalls: Array<{ function: { arguments: string; name: string } }>,
  ): string[] {
    const recommendedJobIds = toolCalls
      .filter(toolCall => toolCall.function.name === 'recommend_jobs')
      .flatMap(toolCall => this.parseRecommendedJobIds(toolCall.function.arguments));

    return [...new Set(recommendedJobIds)];
  }

  private parseRecommendedJobIds(argumentsJson: string): string[] {
    try {
      const parsed = JSON.parse(argumentsJson) as { jobIds?: unknown };
      if (!Array.isArray(parsed.jobIds)) {
        return [];
      }

      return parsed.jobIds.filter((jobId): jobId is string => typeof jobId === 'string');
    } catch (error) {
      this.logger.warn('Groq returned invalid tool arguments for recommend_jobs', error);
      throw new Error('Groq returned invalid tool arguments');
    }
  }

  private buildStreamResult(
    recommendedJobIds: string[],
    usages: IGroqUsage[],
    startedAt: number,
  ): IAIChatStreamResult {
    return {
      recommendedJobIds,
      provider: AI_PROVIDER_GROQ,
      model: this.chatModelName,
      metadata: this.buildUsageMetadata(usages, Date.now() - startedAt),
    };
  }

  private buildUsageMetadata(usages: IGroqUsage[], latencyMs: number): IAIChatUsageMetadata {
    const usage = usages.reduce(
      (total, item) => ({
        promptTokens: total.promptTokens + (item.prompt_tokens ?? 0),
        completionTokens: total.completionTokens + (item.completion_tokens ?? 0),
        totalTokens: total.totalTokens + (item.total_tokens ?? 0),
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );

    return {
      provider: AI_PROVIDER_GROQ,
      model: this.chatModelName,
      promptTokens: usage.promptTokens || undefined,
      completionTokens: usage.completionTokens || undefined,
      totalTokens: usage.totalTokens || undefined,
      latencyMs,
    };
  }

  private getClient(): Groq {
    if (!this.client) {
      throw new Error('Groq AI provider is not configured');
    }

    return this.client;
  }

  private readPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : fallback;

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
  }
}
