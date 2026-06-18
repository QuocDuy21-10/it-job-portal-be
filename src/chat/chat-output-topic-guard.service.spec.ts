import { ChatOutputTopicGuardService } from './chat-output-topic-guard.service';
import { AIService } from 'src/ai/ai.service';

describe('ChatOutputTopicGuardService', () => {
  const buildService = (classifyTopicImpl: () => Promise<unknown>) => {
    const mockAiService = {
      classifyTopic: jest.fn().mockImplementation(classifyTopicImpl),
    } as unknown as AIService;

    return new ChatOutputTopicGuardService(mockAiService);
  };

  it('returns blocked: false when classifier reports on-topic', async () => {
    const service = buildService(() =>
      Promise.resolve({ onTopic: true, category: 'on_topic', reason: 'career related' }),
    );

    const result = await service.classify('What skills do I need for a React developer job?');

    expect(result.blocked).toBe(false);
    expect(result.onTopic).toBe(true);
    expect(result.category).toBe('on_topic');
  });

  it('returns blocked: true and replaces output for code_generation category', async () => {
    const service = buildService(() =>
      Promise.resolve({ onTopic: false, category: 'code_generation', reason: 'contains HTML' }),
    );

    const result = await service.classify('Here is an HTML template: <html>...</html>');

    expect(result.blocked).toBe(true);
    expect(result.onTopic).toBe(false);
    expect(result.category).toBe('code_generation');
  });

  it('returns blocked: true for off_topic category', async () => {
    const service = buildService(() =>
      Promise.resolve({ onTopic: false, category: 'off_topic', reason: 'unrelated to IT careers' }),
    );

    const result = await service.classify('Here is a recipe for pho soup.');

    expect(result.blocked).toBe(true);
    expect(result.category).toBe('off_topic');
  });

  it('returns blocked: false when classifier returns null (graceful degradation)', async () => {
    const service = buildService(() => Promise.resolve(null));

    const result = await service.classify('Some text');

    expect(result.blocked).toBe(false);
    expect(result.onTopic).toBe(true);
    expect(result.reason).toBe('classifier_unavailable');
  });

  it('returns blocked: false when classifier throws (graceful degradation)', async () => {
    const service = buildService(() => Promise.reject(new Error('Network error')));

    const result = await service.classify('Some text');

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe('classifier_error');
  });

  it('includes latencyMs in all results', async () => {
    const service = buildService(() =>
      Promise.resolve({ onTopic: true, category: 'on_topic', reason: '' }),
    );

    const result = await service.classify('career question');

    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('refusal message is bilingual (Vietnamese + English)', () => {
    const service = buildService(() => Promise.resolve(null));
    const refusal = service.getRefusalMessage();

    expect(refusal).toMatch(/Xin lỗi/);
    expect(refusal).toMatch(/Sorry/);
    expect(refusal).toMatch(/Việt Nam/);
  });
});
