import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FunctionCallingConfigMode, GoogleGenAI, Type } from '@google/genai';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';
import { GeminiQuotaService } from './gemini-quota.service';
import { GeminiQuotaWorkload } from './gemini-quota.constants';
import { AI_PROVIDER_GEMINI } from 'src/ai/ai.constants';
import { IAIChatResponse } from 'src/ai/interfaces/ai-chat-response.interface';
import { IAIChatStreamResult } from 'src/ai/interfaces/ai-chat-stream-result.interface';
import { IAIChatUsageMetadata } from 'src/ai/interfaces/ai-chat-usage-metadata.interface';

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly ai: GoogleGenAI;

  // Model configuration
  private readonly modelName: string;
  private readonly PARSE_MAX_TOKENS = 5000;
  private readonly PARSE_TEMPERATURE = 0.3;

  // Tool declaration for job recommendations in streaming mode.
  // The model calls this instead of embedding IDs in free-form text.
  private readonly RECOMMEND_JOBS_TOOL = {
    name: 'recommend_jobs',
    description:
      'Call this function when you want to recommend specific jobs to the user. ' +
      'Only use job IDs that appear verbatim in the YOUR MATCHING JOBS or SEARCH RESULTS sections of your context. ' +
      'Never fabricate or guess job IDs.',
    parametersJsonSchema: {
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
  };

  // Chat response JSON schema — enforced at API level
  private readonly CHAT_RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'Conversational response with Markdown formatting' },
      recommendedJobIds: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Array of job IDs from provided context to recommend',
      },
    },
    required: ['text', 'recommendedJobIds'],
    propertyOrdering: ['text', 'recommendedJobIds'],
  };

  // CV parsing JSON schema — enforced at API level
  private readonly CV_PARSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      skills: { type: Type.ARRAY, items: { type: Type.STRING } },
      experience: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            company: { type: Type.STRING },
            position: { type: Type.STRING },
            duration: { type: Type.STRING },
            description: { type: Type.STRING },
          },
        },
      },
      education: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            school: { type: Type.STRING },
            degree: { type: Type.STRING },
            major: { type: Type.STRING },
            duration: { type: Type.STRING },
            gpa: { type: Type.STRING },
          },
        },
      },
      summary: { type: Type.STRING },
      yearsOfExperience: { type: Type.NUMBER },
    },
    required: ['skills'],
  };

  // Rate limiting configuration derived from the active Gemini project quota.
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 5000; // 5 seconds
  private readonly MAX_RETRY_DELAY = 60000; // 60 seconds

  constructor(
    private configService: ConfigService,
    private readonly geminiQuotaService: GeminiQuotaService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const configuredModel = this.configService.get<string>('GEMINI_MODEL')?.trim();

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured');
      throw new Error('Gemini API key is required');
    }

    this.modelName = configuredModel || DEFAULT_GEMINI_MODEL;

    this.ai = new GoogleGenAI({ apiKey });
    this.logger.log(`Gemini AI Service initialized with model: ${this.modelName}`);
  }

  /**
   * Parse CV text and extract structured information using native JSON mode
   */
  async parseCV(cvText: string): Promise<ParsedDataDto> {
    try {
      const prompt = this.buildCVParsingPrompt(cvText);

      const response = await this.makeRequestWithRetry('parse', async () => {
        return await this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            temperature: this.PARSE_TEMPERATURE,
            maxOutputTokens: this.PARSE_MAX_TOKENS,
            responseMimeType: 'application/json',
            responseJsonSchema: this.CV_PARSE_SCHEMA,
          },
        });
      });

      const parsedData = JSON.parse(response.text) as ParsedDataDto;
      this.logger.log('CV parsed successfully');
      return parsedData;
    } catch (error) {
      if (this.geminiQuotaService.isQuotaDeniedError(error)) {
        throw error;
      }

      this.logger.error('Error parsing CV:', error);
      throw new Error(`CV parsing failed: ${this.getErrorMessage(error)}`);
    }
  }

  private buildCVParsingPrompt(cvText: string): string {
    return `You are an expert CV parser. Extract information from the CV text below.

RULES:
- Extract all relevant soft and technical skills (skills are in uppercase).
- Calculate total years of work experience from dates.
- If info is missing, use null or empty array [].

CV TEXT:
${cvText}`;
  }

  // Make API request with rate limiting and exponential backoff retry
  private async makeRequestWithRetry<T>(
    workload: GeminiQuotaWorkload,
    requestFn: () => Promise<T>,
    retryCount: number = 0,
  ): Promise<T> {
    try {
      await this.geminiQuotaService.reserveRequest(workload);
      return await requestFn();
    } catch (error) {
      if (this.geminiQuotaService.isQuotaDeniedError(error)) {
        throw error;
      }

      const isRateLimitError = this.isRateLimitError(error);
      const shouldRetry = retryCount < this.MAX_RETRIES && isRateLimitError;

      if (shouldRetry) {
        const retryDelay = this.calculateRetryDelay(error, retryCount);
        this.logger.warn(
          `Rate limit hit. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`,
        );
        await this.sleep(retryDelay);
        return this.makeRequestWithRetry(workload, requestFn, retryCount + 1);
      }

      throw error;
    }
  }

  public isRateLimitError(error: any): boolean {
    if (this.geminiQuotaService.isQuotaDeniedError(error)) {
      return true;
    }

    const errorMessage = error?.message || '';
    return (
      errorMessage.includes('429') ||
      errorMessage.includes('Too Many Requests') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    );
  }

  private calculateRetryDelay(error: any, retryCount: number): number {
    const errorMessage = error?.message || '';
    const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);

    if (retryMatch) {
      const suggestedDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000);
      this.logger.debug(`Using API suggested retry delay: ${suggestedDelay}ms`);
      return Math.min(suggestedDelay, this.MAX_RETRY_DELAY);
    }

    const exponentialDelay = this.INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    const delayWithJitter = exponentialDelay + Math.random() * 1000;
    return Math.min(delayWithJitter, this.MAX_RETRY_DELAY);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getChatModelName(): string {
    return this.modelName;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown Gemini error';
  }

  /**
   * Chat with context — AI Career Advisor with native JSON structured output
   * Returns guaranteed-valid JSON matching { text, recommendedJobIds }
   */
  async chatWithContext(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    systemPrompt: string,
  ): Promise<IAIChatResponse> {
    try {
      const startedAt = Date.now();
      // Build multi-turn contents array
      const contents = [];

      // System instruction injected as first user/model exchange
      contents.push(
        { role: 'user', parts: [{ text: systemPrompt }] },
        {
          role: 'model',
          parts: [
            {
              text: 'Đã nhận thông tin ngữ cảnh. Tôi sẵn sàng hỗ trợ bạn về các vấn đề liên quan đến việc làm và phát triển sự nghiệp trong lĩnh vực IT.',
            },
          ],
        },
      );

      // Add conversation history (already limited by caller)
      for (const msg of conversationHistory) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }

      // Add new user message
      contents.push({ role: 'user', parts: [{ text: message }] });

      const response = await this.makeRequestWithRetry('chat-fallback', async () => {
        return await this.ai.models.generateContent({
          model: this.modelName,
          contents,
          config: {
            temperature: 0.7,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
            responseJsonSchema: this.CHAT_RESPONSE_SCHEMA,
          },
        });
      });

      const parsed = JSON.parse(response.text) as { text: string; recommendedJobIds: string[] };
      this.logger.log('AI chat response generated successfully');
      return {
        ...parsed,
        provider: AI_PROVIDER_GEMINI,
        metadata: this.buildUsageMetadata(response, Date.now() - startedAt),
      };
    } catch (error) {
      if (this.geminiQuotaService.isQuotaDeniedError(error)) {
        throw error;
      }

      this.logger.error('Error in chatWithContext:', error);
      throw new Error(`AI chat failed: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Build the multi-turn contents array shared by chat and streaming methods.
   */
  private buildChatContents(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
    message: string,
  ): any[] {
    const contents: any[] = [];

    contents.push(
      { role: 'user', parts: [{ text: systemPrompt }] },
      {
        role: 'model',
        parts: [
          {
            text: 'Đã nhận thông tin ngữ cảnh. Tôi sẵn sàng hỗ trợ bạn về các vấn đề liên quan đến việc làm và phát triển sự nghiệp trong lĩnh vực IT.',
          },
        ],
      },
    );

    for (const msg of conversationHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    contents.push({ role: 'user', parts: [{ text: message }] });
    return contents;
  }

  /**
   * Streaming chat with function-calling tool for structured job recommendations.
   *
   * Flow:
   *  Turn 1 (non-streaming) — model receives the recommend_jobs tool declaration.
   *    If it calls the tool, we capture the exact job IDs and send a function_response.
   *    If it does not call the tool, we fall back to emitting the text directly.
   *  Turn 2 (streaming) — model generates the final natural-language response which
   *    we yield as text chunks.
   *
   * The generator's RETURN VALUE (accessible when done === true) is the string[]
   * of recommended job IDs from the tool call (empty array if no tool was called).
   */
  async *chatWithContextStreamAndTools(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    systemPrompt: string,
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> {
    const startedAt = Date.now();
    const contents = this.buildChatContents(systemPrompt, conversationHistory, message);

    // Turn 1: non-streaming — let the model decide whether to call recommend_jobs
    const turn1 = await this.makeRequestWithRetry('chat-fallback', async () => {
      return await this.ai.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          temperature: 0.7,
          maxOutputTokens: 2000,
          tools: [{ functionDeclarations: [this.RECOMMEND_JOBS_TOOL] }],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
          },
        },
      });
    });

    const recommendJobCall = turn1.functionCalls?.find(fc => fc.name === 'recommend_jobs');

    if (recommendJobCall) {
      const rawArgs = recommendJobCall.args as { jobIds?: unknown };
      const recommendedJobIds: string[] = Array.isArray(rawArgs?.jobIds)
        ? (rawArgs.jobIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : [];

      // Build the function_response turn so the model continues with full context
      const modelContent = turn1.candidates?.[0]?.content;
      const functionResponseContents = modelContent
        ? [
            ...contents,
            modelContent,
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: 'recommend_jobs',
                    response: { status: 'accepted', count: recommendedJobIds.length },
                  },
                },
              ],
            },
          ]
        : contents;

      // Turn 2: stream the final assistant response
      const turn2Stream = await this.makeRequestWithRetry('chat-fallback', async () => {
        return await this.ai.models.generateContentStream({
          model: this.modelName,
          contents: functionResponseContents,
          config: {
            temperature: 0.7,
            maxOutputTokens: 2000,
          },
        });
      });

      for await (const chunk of turn2Stream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }

      return {
        recommendedJobIds,
        provider: AI_PROVIDER_GEMINI,
        model: this.modelName,
        metadata: this.buildUsageMetadata(turn1, Date.now() - startedAt),
      };
    } else {
      // No tool call — emit whatever text the model returned in turn 1
      const text = turn1.text || '';
      if (text) {
        yield text;
      }
      return {
        recommendedJobIds: [],
        provider: AI_PROVIDER_GEMINI,
        model: this.modelName,
        metadata: this.buildUsageMetadata(turn1, Date.now() - startedAt),
      };
    }
  }

  /**
   * Streaming chat with context — yields text chunks as they are generated
   * Does NOT use JSON mode (streaming requires plain text for incremental tokens)
   * @deprecated Use chatWithContextStreamAndTools for accurate job recommendations
   */
  async *chatWithContextStream(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    systemPrompt: string,
  ): AsyncGenerator<string> {
    const contents = [];

    contents.push(
      { role: 'user', parts: [{ text: systemPrompt }] },
      {
        role: 'model',
        parts: [
          {
            text: 'Đã nhận thông tin ngữ cảnh. Tôi sẵn sàng hỗ trợ bạn về các vấn đề liên quan đến việc làm và phát triển sự nghiệp trong lĩnh vực IT.',
          },
        ],
      },
    );

    for (const msg of conversationHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await this.makeRequestWithRetry('chat-fallback', async () => {
      return await this.ai.models.generateContentStream({
        model: this.modelName,
        contents,
        config: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      });
    });

    for await (const chunk of response) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }

  /**
   * Summarize conversation history for context preservation across archives
   */
  async summarizeConversation(messages: Array<{ role: string; content: string }>): Promise<string> {
    try {
      const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');

      const prompt = `Summarize this conversation in 2-3 sentences, focusing on key topics discussed and user's main concerns:\n\n${conversationText}`;

      const response = await this.makeRequestWithRetry('summary', async () => {
        return await this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            temperature: 0.3,
            maxOutputTokens: 200,
          },
        });
      });

      return response.text;
    } catch (error) {
      if (this.geminiQuotaService.isQuotaDeniedError(error)) {
        throw error;
      }

      this.logger.error('Error summarizing conversation:', error);
      return 'Previous conversation context';
    }
  }

  private buildUsageMetadata(response: unknown, latencyMs: number): IAIChatUsageMetadata {
    const usage = (response as any)?.usageMetadata;

    return {
      provider: AI_PROVIDER_GEMINI,
      model: this.modelName,
      promptTokens: usage?.promptTokenCount,
      completionTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      latencyMs,
    };
  }
}
