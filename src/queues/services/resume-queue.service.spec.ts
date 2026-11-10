import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { RESUME_QUEUE } from '../queues.constants';
import { ResumeQueueService } from './resume-queue.service';

describe('ResumeQueueService', () => {
  const createTestingModule = async (configValues: Record<string, string | undefined> = {}) => {
    const queueMock = {
      add: jest.fn(),
      getWaitingCount: jest.fn(),
      getActiveCount: jest.fn(),
      getCompletedCount: jest.fn(),
      getFailedCount: jest.fn(),
      getDelayedCount: jest.fn(),
      getJob: jest.fn(),
      clean: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeQueueService,
        {
          provide: getQueueToken(RESUME_QUEUE),
          useValue: queueMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    return {
      service: module.get<ResumeQueueService>(ResumeQueueService),
      queueMock,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reschedules parse jobs with jittered delay when Gemini quota is exhausted', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { service, queueMock } = await createTestingModule({
      GEMINI_QUOTA_RETRY_JITTER_MS: '1000',
    });
    queueMock.add.mockResolvedValue({ id: 'delayed-job-id' });

    const result = await service.scheduleParseResumeRetry(
      {
        resumeId: 'resume-1',
        filePath: '/tmp/cv.pdf',
        jobId: 'job-1',
      },
      60000,
    );

    expect(randomSpy).toHaveBeenCalled();
    expect(queueMock.add).toHaveBeenCalledWith(
      'parse-resume',
      {
        resumeId: 'resume-1',
        filePath: '/tmp/cv.pdf',
        jobId: 'job-1',
      },
      {
        priority: 1,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        delay: 60500,
      },
    );
    expect(result).toEqual({
      job: { id: 'delayed-job-id' },
      delayMs: 60500,
    });
  });

  it('dedupes parse and analyze jobs per resume while they are in flight', async () => {
    const { service, queueMock } = await createTestingModule();
    queueMock.add.mockResolvedValue({ id: 'job-id' });

    await service.addParseResumeJob({
      resumeId: 'resume-1',
      filePath: '/tmp/cv.pdf',
      jobId: 'job-1',
    });
    await service.addAnalyzeResumeJob({ resumeId: 'resume-1', jobId: 'job-1' });

    expect(queueMock.add.mock.calls[0][2].deduplication).toEqual({ id: 'parse:resume-1' });
    expect(queueMock.add.mock.calls[1][2].deduplication).toEqual({ id: 'analyze:resume-1' });
  });

  it('does not dedupe quota retries, since the original parse job is still active', async () => {
    const { service, queueMock } = await createTestingModule();
    queueMock.add.mockResolvedValue({ id: 'job-id' });

    await service.scheduleParseResumeRetry(
      { resumeId: 'resume-1', filePath: '/tmp/cv.pdf', jobId: 'job-1' },
      1000,
    );

    expect(queueMock.add.mock.calls[0][2].deduplication).toBeUndefined();
  });
});
