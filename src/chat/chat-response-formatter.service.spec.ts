import { ChatGuardrailRiskLevel, ChatGuardrailService } from './chat-guardrail.service';
import { ChatResponseFormatterService } from './chat-response-formatter.service';
import { ChatOutputTopicGuardService } from './chat-output-topic-guard.service';

const mockTopicGuardService = {
  classify: jest.fn().mockResolvedValue({
    blocked: false,
    onTopic: true,
    category: 'on_topic',
    reason: '',
    latencyMs: 0,
  }),
  getRefusalMessage: jest.fn().mockReturnValue('Refusal message.'),
} as unknown as ChatOutputTopicGuardService;

describe('ChatResponseFormatterService', () => {
  let service: ChatResponseFormatterService;

  beforeEach(() => {
    service = new ChatResponseFormatterService(new ChatGuardrailService(), mockTopicGuardService);
  });

  it('normalizes dense assistant text into readable Markdown spacing', async () => {
    await expect(
      service.formatAssistantOutput(
        'There are 18 companies hiring.Let me know if you want more details.\n\n\nThanks.',
        { skipTopicGuard: true },
      ),
    ).resolves.toMatchObject({
      sanitizedOutput:
        'There are 18 companies hiring.\n\nLet me know if you want more details.\n\nThanks.',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('preserves Markdown bullets while trimming excessive spaces', async () => {
    await expect(
      service.formatAssistantOutput('  - Backend jobs  \n- Frontend jobs  ', {
        skipTopicGuard: true,
      }),
    ).resolves.toMatchObject({
      sanitizedOutput: '- Backend jobs\n- Frontend jobs',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('keeps guardrail sanitization flags after formatting', async () => {
    await expect(
      service.formatAssistantOutput('<script>alert(1)</script>[open](javascript:bad)', {
        skipTopicGuard: true,
      }),
    ).resolves.toMatchObject({
      sanitizedOutput: '[open](bad)',
      flags: ['output_script_removed', 'output_javascript_url_removed'],
      riskLevel: ChatGuardrailRiskLevel.MEDIUM,
    });
  });

  it('inserts paragraph break before Vietnamese follow-up phrases', async () => {
    await expect(
      service.formatAssistantOutput(
        'Có 18 công ty đang tuyển dụng trên cổng thông tin. Hãy cho tôi biết nếu bạn muốn tìm hiểu thêm.',
        { skipTopicGuard: true },
      ),
    ).resolves.toMatchObject({
      sanitizedOutput:
        'Có 18 công ty đang tuyển dụng trên cổng thông tin.\n\nHãy cho tôi biết nếu bạn muốn tìm hiểu thêm.',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('adds spaces after punctuation before Unicode letters in Vietnamese text', async () => {
    await expect(
      service.formatAssistantOutput('Kỹ năng:JavaScript,NodeJS', { skipTopicGuard: true }),
    ).resolves.toMatchObject({
      sanitizedOutput: 'Kỹ năng: JavaScript, NodeJS',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('replaces off-topic output with bilingual refusal when topic guard blocks', async () => {
    const blockedGuard = {
      classify: jest.fn().mockResolvedValue({
        blocked: true,
        onTopic: false,
        category: 'code_generation',
        reason: 'response contains HTML code',
        latencyMs: 120,
      }),
      getRefusalMessage: jest.fn().mockReturnValue('Bilingual refusal message.'),
    } as unknown as ChatOutputTopicGuardService;

    const blockedService = new ChatResponseFormatterService(
      new ChatGuardrailService(),
      blockedGuard,
    );

    const result = await blockedService.formatAssistantOutput('Here is HTML: <html>...</html>');
    expect(result.sanitizedOutput).toBe('Bilingual refusal message.');
    expect(result.flags).toContain('topic_guard_blocked');
    expect(result.riskLevel).toBe(ChatGuardrailRiskLevel.HIGH);
    expect(result.topicGuardResult?.blocked).toBe(true);
    expect(result.topicGuardResult?.category).toBe('code_generation');
  });

  it('allows on-topic output through when topic guard passes', async () => {
    const result = await service.formatAssistantOutput(
      'React là một thư viện JavaScript phổ biến cho frontend.',
    );
    expect(result.topicGuardResult?.blocked).toBe(false);
    expect(result.flags).not.toContain('topic_guard_blocked');
  });

  it('passes through response when topic guard classifier returns null (graceful degradation)', async () => {
    const degradedGuard = {
      classify: jest.fn().mockResolvedValue({
        blocked: false,
        onTopic: true,
        category: null,
        reason: 'classifier_unavailable',
        latencyMs: 5,
      }),
      getRefusalMessage: jest.fn().mockReturnValue('Refusal.'),
    } as unknown as ChatOutputTopicGuardService;

    const degradedService = new ChatResponseFormatterService(
      new ChatGuardrailService(),
      degradedGuard,
    );

    const result = await degradedService.formatAssistantOutput('Some career advice.');
    expect(result.topicGuardResult?.blocked).toBe(false);
    expect(result.flags).not.toContain('topic_guard_blocked');
  });
});
