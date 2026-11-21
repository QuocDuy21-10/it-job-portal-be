import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { GeminiService } from 'src/gemini/gemini.service';
import { GroqService } from 'src/groq/groq.service';
import { GeminiQuotaDeniedException } from 'src/gemini/gemini-quota-denied.exception';
import { IAIChatStreamResult } from './interfaces/ai-chat-stream-result.interface';

describe('AIService', () => {
  const requiredGroqConfig: Record<string, string> = {
    AI_GROQ_HISTORY_LIMIT: '6',
    AI_GROQ_MAX_INPUT_TOKENS: '6000',
    AI_GROQ_MAX_MATCHING_JOBS: '3',
    AI_GROQ_MAX_SEARCH_RESULTS: '3',
    AI_GROQ_MAX_COMPANY_ITEMS: '2',
    AI_GROQ_MAX_TOP_SKILLS: '5',
    AI_GROQ_MAX_TOP_COMPANIES: '5',
    AI_GROQ_MAX_SUMMARY_CHARS: '400',
  };

  const createStream = (
    chunks: string[],
    finalJobIds: string[] = [],
    provider: 'groq' | 'gemini' = 'groq',
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> => {
    return (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }

      return {
        recommendedJobIds: finalJobIds,
        provider,
        model: `${provider}-model`,
      };
    })();
  };

  const createFailingStream = (
    error: Error,
    chunksBeforeFailure: string[] = [],
  ): AsyncGenerator<string, IAIChatStreamResult, unknown> => {
    return (async function* () {
      for (const chunk of chunksBeforeFailure) {
        yield chunk;
      }

      throw error;
    })();
  };

  const collectStream = async (generator: AsyncGenerator<string, IAIChatStreamResult, unknown>) => {
    const chunks: string[] = [];
    let result = await generator.next();

    while (!result.done) {
      chunks.push(result.value as string);
      result = await generator.next();
    }

    return {
      text: chunks.join(''),
      streamResult: result.value,
    };
  };

  const createTestingModule = async (configValues: Record<string, string | undefined> = {}) => {
    const geminiServiceMock = {
      parseCV: jest.fn(),
      chatWithContext: jest.fn(),
      chatWithContextStreamAndTools: jest.fn(),
      summarizeConversation: jest.fn(),
      estimateTokens: jest.fn((text: string) => Math.ceil(text.length / 4)),
      isRateLimitError: jest.fn(),
    };

    const groqServiceMock = {
      chatWithContext: jest.fn(),
      chatWithContextStreamAndTools: jest.fn(),
      summarizeConversation: jest.fn(),
      isRateLimitError: jest.fn(),
      isFallbackEligibleError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => ({ ...requiredGroqConfig, ...configValues })[key]),
          },
        },
        {
          provide: GeminiService,
          useValue: geminiServiceMock,
        },
        {
          provide: GroqService,
          useValue: groqServiceMock,
        },
      ],
    }).compile();

    return {
      service: module.get<AIService>(AIService),
      geminiServiceMock,
      groqServiceMock,
    };
  };

  afterEach(() => jest.useRealTimers());

  const createHangingStream = (onSignal?: (signal: AbortSignal) => void) =>
    jest.fn((_message: string, _history: unknown, _prompt: string, signal: AbortSignal) => {
      onSignal?.(signal);
      return (async function* (): AsyncGenerator<string, IAIChatStreamResult, unknown> {
        await new Promise<never>((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('Request was aborted.'))),
        );
        yield 'never';
        return { recommendedJobIds: [], provider: 'groq' };
      })();
    });

  it('delegates CV parsing to Gemini', async () => {
    const { service, geminiServiceMock } = await createTestingModule();
    const parsedData = { skills: ['NODEJS'] };
    geminiServiceMock.parseCV.mockResolvedValue(parsedData);

    await expect(service.parseCV('cv text')).resolves.toEqual(parsedData);
    expect(geminiServiceMock.parseCV).toHaveBeenCalledWith('cv text');
  });

  it('fails fast when a required Groq config value is missing', async () => {
    await expect(createTestingModule({ AI_GROQ_HISTORY_LIMIT: undefined })).rejects.toThrow(
      'Missing required environment variable AI_GROQ_HISTORY_LIMIT',
    );
  });

  it('fails fast when a required Groq config value is invalid', async () => {
    await expect(createTestingModule({ AI_GROQ_MAX_INPUT_TOKENS: '0' })).rejects.toThrow(
      'AI_GROQ_MAX_INPUT_TOKENS must be a positive integer',
    );
  });

  it('uses Groq as the default chat provider', async () => {
    const { service, groqServiceMock } = await createTestingModule();
    groqServiceMock.chatWithContext.mockResolvedValue({
      text: 'Groq answer',
      recommendedJobIds: ['job-1'],
      provider: 'groq',
    });

    await expect(service.generateChat('hello', [], 'prompt')).resolves.toEqual({
      text: 'Groq answer',
      recommendedJobIds: ['job-1'],
      provider: 'groq',
    });

    expect(groqServiceMock.chatWithContext).toHaveBeenCalledWith('hello', [], 'prompt');
  });

  it('falls back to Gemini when Groq chat fails before a response', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    groqServiceMock.chatWithContext.mockRejectedValue(new Error('Groq unavailable'));
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);
    geminiServiceMock.chatWithContext.mockResolvedValue({
      text: 'Gemini fallback',
      recommendedJobIds: [],
    });

    await expect(service.generateChat('hello', [], 'prompt')).resolves.toEqual({
      text: 'Gemini fallback',
      recommendedJobIds: [],
      provider: 'gemini',
      fallbackUsed: true,
    });

    expect(geminiServiceMock.chatWithContext).toHaveBeenCalledWith('hello', [], 'prompt');
  });

  it('falls back to Gemini when Groq structured output validation fails', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    const structuredError = new Error('Groq returned invalid structured chat response');
    groqServiceMock.chatWithContext.mockRejectedValue(structuredError);
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);
    geminiServiceMock.chatWithContext.mockResolvedValue({
      text: 'Gemini structured fallback',
      recommendedJobIds: ['job-1'],
    });

    await expect(service.generateChat('show jobs', [], 'prompt')).resolves.toEqual({
      text: 'Gemini structured fallback',
      recommendedJobIds: ['job-1'],
      provider: 'gemini',
      fallbackUsed: true,
    });
  });

  it('surfaces Gemini quota denial when Groq fallback is unavailable', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    const quotaError = new GeminiQuotaDeniedException('chat-fallback', 'day', 60000, 0, 0);

    groqServiceMock.chatWithContext.mockRejectedValue(new Error('Groq unavailable'));
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);
    geminiServiceMock.chatWithContext.mockRejectedValue(quotaError);

    await expect(service.generateChat('hello', [], 'prompt')).rejects.toBe(quotaError);
  });

  it('falls back to Gemini streaming before the first chunk', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    groqServiceMock.chatWithContextStreamAndTools.mockReturnValue(
      createFailingStream(new Error('Groq stream failed')),
    );
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);
    geminiServiceMock.chatWithContextStreamAndTools.mockReturnValue(
      createStream(['Gemini ', 'stream'], ['job-2'], 'gemini'),
    );

    await expect(collectStream(service.streamChat('hello', [], 'prompt'))).resolves.toEqual({
      text: 'Gemini stream',
      streamResult: {
        recommendedJobIds: ['job-2'],
        provider: 'gemini',
        model: 'gemini-model',
        fallbackUsed: true,
        metadata: { provider: 'gemini', timeToFirstTokenMs: expect.any(Number) },
      },
    });
  });

  it('does not fall back after Groq has already emitted a stream chunk', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    groqServiceMock.chatWithContextStreamAndTools.mockReturnValue(
      createFailingStream(new Error('Groq stream failed mid-response'), ['partial']),
    );
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);

    const generator = service.streamChat('hello', [], 'prompt');

    await expect(generator.next()).resolves.toEqual({
      done: false,
      value: 'partial',
    });
    await expect(generator.next()).rejects.toThrow('Groq stream failed mid-response');
    expect(geminiServiceMock.chatWithContextStreamAndTools).not.toHaveBeenCalled();
  });

  it('passes an abort signal to the provider and reports time to first token', async () => {
    const { service, groqServiceMock } = await createTestingModule();
    groqServiceMock.chatWithContextStreamAndTools.mockReturnValue(createStream(['Hi']));

    const { streamResult } = await collectStream(service.streamChat('hello', [], 'prompt'));

    expect(groqServiceMock.chatWithContextStreamAndTools).toHaveBeenCalledWith(
      'hello',
      [],
      'prompt',
      expect.any(AbortSignal),
    );
    expect(streamResult.metadata).toEqual({
      provider: 'groq',
      timeToFirstTokenMs: expect.any(Number),
    });
  });

  it('aborts Groq and falls back to Gemini when no token arrives in time', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule({
      AI_CHAT_FIRST_TOKEN_TIMEOUT_MS: '1000',
    });
    let groqSignal: AbortSignal | undefined;
    groqServiceMock.chatWithContextStreamAndTools = createHangingStream(signal => {
      groqSignal = signal;
    });
    geminiServiceMock.chatWithContextStreamAndTools.mockReturnValue(
      createStream(['Gemini'], [], 'gemini'),
    );
    jest.useFakeTimers();

    const resultPromise = collectStream(service.streamChat('hello', [], 'prompt'));
    await jest.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toMatchObject({
      text: 'Gemini',
      streamResult: { provider: 'gemini', fallbackUsed: true },
    });
    expect(groqSignal?.aborted).toBe(true);
  });

  it('fails with a timeout when no token arrives and fallback is disabled', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule({
      AI_CHAT_FIRST_TOKEN_TIMEOUT_MS: '1000',
      AI_CHAT_GEMINI_FALLBACK_ENABLED: 'false',
    });
    groqServiceMock.chatWithContextStreamAndTools = createHangingStream();
    jest.useFakeTimers();

    const resultPromise = collectStream(service.streamChat('hello', [], 'prompt'));
    const assertion = expect(resultPromise).rejects.toThrow('first token timeout');
    await jest.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(geminiServiceMock.chatWithContextStreamAndTools).not.toHaveBeenCalled();
  });

  it('does not fall back when the client aborts before the first token', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    groqServiceMock.chatWithContextStreamAndTools = createHangingStream();
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);
    const client = new AbortController();

    const resultPromise = collectStream(service.streamChat('hello', [], 'prompt', client.signal));
    client.abort();

    await expect(resultPromise).rejects.toThrow('Request was aborted.');
    expect(geminiServiceMock.chatWithContextStreamAndTools).not.toHaveBeenCalled();
  });

  it('fails fast when the first token timeout is invalid', async () => {
    await expect(createTestingModule({ AI_CHAT_FIRST_TOKEN_TIMEOUT_MS: '0' })).rejects.toThrow(
      'AI_CHAT_FIRST_TOKEN_TIMEOUT_MS must be a positive integer',
    );
  });

  it('trims Groq history before sending chat requests when configured', async () => {
    const { service, groqServiceMock } = await createTestingModule({
      AI_GROQ_HISTORY_LIMIT: '2',
    });
    groqServiceMock.chatWithContext.mockResolvedValue({
      text: 'trimmed',
      recommendedJobIds: [],
      provider: 'groq',
    });

    const history = [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ];

    await service.generateChat('hello', history, 'prompt');

    expect(groqServiceMock.chatWithContext).toHaveBeenCalledWith(
      'hello',
      history.slice(-2),
      'prompt',
    );
  });

  it('falls back to Gemini for conversation summaries when Groq summary fails', async () => {
    const { service, groqServiceMock, geminiServiceMock } = await createTestingModule();
    groqServiceMock.summarizeConversation.mockRejectedValue(new Error('Groq summary failed'));
    groqServiceMock.isFallbackEligibleError.mockReturnValue(true);
    geminiServiceMock.summarizeConversation.mockResolvedValue('Gemini summary');

    await expect(
      service.summarizeConversation([{ role: 'user', content: 'Need backend jobs' }]),
    ).resolves.toBe('Gemini summary');
  });
});
