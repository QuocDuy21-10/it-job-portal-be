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

  describe('cancelSync', () => {
    const build = (job: any) =>
      new JobIngestionQueueService({ getJob: jest.fn().mockResolvedValue(job) } as any);
    const buildJob = (active: boolean, remove = jest.fn()) => ({
      isActive: jest.fn().mockResolvedValue(active),
      remove,
    });

    it('is done when nothing is queued', async () => {
      await expect(build(undefined).cancelSync('topdev')).resolves.toBe(true);
    });

    it('removes a waiting sync', async () => {
      const job = buildJob(false);
      await expect(build(job).cancelSync('topdev')).resolves.toBe(true);
      expect(job.remove).toHaveBeenCalled();
    });

    it('reports a running sync without removing it', async () => {
      const job = buildJob(true);
      await expect(build(job).cancelSync('topdev')).resolves.toBe(false);
      expect(job.remove).not.toHaveBeenCalled();
    });

    it('reports a sync that started while it was being removed', async () => {
      const job = buildJob(false, jest.fn().mockRejectedValue(new Error('locked')));
      job.isActive.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await expect(build(job).cancelSync('topdev')).resolves.toBe(false);
    });

    it('propagates other removal errors', async () => {
      const job = buildJob(false, jest.fn().mockRejectedValue(new Error('redis down')));
      await expect(build(job).cancelSync('topdev')).rejects.toThrow('redis down');
    });
  });

  it('propagates queue errors to the caller', async () => {
    const queue = { add: jest.fn().mockRejectedValue(new Error('redis down')) };
    const service = new JobIngestionQueueService(queue as any);

    await expect(service.enqueueSync('greenhouse-axon')).rejects.toThrow('redis down');
  });
});
