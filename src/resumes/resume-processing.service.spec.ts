jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    ...jest.requireActual('fs').promises,
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

import { ResumeProcessingService } from './resume-processing.service';

const file = {
  path: '/tmp/x.pdf',
  filename: 'x.pdf',
  originalname: 'x.pdf',
  mimetype: 'application/pdf',
  size: 1024,
} as Express.Multer.File;
const user = { _id: '507f1f77bcf86cd799439099', email: 'c@example.com' } as any;
const JOB_ID = '507f1f77bcf86cd799439088';
const activeJob = {
  _id: JOB_ID,
  name: 'Dev',
  isActive: true,
  company: { _id: 'c1', name: 'Acme' },
};

describe('ResumeProcessingService.handleUploadAndQueue', () => {
  let resumeModel: Record<string, jest.Mock>;
  let jobsService: { findOne: jest.Mock };
  let queue: { addParseResumeJob: jest.Mock; addAnalyzeResumeJob: jest.Mock };
  let service: ResumeProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    resumeModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ _id: { toString: () => 'r1' }, url: 'x.pdf' }),
    };
    jobsService = { findOne: jest.fn().mockResolvedValue(activeJob) };
    queue = {
      addParseResumeJob: jest.fn().mockResolvedValue({ id: 'p1' }),
      addAnalyzeResumeJob: jest.fn(),
    };
    service = new ResumeProcessingService(resumeModel as any, jobsService as any);
  });

  it('queues only the parse job; analysis is chained by the processor', async () => {
    const result = await service.handleUploadAndQueue(file, { jobId: JOB_ID }, user, queue as any);

    expect(queue.addParseResumeJob).toHaveBeenCalledWith({ resumeId: 'r1', jobId: JOB_ID });
    expect(queue.addAnalyzeResumeJob).not.toHaveBeenCalled();
    expect(result.response.jobs).toEqual({ parseJobId: 'p1' });
  });
});
