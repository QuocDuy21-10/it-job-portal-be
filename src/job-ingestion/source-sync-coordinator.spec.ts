import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { IAtsFetchOptions, IAtsFetchResult, IRawAtsJob } from './adapters/ats-adapter.interface';
import { EExternalJobCloseReason } from './enums/external-job-close-reason.enum';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { EJobSourceDisplayPolicy } from './enums/job-source-display-policy.enum';
import { EJobSourceProvider } from './enums/job-source-provider.enum';
import { ERejectionReason } from './enums/rejection-reason.enum';
import { ESyncStatus } from './enums/sync-status.enum';
import { IKnownJobState } from './interfaces/job-lifecycle.interface';
import { HOUR_MS } from './job-ingestion.constants';
import { JobLifecycleService } from './job-lifecycle.service';
import { SourceSyncCoordinator } from './source-sync-coordinator';

const HCM = 'Ho Chi Minh City, Ho Chi Minh City, Vietnam';
const KEY = 'greenhouse-axon';

const SOURCE = {
  key: KEY,
  provider: EJobSourceProvider.GREENHOUSE,
  boardToken: 'axon',
  companyName: 'Axon',
  enabled: true,
  displayPolicy: EJobSourceDisplayPolicy.FULL,
  consecutiveFailures: 0,
};

const buildRaw = (overrides: Partial<IRawAtsJob> = {}): IRawAtsJob => ({
  externalId: '1',
  title: 'Senior Backend Software Engineer',
  location: HCM,
  sourceUrl: 'https://job-boards.greenhouse.io/axon/jobs/1',
  descriptionHtml: '<p>We use Node.js daily.</p>',
  ...overrides,
});

const known = (entries: Array<Partial<IKnownJobState> & { externalId: string }>) =>
  new Map<string, IKnownJobState>(
    entries.map(entry => [
      entry.externalId,
      { status: EExternalJobStatus.ACTIVE, lastFetchedAt: new Date(), ...entry },
    ]),
  );

const setup = ({
  source = SOURCE as Record<string, any> | null,
  result = { jobs: [buildRaw()], listedIds: ['1'] } as IAtsFetchResult | Error,
  knownStates = new Map<string, IKnownJobState>(),
  visibleCount = 0,
  upsertCounts = { created: 1, updated: 0, unchanged: 0, reactivated: 0 },
} = {}) => {
  const jobSourceModel = {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(source) }),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const crawlRunModel = {
    create: jest.fn().mockResolvedValue({ _id: 'run-1' }),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const repository = {
    loadKnownStates: jest.fn().mockResolvedValue(knownStates),
    upsertFetched: jest.fn().mockResolvedValue(upsertCounts),
    markSeen: jest.fn().mockResolvedValue(undefined),
    markStale: jest.fn().mockResolvedValue(0),
    close: jest.fn().mockResolvedValue(0),
    closeExpired: jest.fn().mockResolvedValue(0),
    countVisible: jest.fn().mockResolvedValue(visibleCount),
    clearDescriptions: jest.fn().mockResolvedValue(undefined),
  };
  const skillsService = { getAliasMap: jest.fn().mockResolvedValue({ 'node.js': 'Node.js' }) };
  let plannedIds: string[] | undefined;
  const greenhouseAdapter = {
    provider: EJobSourceProvider.GREENHOUSE,
    fetchJobs: jest.fn(async (_token: string, options: IAtsFetchOptions) => {
      if (result instanceof Error) {
        throw result;
      }

      plannedIds = options.selectForFetch(result.listedIds);
      return result;
    }),
  };
  const idle = (provider: EJobSourceProvider) => ({ provider, fetchJobs: jest.fn() });

  const coordinator = new SourceSyncCoordinator(
    jobSourceModel as any,
    crawlRunModel as any,
    repository as any,
    new JobLifecycleService(),
    skillsService as any,
    greenhouseAdapter as any,
    idle(EJobSourceProvider.LEVER) as any,
    idle(EJobSourceProvider.TOPDEV) as any,
    idle(EJobSourceProvider.ITVIEC) as any,
  );

  return {
    coordinator,
    jobSourceModel,
    crawlRunModel,
    repository,
    greenhouseAdapter,
    plannedIds: () => plannedIds,
    sourceUpdate: () => jobSourceModel.updateOne.mock.calls[0][1],
    runUpdate: () => crawlRunModel.updateOne.mock.calls[0][1].$set,
  };
};

describe('SourceSyncCoordinator', () => {
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('stores kept jobs, remembers rejected ids and records a successful run', async () => {
    const { coordinator, repository, crawlRunModel, sourceUpdate, runUpdate } = setup({
      result: {
        jobs: [
          buildRaw(),
          buildRaw({ externalId: '2', title: 'Office Administrator' }),
          buildRaw({ externalId: '3', sourceUrl: '' }),
        ],
        listedIds: ['1', '2', '3'],
      },
    });

    await coordinator.run(KEY);

    expect(crawlRunModel.create).toHaveBeenCalledWith({
      sourceKey: KEY,
      startedAt: expect.any(Date),
      status: ESyncStatus.RUNNING,
    });
    expect(repository.clearDescriptions).not.toHaveBeenCalled();
    expect(repository.upsertFetched.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        externalId: '1',
        skills: ['Node.js'],
        descriptionHtml: '<p>We use Node.js daily.</p>',
      }),
    ]);
    const { $set, $unset } = sourceUpdate();
    expect($set).toEqual(
      expect.objectContaining({
        lastSyncStatus: ESyncStatus.SUCCESS,
        consecutiveFailures: 0,
        lastSuccessfulListedCount: 3,
        rejections: [
          { externalId: '2', reason: ERejectionReason.NOT_IT, retryAt: expect.any(Date) },
          { externalId: '3', reason: ERejectionReason.MISSING_FIELDS, retryAt: expect.any(Date) },
        ],
      }),
    );
    expect($unset).toEqual({ rejectedExternalIds: 1, lastSyncError: 1 });
    expect(crawlRunModel.updateOne.mock.calls[0][0]).toEqual({ _id: 'run-1' });
    expect(runUpdate()).toEqual({
      status: ESyncStatus.SUCCESS,
      finishedAt: expect.any(Date),
      stats: {
        listed: 3,
        planned: 3,
        fetched: 3,
        kept: 1,
        rejected: 2,
        created: 1,
        updated: 0,
        unchanged: 0,
        reactivated: 0,
        staled: 0,
        closed: 0,
      },
    });
  });

  it.each([
    ['LINK_ONLY', { ...SOURCE, displayPolicy: EJobSourceDisplayPolicy.LINK_ONLY }],
    ['missing', { ...SOURCE, displayPolicy: undefined }],
  ])('stores no description when the display policy is %s', async (_label, source) => {
    const { coordinator, repository } = setup({ source });

    await coordinator.run(KEY);

    expect(repository.clearDescriptions).toHaveBeenCalledWith(KEY);
    expect(repository.upsertFetched.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({ descriptionHtml: '', skills: ['Node.js'] }),
    );
  });

  it('records PARTIAL when the adapter stops early and keeps unfetched listed jobs', async () => {
    const { coordinator, repository, sourceUpdate, runUpdate } = setup({
      knownStates: known([{ externalId: '5' }]),
      result: { jobs: [], listedIds: ['5', '6'], stoppedEarly: '429' },
    });

    await coordinator.run(KEY);

    expect(repository.markSeen).toHaveBeenCalledWith(KEY, ['5'], expect.any(Date));
    expect(repository.markStale).toHaveBeenCalledWith(KEY, [], expect.any(Date));
    expect(repository.close).toHaveBeenCalledWith(KEY, [], expect.any(Date));
    expect(sourceUpdate().$set).toEqual(
      expect.objectContaining({
        lastSyncStatus: ESyncStatus.PARTIAL,
        lastSyncError: 'stopped early: 429',
        consecutiveFailures: 0,
        lastSuccessfulListedCount: 2,
      }),
    );
    expect(runUpdate()).toEqual(
      expect.objectContaining({ status: ESyncStatus.PARTIAL, stoppedReason: '429' }),
    );
  });

  it('marks a listing that lost most jobs as SUSPECT and closes nothing for absence', async () => {
    const { coordinator, repository, sourceUpdate } = setup({
      source: { ...SOURCE, lastSuccessfulListedCount: 100 },
      knownStates: known([{ externalId: 'gone' }]),
      result: { jobs: [], listedIds: Array.from({ length: 20 }, (_, i) => `n${i}`) },
    });

    await coordinator.run(KEY);

    expect(repository.markStale).toHaveBeenCalledWith(KEY, [], expect.any(Date));
    expect(repository.closeExpired).toHaveBeenCalledWith(KEY, expect.any(Date));
    const { $set } = sourceUpdate();
    expect($set).toEqual(
      expect.objectContaining({
        lastSyncStatus: ESyncStatus.SUSPECT,
        lastSyncError: 'listing shrank: 20 of 100',
        consecutiveFailures: 1,
      }),
    );
    expect($set.lastSuccessfulListedCount).toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('[ingestion-alert]'));
  });

  it('falls back to the visible job count when there is no previous listing size', async () => {
    const { coordinator, repository, sourceUpdate } = setup({
      visibleCount: 3,
      result: { jobs: [], listedIds: [] },
    });

    await coordinator.run(KEY);

    expect(repository.countVisible).toHaveBeenCalledWith(KEY);
    expect(sourceUpdate().$set.lastSyncStatus).toBe(ESyncStatus.SUSPECT);
  });

  it('moves absent jobs to STALE and closes those stale past the grace period', async () => {
    const now = Date.now();
    const { coordinator, repository } = setup({
      knownStates: known([
        { externalId: 'a' },
        {
          externalId: 'b',
          status: EExternalJobStatus.STALE,
          staleSince: new Date(now - 6 * HOUR_MS),
        },
        { externalId: 'c', status: EExternalJobStatus.STALE, staleSince: new Date(now - HOUR_MS) },
      ]),
    });

    await coordinator.run(KEY);

    expect(repository.markStale).toHaveBeenCalledWith(KEY, ['a'], expect.any(Date));
    expect(repository.close).toHaveBeenCalledWith(
      KEY,
      [{ externalId: 'b', reason: EExternalJobCloseReason.GONE_FROM_SOURCE }],
      expect.any(Date),
    );
  });

  it('asks the adapter to refetch closed jobs that reappear, after new ones', async () => {
    const { coordinator, plannedIds } = setup({
      knownStates: known([
        {
          externalId: '7',
          status: EExternalJobStatus.CLOSED,
          closeReason: EExternalJobCloseReason.GONE_FROM_SOURCE,
        },
      ]),
      result: { jobs: [], listedIds: ['7', '8'] },
    });

    await coordinator.run(KEY);

    expect(plannedIds()).toEqual(['8', '7']);
  });

  it('reports reactivated and closed counts in the run stats', async () => {
    const { coordinator, repository, runUpdate } = setup({
      upsertCounts: { created: 0, updated: 0, unchanged: 1, reactivated: 1 },
    });
    repository.close.mockResolvedValue(1);
    repository.closeExpired.mockResolvedValue(2);

    await coordinator.run(KEY);

    expect(runUpdate().stats).toEqual(
      expect.objectContaining({ unchanged: 1, reactivated: 1, closed: 3 }),
    );
  });

  it('marks the run and source FAILED and rethrows', async () => {
    const { coordinator, repository, sourceUpdate, runUpdate } = setup({
      source: { ...SOURCE, consecutiveFailures: 1 },
      result: new Error('boom'),
    });

    await expect(coordinator.run(KEY)).rejects.toThrow('boom');

    expect(runUpdate()).toEqual(
      expect.objectContaining({ status: ESyncStatus.FAILED, error: 'boom' }),
    );
    expect(sourceUpdate().$set).toEqual(
      expect.objectContaining({
        lastSyncStatus: ESyncStatus.FAILED,
        lastSyncError: 'boom',
        consecutiveFailures: 2,
      }),
    );
    expect(sourceUpdate().$set.rejections).toBeUndefined();
    expect(repository.upsertFetched).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('alerts once failures reach the threshold', async () => {
    const { coordinator } = setup({
      source: { ...SOURCE, consecutiveFailures: 2 },
      result: new Error('boom'),
    });

    await expect(coordinator.run(KEY)).rejects.toThrow('boom');

    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('3 consecutive failures'));
  });

  it('fails unrecoverably for a provider without adapter', async () => {
    const { coordinator, runUpdate } = setup({ source: { ...SOURCE, provider: 'UNKNOWN' } });

    await expect(coordinator.run(KEY)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(runUpdate().status).toBe(ESyncStatus.FAILED);
  });

  it.each([
    ['disabled', { ...SOURCE, enabled: false }],
    ['missing', null],
  ])('skips %s sources without recording a run', async (_label, source) => {
    const { coordinator, crawlRunModel, greenhouseAdapter } = setup({ source });

    await coordinator.run(KEY);

    expect(crawlRunModel.create).not.toHaveBeenCalled();
    expect(greenhouseAdapter.fetchJobs).not.toHaveBeenCalled();
  });
});
