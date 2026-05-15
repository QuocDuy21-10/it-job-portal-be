import { AIService } from 'src/ai/ai.service';
import { ChatIntentService } from './chat-intent.service';
import { EChatIntent } from './enums/chat-intent.enum';
import { EChatSessionType } from './enums/chat-session-type.enum';

describe('ChatIntentService', () => {
  let service: ChatIntentService;
  let mockAIService: { generateChat: jest.Mock };

  beforeEach(() => {
    mockAIService = {
      generateChat: jest.fn(),
    };
    service = new ChatIntentService(mockAIService as unknown as AIService);
  });

  it('detects job advisor messages with deterministic rules', async () => {
    await expect(
      service.detectIntent({
        message: 'Show me backend jobs in Ho Chi Minh City',
        allowAiFallback: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        intent: EChatIntent.JOB_ADVISOR,
        source: 'deterministic',
      }),
    );
    expect(mockAIService.generateChat).not.toHaveBeenCalled();
  });

  it('uses jobId and matching terms as job matching precedence', async () => {
    await expect(
      service.detectIntent({
        message: 'Am I a good match for this role?',
        jobId: '507f1f77bcf86cd799439013',
        allowAiFallback: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        intent: EChatIntent.JOB_MATCHING,
        source: 'deterministic',
      }),
    );
  });

  it('uses session type as fallback when message has no clear keywords', async () => {
    await expect(
      service.detectIntent({
        message: 'Please help with this',
        sessionType: EChatSessionType.CV_REVIEW,
        allowAiFallback: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        intent: EChatIntent.CV_REVIEW,
        source: 'session_type',
      }),
    );
  });

  it('detects company, FAQ, CV review, and recruiter support intents', async () => {
    await expect(
      service.detectIntent({ message: 'Tell me about this company culture' }),
    ).resolves.toMatchObject({ intent: EChatIntent.COMPANY_INFO });
    await expect(
      service.detectIntent({ message: 'How to apply for a job?' }),
    ).resolves.toMatchObject({
      intent: EChatIntent.FAQ,
    });
    await expect(service.detectIntent({ message: 'Review my CV please' })).resolves.toMatchObject({
      intent: EChatIntent.CV_REVIEW,
    });
    await expect(
      service.detectIntent({ message: 'How can HR post job openings?' }),
    ).resolves.toMatchObject({
      intent: EChatIntent.RECRUITER_SUPPORT,
    });
  });

  it('uses AI classification for low-confidence ties and falls back safely on AI failure', async () => {
    mockAIService.generateChat.mockResolvedValueOnce({
      text: '{"intent":"company_info","confidence":0.82}',
    });

    await expect(
      service.detectIntent({
        message: 'company apply',
        allowAiFallback: true,
      }),
    ).resolves.toEqual({
      intent: EChatIntent.COMPANY_INFO,
      confidence: 0.82,
      source: 'ai',
    });

    mockAIService.generateChat.mockRejectedValueOnce(new Error('provider failed'));

    await expect(
      service.detectIntent({
        message: 'company apply',
        allowAiFallback: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        source: 'fallback',
      }),
    );
  });
});
