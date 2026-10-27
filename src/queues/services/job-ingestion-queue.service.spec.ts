import { JobIngestionQueueService } from './job-ingestion-queue.service';

describe('JobIngestionQueueService', () => {
  it('enqueues a deduplicated sync job that is removed on completion and on failure', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new JobIngestionQueueService(queue as any);

    await service.enqueueSync('greenhouse-axon');

    expect(queue.add).toHaveBeenCalledWith(
      'sync-source',
      { sourceKey: 'greenhouse-axon' },
      {
        jobId: 'sync-greenhouse-axon',
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('propagates queue errors to the caller', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('redis down')) };
    const service = new JobIngestionQueueService(queue as any);

    await expect(service.enqueueSync('greenhouse-axon')).rejects.toThrow('redis down');
  });
});
