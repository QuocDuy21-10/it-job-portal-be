import { NotFoundException } from '@nestjs/common';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { JobIngestionService } from './job-ingestion.service';

const SOURCE = { key: 'topdev', displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY, enabled: true };

const setup = ({
  previous = SOURCE as Record<string, any> | null,
  runs = [] as unknown[],
} = {}) => {
  const jobSourceModel = {
    find: jest.fn(),
    exists: jest.fn(),
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
  };
  const queueService = { enqueueSync: jest.fn().mockResolvedValue(undefined) };
  const coordinator = { run: jest.fn().mockResolvedValue(undefined) };

  const service = new JobIngestionService(
    jobSourceModel as any,
    crawlRunModel as any,
    repository as any,
    queueService as any,
    coordinator as any,
  );

  return {
    service,
    jobSourceModel,
    crawlRunModel,
    runsQuery,
    repository,
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
  });

  describe('findAllSources', () => {
    it('leaves the rejection list out of the response', async () => {
      const { service, jobSourceModel } = setup();
      const query = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([SOURCE]),
      };
      jobSourceModel.find.mockReturnValue(query);

      await expect(service.findAllSources()).resolves.toEqual([SOURCE]);
      expect(query.select).toHaveBeenCalledWith('-rejections');
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
        { new: false },
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
