import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatToolActionService } from './chat-tool-action.service';
import { EChatToolActionStatus, EChatToolActionType } from './enums/chat-tool-action.enum';

describe('ChatToolActionService', () => {
  let service: ChatToolActionService;
  let model: { insertMany: jest.Mock; findOne: jest.Mock; updateOne: jest.Mock };
  let usersService: { saveJob: jest.Mock };
  let configService: { get: jest.Mock };

  const userId = '507f1f77bcf86cd799439011';
  const sessionId = '507f1f77bcf86cd799439012';
  const actionId = '507f1f77bcf86cd799439013';
  const jobId = '507f1f77bcf86cd799439014';
  const user = { _id: userId, savedJobs: [] } as any;

  const createAction = (overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(actionId),
    userId: new Types.ObjectId(userId),
    sessionId: new Types.ObjectId(sessionId),
    type: EChatToolActionType.SAVE_JOB,
    status: EChatToolActionStatus.PENDING,
    payload: { jobId, jobName: 'Backend Developer' },
    label: 'Save Backend Developer',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  beforeEach(() => {
    model = {
      insertMany: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    usersService = {
      saveJob: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn(),
    };
    service = new ChatToolActionService(model as any, usersService as any, configService as any);
  });

  it('creates pending save-job actions for unsaved recommended jobs', async () => {
    model.insertMany.mockResolvedValue([createAction()]);

    const actions = await service.createSaveJobActions({
      user,
      sessionId,
      jobs: [
        {
          _id: jobId,
          name: 'Backend Developer',
          company: { _id: 'company-1', name: 'Acme' },
          location: 'Ho Chi Minh City',
          skills: ['NestJS'],
          level: 'MID',
        },
      ],
    });

    expect(model.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: new Types.ObjectId(userId),
        sessionId: new Types.ObjectId(sessionId),
        type: EChatToolActionType.SAVE_JOB,
      }),
    ]);
    expect(actions[0]).toEqual(
      expect.objectContaining({
        actionId,
        type: EChatToolActionType.SAVE_JOB,
        label: 'Save Backend Developer',
      }),
    );
  });

  it('confirms a pending save-job action owned by the user', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(createAction()) });

    const result = await service.confirm(user, actionId);

    expect(usersService.saveJob).toHaveBeenCalledWith(userId, jobId);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(actionId) },
      expect.objectContaining({
        $set: expect.objectContaining({ status: EChatToolActionStatus.CONFIRMED }),
      }),
    );
    expect(result.status).toBe(EChatToolActionStatus.CONFIRMED);
  });

  it('rejects actions owned by another user', async () => {
    model.findOne.mockReturnValue({
      exec: jest
        .fn()
        .mockResolvedValue(
          createAction({ userId: new Types.ObjectId('507f1f77bcf86cd799439099') }),
        ),
    });

    await expect(service.confirm(user, actionId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects expired actions and marks them expired', async () => {
    model.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(createAction({ expiresAt: new Date(Date.now() - 1000) })),
    });

    await expect(service.confirm(user, actionId)).rejects.toBeInstanceOf(BadRequestException);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(actionId) },
      { $set: { status: EChatToolActionStatus.EXPIRED } },
    );
  });

  it('cancels a pending action', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(createAction()) });

    const result = await service.cancel(user, actionId);

    expect(result.status).toBe(EChatToolActionStatus.CANCELED);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(actionId) },
      expect.objectContaining({
        $set: expect.objectContaining({ status: EChatToolActionStatus.CANCELED }),
      }),
    );
  });

  it('returns not found for unknown actions', async () => {
    model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.cancel(user, actionId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
