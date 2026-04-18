import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { ParsedDataDto } from 'src/resumes/dto/parsed-data.dto';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly ai: GoogleGenAI;

  // Model configuration
  private readonly MODEL_NAME = 'gemini-2.5-flash-lite';
  private readonly PARSE_MAX_TOKENS = 5000;
  private readonly PARSE_TEMPERATURE = 0.3;

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

  // Rate limiting configuration (Gemini 2.5 Flash FREE tier: RPM=10, TPM=250K, RPD=20)
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 5000; // 5 seconds
  private readonly MAX_RETRY_DELAY = 60000; // 60 seconds
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 6000; // 6 seconds between requests (10 RPM = 1 req per 6s)

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured');
      throw new Error('Gemini API key is required');
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.logger.log(`Gemini AI Service initialized with model: ${this.MODEL_NAME}`);
  }

  /**
   * Parse CV text and extract structured information using native JSON mode
   */
  async parseCV(cvText: string): Promise<ParsedDataDto> {
    try {
      const prompt = this.buildCVParsingPrompt(cvText);

      const response = await this.makeRequestWithRetry(async () => {
        return await this.ai.models.generateContent({
          model: this.MODEL_NAME,
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
      this.logger.error('Error parsing CV:', error);
      throw new Error(`CV parsing failed: ${error.message}`);
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
    requestFn: () => Promise<T>,
    retryCount: number = 0,
  ): Promise<T> {
    try {
      await this.enforceRateLimit();
      return await requestFn();
    } catch (error) {
      const isRateLimitError = this.isRateLimitError(error);
      const shouldRetry = retryCount < this.MAX_RETRIES && isRateLimitError;

      if (shouldRetry) {
        const retryDelay = this.calculateRetryDelay(error, retryCount);
        this.logger.warn(
          `Rate limit hit. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`,
        );
        await this.sleep(retryDelay);
        return this.makeRequestWithRetry(requestFn, retryCount + 1);
      }

      throw error;
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      this.logger.debug(`Rate limiting: Waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  public isRateLimitError(error: any): boolean {
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

  /**
   * Chat with context — AI Career Advisor with native JSON structured output
   * Returns guaranteed-valid JSON matching { text, recommendedJobIds }
   */
  async chatWithContext(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    systemPrompt: string,
  ): Promise<{ text: string; recommendedJobIds: string[] }> {
    try {
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

      const response = await this.makeRequestWithRetry(async () => {
        return await this.ai.models.generateContent({
          model: this.MODEL_NAME,
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
      return parsed;
    } catch (error) {
      this.logger.error('Error in chatWithContext:', error);
      throw new Error(`AI chat failed: ${error.message}`);
    }
  }

  /**
   * Streaming chat with context — yields text chunks as they are generated
   * Does NOT use JSON mode (streaming requires plain text for incremental tokens)
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

    await this.enforceRateLimit();

    const response = await this.ai.models.generateContentStream({
      model: this.MODEL_NAME,
      contents,
      config: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
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

      const response = await this.makeRequestWithRetry(async () => {
        return await this.ai.models.generateContent({
          model: this.MODEL_NAME,
          contents: prompt,
          config: {
            temperature: 0.3,
            maxOutputTokens: 200,
          },
        });
      });

      return response.text;
    } catch (error) {
      this.logger.error('Error summarizing conversation:', error);
      return 'Previous conversation context';
    }
  }
}
