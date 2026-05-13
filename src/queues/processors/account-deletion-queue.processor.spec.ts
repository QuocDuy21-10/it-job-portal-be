import { AccountDeletionQueueProcessor } from './account-deletion-queue.processor';

describe('AccountDeletionQueueProcessor', () => {
  it('hard-deletes normalized chat sessions and messages during account deletion', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const userModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: userId,
          email: 'duy@example.com',
          name: 'Duy',
          scheduledDeletionAt: new Date(),
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      softDelete: jest.fn().mockResolvedValue({ deleted: 1 }),
    };
    const resumeModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const cvProfileModel = {
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const conversationModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const chatSessionModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const chatMessageModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    };
    const subscriberModel = {
      softDelete: jest.fn().mockResolvedValue({ deleted: 1 }),
    };
    const sessionModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const mailService = {
      sendAccountDeleted: jest.fn().mockResolvedValue(undefined),
    };
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new AccountDeletionQueueProcessor(
      userModel as any,
      resumeModel as any,
      cvProfileModel as any,
      conversationModel as any,
      chatSessionModel as any,
      chatMessageModel as any,
      subscriberModel as any,
      sessionModel as any,
      mailService as any,
      cacheManager as any,
    );

    await processor.process({
      id: 'job-1',
      name: 'delete-account',
      data: { userId },
    } as any);

    expect(conversationModel.deleteMany).toHaveBeenCalledWith({ userId });
    expect(chatSessionModel.deleteMany).toHaveBeenCalledWith({ userId });
    expect(chatMessageModel.deleteMany).toHaveBeenCalledWith({ userId });
  });
});
