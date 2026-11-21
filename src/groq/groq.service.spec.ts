import { ConfigService } from '@nestjs/config';
import { APIError } from 'groq-sdk';
import { GroqService } from './groq.service';

describe('GroqService', () => {
  const createService = (configValues: Record<string, string | undefined> = {}) => {
    const service = new GroqService({
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService);

    const create = jest.fn();
    (service as any).client = {
      chat: {
        completions: {
          create,
        },
      },
    };

    return { service, create };
  };

  const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };

  const chunk = (delta: Record<string, unknown>, chunkUsage?: typeof usage) => ({
    choices: [{ index: 0, delta, finish_reason: null }],
    ...(chunkUsage ? { x_groq: { usage: chunkUsage } } : {}),
  });

  const streamOf = (...chunks: unknown[]) =>
    (async function* () {
      for (const item of chunks) {
        yield item;
      }
    })();

  const collect = async (generator: AsyncGenerator<string, any, unknown>) => {
    const chunks: string[] = [];
    let result = await generator.next();
    while (!result.done) {
      chunks.push(result.value);
      result = await generator.next();
    }
    return { chunks, result: result.value };
  };

  const toolCallDelta = (args: string, extra: Record<string, unknown> = {}) => ({
    tool_calls: [
      { index: 0, ...extra, function: { ...(extra.function as object), arguments: args } },
    ],
  });

  it('uses gpt-oss-20b as the default chat model', () => {
    const service = new GroqService({
      get: jest.fn(),
    } as unknown as ConfigService);

    expect(service.getChatModelName()).toBe('openai/gpt-oss-20b');
  });

  it('treats Groq json_validate_failed as fallback-eligible but not other 400s', () => {
    const { service } = createService({ GROQ_API_KEY: 'test-key' });
    const headers = new Headers();
    const jsonFailed = APIError.generate(
      400,
      { error: { message: 'Failed to generate JSON', code: 'json_validate_failed' } },
      undefined,
      headers,
    );
    const badRequest = APIError.generate(
      400,
      { error: { message: 'Invalid model', code: 'model_not_found' } },
      undefined,
      headers,
    );

    expect(service.isFallbackEligibleError(jsonFailed)).toBe(true);
    expect(service.isFallbackEligibleError(badRequest)).toBe(false);
  });

  it('streams content from a single turn when the model calls no tool', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    const controller = new AbortController();
    create.mockResolvedValueOnce(
      streamOf(
        chunk({ reasoning: 'thinking' }),
        chunk({ content: 'Xin ' }),
        chunk({ content: 'chào' }, usage),
      ),
    );

    const { chunks, result } = await collect(
      service.chatWithContextStreamAndTools('hi', [], 'system prompt', controller.signal),
    );

    expect(chunks).toEqual(['Xin ', 'chào']);
    expect(result).toEqual(
      expect.objectContaining({
        recommendedJobIds: [],
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        metadata: expect.objectContaining({
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        }),
      }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ stream: true, tool_choice: 'auto', tools: expect.any(Array) }),
    );
    expect(create.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('assembles a tool call split across deltas and streams the second turn', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create
      .mockResolvedValueOnce(
        streamOf(
          chunk(
            toolCallDelta('{"jobIds":["job-1",', {
              id: 'call_1',
              function: { name: 'recommend_jobs' },
            }),
          ),
          chunk(toolCallDelta('"job-1","job-2"]}'), usage),
        ),
      )
      .mockResolvedValueOnce(
        streamOf(chunk({ content: 'Đây là ' }), chunk({ content: '2 job.' }, usage)),
      );

    const { chunks, result } = await collect(
      service.chatWithContextStreamAndTools('show jobs', [], 'system prompt'),
    );

    expect(chunks).toEqual(['Đây là ', '2 job.']);
    expect(result.recommendedJobIds).toEqual(['job-1', 'job-2']);
    expect(result.metadata).toEqual(expect.objectContaining({ promptTokens: 20, totalTokens: 30 }));

    const secondRequest = create.mock.calls[1][0];
    expect(secondRequest).toEqual(expect.objectContaining({ stream: true }));
    expect(secondRequest.tools).toBeUndefined();
    expect(secondRequest.response_format).toBeUndefined();
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'recommend_jobs',
                arguments: '{"jobIds":["job-1","job-1","job-2"]}',
              },
            },
          ],
        }),
        expect.objectContaining({ role: 'tool', tool_call_id: 'call_1' }),
      ]),
    );
  });

  it('passes preface text from turn 1 into turn 2 so the model continues it', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create
      .mockResolvedValueOnce(
        streamOf(
          chunk({ content: 'Mình tìm job nhé. ' }),
          chunk(
            toolCallDelta('{"jobIds":["job-1"]}', {
              id: 'call_1',
              function: { name: 'recommend_jobs' },
            }),
          ),
        ),
      )
      .mockResolvedValueOnce(streamOf(chunk({ content: 'Có 1 job.' })));

    const { chunks } = await collect(service.chatWithContextStreamAndTools('jobs', [], 'prompt'));

    expect(chunks).toEqual(['Mình tìm job nhé. ', 'Có 1 job.']);
    expect(create.mock.calls[1][0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', content: 'Mình tìm job nhé. ' }),
      ]),
    );
  });

  it('throws a fallback-eligible error for invalid tool arguments', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create.mockResolvedValueOnce(
      streamOf(
        chunk(toolCallDelta('{bad', { id: 'call_1', function: { name: 'recommend_jobs' } })),
      ),
    );

    const error = await collect(service.chatWithContextStreamAndTools('jobs', [], 'prompt')).catch(
      (caught: unknown) => caught,
    );

    expect(error).toEqual(new Error('Groq returned invalid tool arguments'));
    expect(service.isFallbackEligibleError(error)).toBe(true);
  });

  it('throws a fallback-eligible error when the model returns nothing', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create.mockResolvedValueOnce(streamOf(chunk({ content: '' }, usage)));

    const error = await collect(service.chatWithContextStreamAndTools('hi', [], 'prompt')).catch(
      (caught: unknown) => caught,
    );

    expect(error).toEqual(new Error('Groq returned an empty chat response'));
    expect(service.isFallbackEligibleError(error)).toBe(true);
  });

  it('builds the non-streaming chat response from the stream', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create.mockResolvedValueOnce(
      streamOf(chunk({ content: 'Hello ' }), chunk({ content: 'there' }, usage)),
    );

    await expect(service.chatWithContext('hi', [], 'prompt')).resolves.toEqual({
      text: 'Hello there',
      recommendedJobIds: [],
      provider: 'groq',
      metadata: expect.objectContaining({ totalTokens: 15 }),
    });
  });
});
