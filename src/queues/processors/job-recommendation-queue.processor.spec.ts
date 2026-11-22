import { Job } from 'bullmq';
import { EJobApprovalStatus } from 'src/jobs/enums/job-approval-status.enum';
import { JobRecommendationQueueProcessor } from './job-recommendation-queue.processor';

const chain = (value: unknown) => {
  const q: any = {};
  for (const m of ['select', 'sort', 'limit', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

describe('JobRecommendationQueueProcessor', () => {
  it('only recommends jobs the public may see (approved, active, not expired)', async () => {
    const subscriberModel = {
      findById: jest.fn(() => chain({ email: 'sub@example.com', name: 'Sub', skills: ['NestJS'] })),
    };
    const jobModel = { find: jest.fn<any, [any]>(() => chain([])) };
    const processor = new JobRecommendationQueueProcessor(
      subscriberModel as any,
      jobModel as any,
      { sendMail: jest.fn() } as any,
      { get: jest.fn() } as any,
    );

    await processor.process({ data: { subscriberId: 'sub-1' } } as Job<any>);

    const filter = jobModel.find.mock.calls[0][0] as any;
    expect(filter).toMatchObject({
      isActive: true,
      isDeleted: false,
      approvalStatus: EJobApprovalStatus.APPROVED,
      skills: { $in: ['NestJS'] },
    });
    // Jobs with no end date stay public, as on the job pages.
    expect(filter.$or).toEqual([{ endDate: { $gte: expect.any(Date) } }, { endDate: null }]);
  });
});
