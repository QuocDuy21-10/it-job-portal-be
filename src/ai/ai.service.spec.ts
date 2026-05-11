import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { GeminiService } from 'src/gemini/gemini.service';
import { GroqService } from 'src/groq/groq.service';
import { GeminiQuotaDeniedException } from 'src/gemini/gemini-quota-denied.exception';

describe('AIService', () => {
  const createStream = (
    chunks: string[],
    finalJobIds: string[] = [],
  ): AsyncGenerator<string, string[], unknown> => {
    return (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }

      return finalJobIds;
    })();
  };

  const createFailingStream = (
    error: Error,
    chunksBeforeFailure: string[] = [],
  ): AsyncGenerator<string, string[], unknown> => {
    return (async function* () {
      for (const chunk of chunksBeforeFailure) {
        yield chunk;
      }

      throw error;
    })();
  };

  const collectStream = async (generator: AsyncGenerator<string, string[], unknown>) => {
    const chunks: string[] = [];
    let result = await generator.next();

    while (!result.done) {
      chunks.push(result.value as string);
      result = await generator.next();
    }

    return {
      text: chunks.join(''),
      recommendedJobIds: result.value,
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
            get: jest.fn((key: string) => configValues[key]),
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

  it('delegates CV parsing to Gemini', async () => {
    const { service, geminiServiceMock } = await createTestingModule();
    const parsedData = { skills: ['NODEJS'] };
    geminiServiceMock.parseCV.mockResolvedValue(parsedData);

    await expect(service.parseCV('cv text')).resolves.toEqual(parsedData);
    expect(geminiServiceMock.parseCV).toHaveBeenCalledWith('cv text');
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
      createStream(['Gemini ', 'stream'], ['job-2']),
    );

    await expect(collectStream(service.streamChat('hello', [], 'prompt'))).resolves.toEqual({
      text: 'Gemini stream',
      recommendedJobIds: ['job-2'],
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
