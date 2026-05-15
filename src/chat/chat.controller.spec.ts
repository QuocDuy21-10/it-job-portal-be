import { ChatController } from './chat.controller';
import { ChatQuotaExceededException } from './exceptions/too-many-requests.exception';

describe('ChatController stream quota errors', () => {
  it('writes quota exceeded as an SSE error event with camelCase quota metadata', async () => {
    const chatService = {
      streamMessage: jest.fn().mockImplementation(async function* () {
        throw new ChatQuotaExceededException({
          limit: 30,
          used: 30,
          remaining: 0,
          resetAt: new Date('2024-12-02T00:00:00.000Z'),
          unlimited: false,
        });
      }),
    };
    const controller = new ChatController(chatService as any, {} as any, {} as any);
    const writes: string[] = [];
    const response = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => writes.push(chunk)),
      end: jest.fn(),
    };

    await controller.streamMessage(
      { _id: '507f1f77bcf86cd799439011' } as any,
      { message: 'hello' } as any,
      response as any,
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.end).toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('event: error');

    const data = JSON.parse(writes[0].match(/^data: (.*)$/m)?.[1] ?? '{}');
    expect(data).toEqual({
      message: 'Daily chatbot quota exceeded. Please try again after the quota resets.',
      quota: {
        remainingQuota: 0,
        nextResetTime: 1733097600,
      },
    });
  });
});
