import { ChatGuardrailRiskLevel, ChatGuardrailService } from './chat-guardrail.service';
import { ChatResponseFormatterService } from './chat-response-formatter.service';

describe('ChatResponseFormatterService', () => {
  let service: ChatResponseFormatterService;

  beforeEach(() => {
    service = new ChatResponseFormatterService(new ChatGuardrailService());
  });

  it('normalizes dense assistant text into readable Markdown spacing', () => {
    expect(
      service.formatAssistantOutput(
        'There are 18 companies hiring.Let me know if you want more details.\n\n\nThanks.',
      ),
    ).toEqual({
      sanitizedOutput:
        'There are 18 companies hiring.\n\nLet me know if you want more details.\n\nThanks.',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('preserves Markdown bullets while trimming excessive spaces', () => {
    expect(service.formatAssistantOutput('  - Backend jobs  \n- Frontend jobs  ')).toEqual({
      sanitizedOutput: '- Backend jobs\n- Frontend jobs',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('keeps guardrail sanitization flags after formatting', () => {
    expect(
      service.formatAssistantOutput('<script>alert(1)</script>[open](javascript:bad)'),
    ).toEqual({
      sanitizedOutput: '[open](bad)',
      flags: ['output_script_removed', 'output_javascript_url_removed'],
      riskLevel: ChatGuardrailRiskLevel.MEDIUM,
    });
  });

  it('inserts paragraph break before Vietnamese follow-up phrases', () => {
    expect(
      service.formatAssistantOutput(
        'Có 18 công ty đang tuyển dụng trên cổng thông tin. Hãy cho tôi biết nếu bạn muốn tìm hiểu thêm.',
      ),
    ).toEqual({
      sanitizedOutput:
        'Có 18 công ty đang tuyển dụng trên cổng thông tin.\n\nHãy cho tôi biết nếu bạn muốn tìm hiểu thêm.',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });

  it('adds spaces after punctuation before Unicode letters in Vietnamese text', () => {
    expect(service.formatAssistantOutput('Kỹ năng:JavaScript,NodeJS')).toEqual({
      sanitizedOutput: 'Kỹ năng: JavaScript, NodeJS',
      flags: [],
      riskLevel: ChatGuardrailRiskLevel.LOW,
    });
  });
});
