import { ConflictException, NotFoundException } from '@nestjs/common';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { EJobSourceProvider } from './enums/job-source-provider.enum';
import { JobIngestionService } from './job-ingestion.service';

const SOURCE = { key: 'topdev', displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY, enabled: true };

const setup = ({
  previous = SOURCE as Record<string, any> | null,
  runs = [] as unknown[],
  current = { enabled: false } as Record<string, any> | null,
} = {}) => {
  const jobSourceModel = {
    find: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(async (doc: any) => ({ toObject: () => doc })),
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(current) }),
    }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    findOneAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(previous) }),
  };
  const runsQuery = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(runs),
  };
  const crawlRunModel = { find: jest.fn().mockReturnValue(runsQuery) };
  const repository = {
    clearDescriptions: jest.fn().mockResolvedValue(undefined),
    resetFetchedAt: jest.fn().mockResolvedValue(undefined),
    countByState: jest.fn().mockResolvedValue(new Map()),
    closeSource: jest.fn().mockResolvedValue(3),
  };
  const crawlFailures = {
    countByGroup: jest.fn().mockResolvedValue(new Map()),
    deleteBySource: jest.fn().mockResolvedValue(undefined),
  };
  const queueService = {
    enqueueSync: jest.fn().mockResolvedValue(undefined),
    cancelSync: jest.fn().mockResolvedValue(true),
  };
  const coordinator = { run: jest.fn().mockResolvedValue(undefined) };

  const cronLock = {
    runExclusive: jest.fn(async (_name: string, fn: () => Promise<unknown>) => {
      await fn();
    }),
  };

  const service = new JobIngestionService(
    jobSourceModel as any,
    crawlRunModel as any,
    repository as any,
    crawlFailures as any,
    queueService as any,
    coordinator as any,
    cronLock as any,
  );

  return {
    service,
    cronLock,
    jobSourceModel,
    crawlRunModel,
    runsQuery,
    repository,
    crawlFailures,
    queueService,
    coordinator,
  };
};

describe('JobIngestionService', () => {
  describe('syncSource', () => {
    it('delegates to the coordinator', async () => {
      const { service, coordinator } = setup();

      await service.syncSource('topdev');

      expect(coordinator.run).toHaveBeenCalledWith('topdev');
    });
  });

  describe('enqueueEnabledSources', () => {
    it('enqueues every enabled source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ key: 'greenhouse-axon' }, { key: 'lever-acme' }]),
        }),
      });

      await service.enqueueEnabledSources();

      expect(jobSourceModel.find).toHaveBeenCalledWith({ enabled: true });
      expect(queueService.enqueueSync).toHaveBeenCalledWith('greenhouse-axon');
      expect(queueService.enqueueSync).toHaveBeenCalledWith('lever-acme');
    });

    it('runs the scheduled sync through the cron lock', async () => {
      const { service, jobSourceModel, cronLock } = setup();
      jobSourceModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });

      await service.runSourceSyncCron();

      expect(cronLock.runExclusive).toHaveBeenCalledWith(
        'sync-external-job-sources',
        expect.any(Function),
      );
      expect(jobSourceModel.find).toHaveBeenCalledWith({ enabled: true });
    });
  });

  describe('findAllSources', () => {
    it('adds job and failure counts and leaves the old rejection list out', async () => {
      const { service, jobSourceModel, repository, crawlFailures } = setup();
      const query = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([SOURCE, { ...SOURCE, key: 'empty' }]),
      };
      jobSourceModel.find.mockReturnValue(query);
      repository.countByState.mockResolvedValue(
        new Map([['topdev', { total: 6, active: 3, stale: 1, closed: 1, removed: 1 }]]),
      );
      crawlFailures.countByGroup.mockResolvedValue(
        new Map([['topdev', { errors: 2, filtered: 9 }]]),
      );

      const [topdev, empty] = await service.findAllSources();

      expect(query.select).toHaveBeenCalledWith('-rejections');
      expect(topdev.counts).toEqual({
        total: 6,
        active: 3,
        stale: 1,
        closed: 1,
        removed: 1,
        errors: 2,
        filtered: 9,
      });
      expect(Object.values(empty.counts)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe('createSource', () => {
    it('stores the source and queues its first sync', async () => {
      const { service, jobSourceModel, queueService } = setup();

      await service.createSource({
        provider: EJobSourceProvider.LEVER,
        boardToken: 'acme',
        companyName: 'Acme',
      } as any);

      expect(jobSourceModel.create).toHaveBeenCalledWith({
        key: 'lever-acme',
        provider: EJobSourceProvider.LEVER,
        boardToken: 'acme',
        companyName: 'Acme',
        displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY,
        enabled: true,
      });
      expect(queueService.enqueueSync).toHaveBeenCalledWith('lever-acme');
    });
  });

  describe('deleteSource', () => {
    it('closes the jobs, forgets the failures and deletes the source last', async () => {
      const { service, jobSourceModel, repository, crawlFailures } = setup();

      await expect(service.deleteSource('topdev')).resolves.toEqual({ key: 'topdev', closed: 3 });

      expect(repository.closeSource).toHaveBeenCalledWith('topdev', expect.any(Date));
      expect(crawlFailures.deleteBySource).toHaveBeenCalledWith('topdev');
      expect(jobSourceModel.deleteOne).toHaveBeenCalledWith({ key: 'topdev', enabled: false });
      expect(jobSourceModel.deleteOne.mock.invocationCallOrder[0]).toBeGreaterThan(
        crawlFailures.deleteBySource.mock.invocationCallOrder[0],
      );
    });

    it('throws 404 for an unknown source', async () => {
      const { service } = setup({ current: null });
      await expect(service.deleteSource('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an enabled source', async () => {
      const { service, repository } = setup({ current: { enabled: true } });
      await expect(service.deleteSource('topdev')).rejects.toBeInstanceOf(ConflictException);
      expect(repository.closeSource).not.toHaveBeenCalled();
    });

    it('refuses while a sync is running', async () => {
      const { service, repository, queueService } = setup();
      queueService.cancelSync.mockResolvedValue(false);
      await expect(service.deleteSource('topdev')).rejects.toBeInstanceOf(ConflictException);
      expect(repository.closeSource).not.toHaveBeenCalled();
    });

    it('reports a source re-enabled in the meantime', async () => {
      const { service, jobSourceModel } = setup();
      jobSourceModel.deleteOne.mockResolvedValue({ deletedCount: 0 });
      await expect(service.deleteSource('topdev')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('requestSync', () => {
    it('enqueues an existing source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.exists.mockResolvedValue({ _id: 'x' });

      await expect(service.requestSync('greenhouse-axon')).resolves.toEqual({
        key: 'greenhouse-axon',
        queued: true,
      });
      expect(queueService.enqueueSync).toHaveBeenCalledWith('greenhouse-axon');
    });

    it('throws NotFoundException for an unknown source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.exists.mockResolvedValue(null);

      await expect(service.requestSync('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(queueService.enqueueSync).not.toHaveBeenCalled();
    });
  });

  describe('updateSource', () => {
    it('saves the change and returns the updated source', async () => {
      const { service, jobSourceModel } = setup();

      await expect(service.updateSource('topdev', { enabled: false })).resolves.toEqual({
        ...SOURCE,
        enabled: false,
      });
      expect(jobSourceModel.findOneAndUpdate).toHaveBeenCalledWith(
        { key: 'topdev' },
        { $set: { enabled: false } },
        { new: false, projection: { rejections: 0 } },
      );
    });

    it('clears stored descriptions when switching to LINK_ONLY', async () => {
      const { service, repository } = setup({
        previous: { ...SOURCE, displayPolicy: EJobSourceDisplayPolicy.FULL },
      });

      await service.updateSource('topdev', { displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY });

      expect(repository.clearDescriptions).toHaveBeenCalledWith('topdev');
      expect(repository.resetFetchedAt).not.toHaveBeenCalled();
    });

    it('schedules a refresh when switching to FULL', async () => {
      const { service, repository } = setup();

      await service.updateSource('topdev', { displayPolicy: EJobSourceDisplayPolicy.FULL });

      expect(repository.resetFetchedAt).toHaveBeenCalledWith('topdev');
      expect(repository.clearDescriptions).not.toHaveBeenCalled();
    });

    it('does nothing extra when the policy does not change or becomes HIDDEN', async () => {
      const { service, repository } = setup();

      await service.updateSource('topdev', { displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY });
      await service.updateSource('topdev', { displayPolicy: EJobSourceDisplayPolicy.HIDDEN });

      expect(repository.clearDescriptions).not.toHaveBeenCalled();
      expect(repository.resetFetchedAt).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown source', async () => {
      const { service } = setup({ previous: null });

      await expect(service.updateSource('nope', { enabled: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findRuns', () => {
    it('returns the newest runs with a bounded limit', async () => {
      const runs = [{ sourceKey: 'topdev' }];
      const { service, jobSourceModel, crawlRunModel, runsQuery } = setup({ runs });
      jobSourceModel.exists.mockResolvedValue({ _id: 'x' });

      await expect(service.findRuns('topdev', { limit: '500' } as any)).resolves.toBe(runs);
      expect(crawlRunModel.find).toHaveBeenCalledWith({ sourceKey: 'topdev' });
      expect(runsQuery.sort).toHaveBeenCalledWith({ startedAt: -1 });
      expect(runsQuery.limit).toHaveBeenCalledWith(100);
    });

    it('defaults to 20 runs', async () => {
      const { service, jobSourceModel, runsQuery } = setup();
      jobSourceModel.exists.mockResolvedValue({ _id: 'x' });

      await service.findRuns('topdev', {});

      expect(runsQuery.limit).toHaveBeenCalledWith(20);
    });

    it('throws NotFoundException for an unknown source', async () => {
      const { service, jobSourceModel } = setup();
      jobSourceModel.exists.mockResolvedValue(null);

      await expect(service.findRuns('nope', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
