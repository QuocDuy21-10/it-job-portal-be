import { ResumeQueueProcessor } from './resume-queue.processor';
import { GeminiQuotaDeniedException } from 'src/gemini/gemini-quota-denied.exception';

const data = { resumeId: 'r1', jobId: 'j1' };
const makeJob = () => ({ id: '1', name: 'parse-resume', data, updateProgress: jest.fn() }) as any;

describe('ResumeQueueProcessor parse flow', () => {
  let deps: Record<string, any>;
  let processor: ResumeQueueProcessor;

  beforeEach(() => {
    deps = {
      resumeModel: {
        findById: jest.fn().mockReturnValue({
          select: () => ({ lean: () => Promise.resolve({ url: 'a.pdf' }) }),
        }),
        findByIdAndUpdate: jest.fn().mockResolvedValue({ companyId: 'c1' }),
      },
      cvParser: {
        extractTextFromCV: jest.fn().mockResolvedValue('text'),
        validateExtractedText: jest.fn().mockReturnValue({ valid: true }),
        cleanText: jest.fn().mockReturnValue('clean'),
      },
      ai: { parseCV: jest.fn().mockResolvedValue({ skills: [] }) },
      skills: {
        normalizeExtractedSkills: jest
          .fn()
          .mockResolvedValue({ normalizedSkills: [], unmappedSkills: [] }),
      },
      queueService: {
        addAnalyzeResumeJob: jest.fn().mockResolvedValue({ id: 'a1' }),
        scheduleParseResumeRetry: jest.fn().mockResolvedValue({ delayMs: 1000 }),
      },
      stats: { clearScopedDashboards: jest.fn().mockResolvedValue(undefined) },
      cache: { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() },
    };
    processor = new ResumeQueueProcessor(
      deps.resumeModel,
      deps.cvParser,
      deps.ai,
      {} as any,
      {} as any,
      deps.skills,
      deps.queueService,
      deps.stats,
      deps.cache,
      {} as any,
    );
  });

  it('queues analysis exactly once after a fresh parse', async () => {
    await processor.process(makeJob());
    expect(deps.queueService.addAnalyzeResumeJob).toHaveBeenCalledTimes(1);
    expect(deps.queueService.addAnalyzeResumeJob).toHaveBeenCalledWith(data);
  });

  it('queues analysis on a cache hit too', async () => {
    deps.cache.get.mockResolvedValue({ skills: [] });
    await processor.process(makeJob());
    expect(deps.ai.parseCV).not.toHaveBeenCalled();
    expect(deps.queueService.addAnalyzeResumeJob).toHaveBeenCalledWith(data);
  });

  it('does not queue analysis when parsing is rescheduled for quota', async () => {
    deps.ai.parseCV.mockRejectedValue(
      new GeminiQuotaDeniedException('parse', 'minute', 1000, 0, 10),
    );
    await processor.process(makeJob());
    expect(deps.queueService.addAnalyzeResumeJob).not.toHaveBeenCalled();
  });

  it('throws when queueing analysis fails, without marking the parse as failed', async () => {
    deps.queueService.addAnalyzeResumeJob.mockRejectedValue(new Error('redis down'));

    await expect(processor.process(makeJob())).rejects.toThrow('redis down');
    expect(deps.resumeModel.findByIdAndUpdate).not.toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ isParsed: false }),
      expect.anything(),
    );
  });
});
