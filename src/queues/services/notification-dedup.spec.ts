import { ApplicationNotificationQueueService } from './application-notification-queue.service';
import { CompanyFollowerQueueService } from './company-follower-queue.service';
import { JobExpirationQueueService } from './job-expiration-queue.service';
import { JobRecommendationQueueService } from './job-recommendation-queue.service';
import { QUEUE_DEDUP_TTL_MS } from '../queues.constants';

const createQueue = () => ({
  add: jest.fn().mockResolvedValue({ id: 'job-id' }),
  addBulk: jest.fn().mockResolvedValue([]),
});

const optsOf = (mock: jest.Mock, call = 0) => mock.mock.calls[call][2];

describe('notification queue deduplication', () => {
  afterEach(() => jest.useRealTimers());

  it('dedupes job expiration per job and end date', async () => {
    const queue = createQueue();
    await new JobExpirationQueueService(queue as any).addExpiredJobNotification({
      jobId: 'job-1',
      jobName: 'Backend',
      companyName: 'Acme',
      hrEmail: 'hr@example.com',
      endDate: '2026-11-01T00:00:00.000Z',
    });

    expect(optsOf(queue.add).deduplication).toEqual({
      id: `job-expired:job-1:${Date.parse('2026-11-01T00:00:00.000Z')}`,
      ttl: QUEUE_DEDUP_TTL_MS.JOB_EXPIRED,
    });
  });

  it('dedupes follower notifications per job', async () => {
    const queue = createQueue();
    await new CompanyFollowerQueueService(queue as any).addNewJobNotification({
      jobId: 'job-1',
      companyId: 'company-1',
      jobName: 'Backend',
      companyName: 'Acme',
    });

    expect(optsOf(queue.add).deduplication).toEqual({
      id: 'new-job:job-1',
      ttl: QUEUE_DEDUP_TTL_MS.NEW_JOB,
    });
  });

  it('dedupes status emails per resume and status, and new application emails per resume', async () => {
    const queue = createQueue();
    const service = new ApplicationNotificationQueueService(queue as any);

    await service.addStatusUpdateEmail({
      userName: 'Candidate',
      userEmail: 'candidate@example.com',
      jobName: 'Backend',
      companyName: 'Acme',
      newStatus: 'APPROVED',
      resumeId: 'resume-1',
    });
    await service.addNewApplicationEmail({
      hrEmail: 'hr@example.com',
      hrName: 'HR',
      candidateName: 'Candidate',
      candidateEmail: 'candidate@example.com',
      jobName: 'Backend',
      companyName: 'Acme',
      resumeId: 'resume-1',
    });

    expect(optsOf(queue.add, 0).deduplication).toEqual({
      id: 'status:resume-1:APPROVED',
      ttl: QUEUE_DEDUP_TTL_MS.STATUS_UPDATE,
    });
    expect(optsOf(queue.add, 1).deduplication).toEqual({
      id: 'new-application:resume-1',
      ttl: QUEUE_DEDUP_TTL_MS.NEW_APPLICATION,
    });
  });

  it('dedupes recommendations per subscriber and ISO week for single and bulk adds', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T02:00:00.000Z'));
    const queue = createQueue();
    const service = new JobRecommendationQueueService(queue as any);

    await service.addSubscriberToQueue('sub-1');
    await service.addSubscribersToQueueBatch(['sub-2']);

    const expected = (id: string) => ({
      id: `rec:${id}:2026-W46`,
      ttl: QUEUE_DEDUP_TTL_MS.JOB_RECOMMENDATION,
    });
    expect(optsOf(queue.add).deduplication).toEqual(expected('sub-1'));
    expect(queue.addBulk.mock.calls[0][0][0].opts.deduplication).toEqual(expected('sub-2'));
  });
});
