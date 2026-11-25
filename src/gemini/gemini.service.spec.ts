import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiService } from './gemini.service';

jest.mock('@google/genai', () => ({
  ...jest.requireActual('@google/genai'),
  GoogleGenAI: jest.fn(),
}));

describe('GeminiService chatWithContextStreamAndTools', () => {
  const createService = () => {
    const quotaService = {
      reserveRequest: jest.fn().mockResolvedValue(undefined),
      isQuotaDeniedError: jest.fn().mockReturnValue(false),
    };
    const service = new GeminiService(
      {
        get: jest.fn((key: string) => ({ GEMINI_API_KEY: 'test-key' })[key]),
      } as unknown as ConfigService,
      quotaService as any,
    );
    const generateContent = jest.fn();
    const generateContentStream = jest.fn();
    (service as any).ai = { models: { generateContent, generateContentStream } };

    return { service, generateContent, generateContentStream };
  };

  it('passes the abort signal to both Gemini turns', async () => {
    const { service, generateContent, generateContentStream } = createService();
    const controller = new AbortController();
    generateContent.mockResolvedValue({
      functionCalls: [{ name: 'recommend_jobs', args: { jobIds: ['job-1'] } }],
      candidates: [{ content: { role: 'model', parts: [] } }],
    });
    generateContentStream.mockResolvedValue(
      (async function* () {
        yield { text: 'Hi' };
      })(),
    );

    const generator = service.chatWithContextStreamAndTools(
      'jobs',
      [],
      'prompt',
      controller.signal,
    );
    const chunks: string[] = [];
    let result = await generator.next();
    while (!result.done) {
      chunks.push(result.value as string);
      result = await generator.next();
    }

    expect(chunks).toEqual(['Hi']);
    expect(result.value.recommendedJobIds).toEqual(['job-1']);
    expect(generateContent.mock.calls[0][0].config.abortSignal).toBe(controller.signal);
    expect(generateContentStream.mock.calls[0][0].config.abortSignal).toBe(controller.signal);
  });
});

describe('GeminiService request limits', () => {
  const createService = () => {
    const quotaService = {
      reserveRequest: jest.fn().mockResolvedValue(undefined),
      isQuotaDeniedError: jest.fn().mockReturnValue(false),
    };
    const service = new GeminiService(
      {
        get: jest.fn((key: string) => ({ GEMINI_API_KEY: 'test-key' })[key]),
      } as unknown as ConfigService,
      quotaService as any,
    );
    const generateContent = jest.fn();
    (service as any).ai = { models: { generateContent } };
    const sleep = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    return { service, generateContent, sleep };
  };
  const rateLimited = () => new Error('429 Too Many Requests');
  const overloaded = () =>
    new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
    );

  it('gives the Gemini client a request timeout', () => {
    createService();

    const { calls } = (GoogleGenAI as unknown as jest.Mock).mock;
    const options = calls[calls.length - 1][0];
    expect(options.httpOptions.timeout).toBeGreaterThan(0);
  });

  // A user waits on these calls, so a rate limit must fail fast instead of sleeping up to minutes.
  it('does not sleep and retry inside an HTTP request when rate limited', async () => {
    const { service, generateContent, sleep } = createService();
    generateContent.mockRejectedValue(rateLimited());

    await expect(service.summarizeConversation([{ role: 'user', content: 'hi' }])).resolves.toBe(
      'Previous conversation context',
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('still retries CV parsing, which runs in a queue worker', async () => {
    const { service, generateContent, sleep } = createService();
    generateContent
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValueOnce({ text: '{"skills":[]}' });

    await expect(service.parseCV('cv text')).resolves.toEqual({ skills: [] });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('retries CV parsing when Gemini is overloaded (503)', async () => {
    const { service, generateContent, sleep } = createService();
    generateContent
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValueOnce({ text: '{"skills":[]}' });

    await expect(service.parseCV('cv text')).resolves.toEqual({ skills: [] });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up CV parsing after MAX_RETRIES overloaded attempts', async () => {
    const { service, generateContent, sleep } = createService();
    generateContent.mockRejectedValue(overloaded());

    await expect(service.parseCV('cv text')).rejects.toThrow('CV parsing failed');
    expect(generateContent).toHaveBeenCalledTimes(4); // 1 call + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('does not sleep and retry user-facing calls when Gemini is overloaded', async () => {
    const { service, generateContent, sleep } = createService();
    generateContent.mockRejectedValue(overloaded());

    await expect(service.summarizeConversation([{ role: 'user', content: 'hi' }])).resolves.toBe(
      'Previous conversation context',
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  // ChatService maps isRateLimitError to HTTP 429; a 503 must keep mapping to SERVICE_UNAVAILABLE.
  it('does not report an overload as a rate limit', () => {
    const { service } = createService();

    expect(service.isRateLimitError(overloaded())).toBe(false);
  });

  it('defaults to gemini-3.5-flash-lite when GEMINI_MODEL is not set', () => {
    const { service } = createService();

    expect(service.getChatModelName()).toBe('gemini-3.5-flash-lite');
  });
});
