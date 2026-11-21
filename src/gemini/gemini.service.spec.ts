import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';

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
