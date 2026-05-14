import { AiUsageService } from './ai-usage.service';

describe('AiUsageService', () => {
  let service: AiUsageService;
  let model: { create: jest.Mock; aggregate: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    model = {
      create: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'AI_COST_GROQ_PROMPT_USD_PER_1K') return '0.1';
        if (key === 'AI_COST_GROQ_COMPLETION_USD_PER_1K') return '0.2';
        return undefined;
      }),
    };
    service = new AiUsageService(model as any, configService as any);
  });

  it('persists usage logs with estimated cost and cache metadata', async () => {
    await service.record({
      userId: '507f1f77bcf86cd799439011',
      sessionId: '507f1f77bcf86cd799439012',
      operationType: 'chat_message',
      success: true,
      metadata: {
        provider: 'groq',
        model: 'llama',
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      },
      cacheHit: true,
      cacheCategory: 'faq_response',
    });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCostUsd: 0.2,
        costEstimated: false,
        cacheHit: true,
        cacheCategory: 'faq_response',
      }),
    );
  });

  it('returns summarized usage metrics', async () => {
    model.aggregate
      .mockResolvedValueOnce([
        {
          totalRequests: 10,
          successfulRequests: 8,
          failedRequests: 2,
          fallbackRequests: 1,
          cacheHits: 3,
          totalTokens: 1500,
          estimatedCostUsd: 0.2,
          averageLatencyMs: 125.4,
          latencies: [100, 200, 300],
          quotaDenials: 1,
          guardrailBlocks: 1,
        },
      ])
      .mockResolvedValueOnce([{ _id: 'RATE_LIMIT', count: 2 }]);

    const result = await service.getUsageSummary({});

    expect(result).toEqual(
      expect.objectContaining({
        totalRequests: 10,
        successRate: 80,
        fallbackRate: 10,
        cacheHitRate: 30,
        averageLatencyMs: 125,
        p95LatencyMs: 300,
        estimatedCostUsd: 0.2,
        errorsByCategory: { RATE_LIMIT: 2 },
      }),
    );
  });
});
