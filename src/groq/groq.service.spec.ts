import { ConfigService } from '@nestjs/config';
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

  const createCompletion = (
    content: string | null,
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [],
    usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  ) => ({
    choices: [
      {
        message: {
          content,
          tool_calls: toolCalls,
        },
      },
    ],
    usage,
  });

  const getFinalRequest = (create: jest.Mock) => create.mock.calls[1][0];

  it('uses the strict structured-output Groq model by default', () => {
    const service = new GroqService({
      get: jest.fn(),
    } as unknown as ConfigService);

    expect(service.getChatModelName()).toBe('openai/gpt-oss-20b');
  });

  it('sends strict json_schema response_format on the final chat response call', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create
      .mockResolvedValueOnce(createCompletion(null, []))
      .mockResolvedValueOnce(
        createCompletion(JSON.stringify({ text: 'Try these jobs.', recommendedJobIds: [] })),
      );

    await service.chatWithContext('show jobs', [], 'system prompt');

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({ name: 'recommend_jobs' }),
          }),
        ],
        tool_choice: 'auto',
      }),
    );
    expect(getFinalRequest(create)).toEqual(
      expect.objectContaining({
        response_format: {
          type: 'json_schema',
          json_schema: expect.objectContaining({
            name: 'chat_response',
            strict: true,
            schema: expect.objectContaining({
              additionalProperties: false,
              required: ['text', 'recommendedJobIds'],
            }),
          }),
        },
      }),
    );
  });

  it('returns validated structured text and recommended job IDs with usage metadata', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    const toolCalls = [
      {
        id: 'call-1',
        function: {
          name: 'recommend_jobs',
          arguments: JSON.stringify({ jobIds: ['job-1'] }),
        },
      },
    ];

    create
      .mockResolvedValueOnce(createCompletion(null, toolCalls))
      .mockResolvedValueOnce(
        createCompletion(
          JSON.stringify({ text: '## Recommended jobs', recommendedJobIds: ['job-1'] }),
        ),
      );

    await expect(service.chatWithContext('show jobs', [], 'system prompt')).resolves.toEqual({
      text: '## Recommended jobs',
      recommendedJobIds: ['job-1'],
      provider: 'groq',
      metadata: expect.objectContaining({
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
      }),
    });
  });

  it('deduplicates and preserves tool-call job IDs through structured finalization', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    const toolCalls = [
      {
        id: 'call-1',
        function: {
          name: 'recommend_jobs',
          arguments: JSON.stringify({ jobIds: ['job-1', 'job-2', 'job-1'] }),
        },
      },
    ];

    create
      .mockResolvedValueOnce(createCompletion(null, toolCalls))
      .mockResolvedValueOnce(
        createCompletion(
          JSON.stringify({ text: 'Use these roles.', recommendedJobIds: ['job-2'] }),
        ),
      );

    const result = await service.chatWithContext('show jobs', [], 'system prompt');

    expect(result.recommendedJobIds).toEqual(['job-1', 'job-2']);
    expect(getFinalRequest(create).messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', tool_calls: toolCalls }),
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call-1',
          content: JSON.stringify({
            status: 'accepted',
            tool: 'recommend_jobs',
            count: 3,
          }),
        }),
      ]),
    );
  });

  it('does not trust structured job IDs when no recommend_jobs tool call was accepted', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create
      .mockResolvedValueOnce(createCompletion(null, []))
      .mockResolvedValueOnce(
        createCompletion(JSON.stringify({ text: 'General advice.', recommendedJobIds: ['job-1'] })),
      );

    const result = await service.chatWithContext('show jobs', [], 'system prompt');

    expect(result).toEqual(
      expect.objectContaining({
        text: 'General advice.',
        recommendedJobIds: [],
      }),
    );
  });

  it('throws a Groq fallback-eligible error when structured JSON is malformed', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create
      .mockResolvedValueOnce(createCompletion(null, []))
      .mockResolvedValueOnce(createCompletion('not json'));

    await expect(service.chatWithContext('show jobs', [], 'system prompt')).rejects.toThrow(
      'Groq returned invalid structured chat response',
    );
    expect(
      service.isFallbackEligibleError(new Error('Groq returned invalid structured chat response')),
    ).toBe(true);
  });

  it('throws a Groq fallback-eligible error when structured JSON has invalid types', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    create
      .mockResolvedValueOnce(createCompletion(null, []))
      .mockResolvedValueOnce(
        createCompletion(JSON.stringify({ text: ['bad'], recommendedJobIds: ['job-1'] })),
      );

    await expect(service.chatWithContext('show jobs', [], 'system prompt')).rejects.toThrow(
      'Groq returned invalid structured chat response',
    );
  });

  it('streams validated structured text and returns structured job IDs', async () => {
    const { service, create } = createService({ GROQ_API_KEY: 'test-key' });
    const toolCalls = [
      {
        id: 'call-1',
        function: {
          name: 'recommend_jobs',
          arguments: JSON.stringify({ jobIds: ['job-1'] }),
        },
      },
    ];

    create
      .mockResolvedValueOnce(createCompletion(null, toolCalls))
      .mockResolvedValueOnce(
        createCompletion(
          JSON.stringify({ text: 'Formatted Markdown', recommendedJobIds: ['job-1'] }),
        ),
      );

    const generator = service.chatWithContextStreamAndTools('show jobs', [], 'system prompt');

    await expect(generator.next()).resolves.toEqual({
      done: false,
      value: 'Formatted Markdown',
    });
    await expect(generator.next()).resolves.toEqual({
      done: true,
      value: expect.objectContaining({
        recommendedJobIds: ['job-1'],
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
      }),
    });
    expect(getFinalRequest(create)).toEqual(
      expect.objectContaining({
        response_format: expect.objectContaining({ type: 'json_schema' }),
      }),
    );
  });
});
