import { NotFoundException } from '@nestjs/common';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { IAtsFetchResult, IRawAtsJob } from './adapters/ats-adapter.interface';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { EJobSourceProvider } from './enums/job-source-provider.enum';
import { ESyncStatus } from './enums/sync-status.enum';
import { JobIngestionService } from './job-ingestion.service';

const HCM = 'Ho Chi Minh City, Ho Chi Minh City, Vietnam';

const SOURCE = {
  key: 'greenhouse-axon',
  provider: EJobSourceProvider.GREENHOUSE,
  boardToken: 'axon',
  companyName: 'Axon',
  enabled: true,
};

const buildRaw = (overrides: Partial<IRawAtsJob> = {}): IRawAtsJob => ({
  externalId: '1',
  title: 'Senior Backend Software Engineer',
  location: HCM,
  sourceUrl: 'https://job-boards.greenhouse.io/axon/jobs/1',
  descriptionHtml: '<p>We use Node.js daily.</p>',
  publishedAt: new Date('2026-09-01T00:00:00Z'),
  ...overrides,
});

const toFetchResult = (jobs: IRawAtsJob[]): IAtsFetchResult => ({
  jobs,
  listedIds: jobs.map(job => job.externalId).filter(Boolean),
});

const setup = ({
  source = SOURCE as (typeof SOURCE & { rejectedExternalIds?: string[] }) | null,
  fetchResult = [buildRaw()] as IRawAtsJob[] | IAtsFetchResult | Error,
  activeCount = 0,
  knownIds = [] as string[],
} = {}) => {
  const jobSourceModel = {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(source) }),
    find: jest.fn(),
    exists: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const externalJobModel = {
    bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    countDocuments: jest.fn().mockResolvedValue(activeCount),
    distinct: jest.fn().mockResolvedValue(knownIds),
  };
  const skillsService = {
    getAliasMap: jest.fn().mockResolvedValue({
      'node.js': 'Node.js',
      java: 'Java',
      'spring boot': 'Spring Boot',
    }),
  };
  const queueService = { enqueueSync: jest.fn().mockResolvedValue(undefined) };
  const greenhouseAdapter = {
    provider: EJobSourceProvider.GREENHOUSE,
    fetchJobs:
      fetchResult instanceof Error
        ? jest.fn().mockRejectedValue(fetchResult)
        : jest
            .fn()
            .mockResolvedValue(
              Array.isArray(fetchResult) ? toFetchResult(fetchResult) : fetchResult,
            ),
  };
  const leverAdapter = { provider: EJobSourceProvider.LEVER, fetchJobs: jest.fn() };
  const topDevAdapter = { provider: EJobSourceProvider.TOPDEV, fetchJobs: jest.fn() };

  const service = new JobIngestionService(
    jobSourceModel as any,
    externalJobModel as any,
    skillsService as any,
    queueService as any,
    greenhouseAdapter as any,
    leverAdapter as any,
    topDevAdapter as any,
  );

  return { service, jobSourceModel, externalJobModel, queueService, greenhouseAdapter };
};

describe('JobIngestionService', () => {
  describe('syncSource', () => {
    it('upserts kept jobs, closes missing ones and records stats', async () => {
      const { service, externalJobModel, jobSourceModel, greenhouseAdapter } = setup({
        fetchResult: [
          buildRaw(),
          buildRaw({ externalId: '2', title: 'Principal Product Manager' }),
          buildRaw({ externalId: '3', location: 'Remote, United States' }),
          buildRaw({ externalId: '', title: 'Broken item' }),
        ],
      });

      await service.syncSource('greenhouse-axon');

      expect(greenhouseAdapter.fetchJobs).toHaveBeenCalledWith('axon', new Set());

      const [operations, options] = externalJobModel.bulkWrite.mock.calls[0];
      expect(options).toEqual({ ordered: false });
      expect(operations).toHaveLength(1);
      expect(operations[0].updateOne.filter).toEqual({
        sourceKey: 'greenhouse-axon',
        externalId: '1',
      });
      expect(operations[0].updateOne.upsert).toBe(true);
      expect(operations[0].updateOne.update.$set).toEqual(
        expect.objectContaining({
          sourceKey: 'greenhouse-axon',
          externalId: '1',
          title: 'Senior Backend Software Engineer',
          companyName: 'Axon',
          location: HCM,
          locationCode: 'ho-chi-minh',
          isRemote: false,
          skills: ['Node.js'],
          level: EJobLevel.SENIOR,
          sourceUrl: 'https://job-boards.greenhouse.io/axon/jobs/1',
          applyUrl: 'https://job-boards.greenhouse.io/axon/jobs/1',
          descriptionHtml: '<p>We use Node.js daily.</p>',
          status: EExternalJobStatus.ACTIVE,
          lastSeenAt: expect.any(Date),
        }),
      );

      expect(externalJobModel.updateMany).toHaveBeenCalledWith(
        {
          sourceKey: 'greenhouse-axon',
          status: EExternalJobStatus.ACTIVE,
          $or: [{ externalId: { $nin: ['1'] } }, { expiresAt: { $lt: expect.any(Date) } }],
        },
        { $set: { status: EExternalJobStatus.CLOSED } },
      );

      expect(jobSourceModel.updateOne).toHaveBeenCalledWith(
        { key: 'greenhouse-axon' },
        {
          $set: {
            lastSyncedAt: expect.any(Date),
            lastSyncStatus: ESyncStatus.SUCCESS,
            lastSyncStats: { fetched: 4, kept: 1, skipped: 1, rejected: 0, upserted: 1, closed: 0 },
            rejectedExternalIds: ['2', '3'],
          },
          $unset: { lastSyncError: 1 },
        },
      );
    });

    it('stores sanitized descriptions only', async () => {
      const { service, externalJobModel } = setup({
        fetchResult: [
          buildRaw({
            descriptionHtml:
              '<p>ok</p><script>alert(1)</script>' +
              '<a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>',
          }),
        ],
      });

      await service.syncSource('greenhouse-axon');

      const stored = externalJobModel.bulkWrite.mock.calls[0][0][0].updateOne.update.$set
        .descriptionHtml as string;
      expect(stored).toContain('<p>ok</p>');
      expect(stored).not.toContain('<script');
      expect(stored).not.toContain('javascript:');
      expect(stored).not.toContain('onerror');
    });

    it('closes every active job when the board has no matching jobs', async () => {
      const { service, externalJobModel } = setup({
        fetchResult: [buildRaw({ title: 'Principal Product Manager' })],
      });

      await service.syncSource('greenhouse-axon');

      expect(externalJobModel.bulkWrite).not.toHaveBeenCalled();
      expect(externalJobModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ externalId: { $nin: [] } }, { expiresAt: { $lt: expect.any(Date) } }],
        }),
        { $set: { status: EExternalJobStatus.CLOSED } },
      );
    });

    it('marks the source failed and rethrows when fetching fails, without touching jobs', async () => {
      const { service, externalJobModel, jobSourceModel } = setup({
        fetchResult: new Error('boom'),
      });

      await expect(service.syncSource('greenhouse-axon')).rejects.toThrow('boom');

      expect(externalJobModel.bulkWrite).not.toHaveBeenCalled();
      expect(externalJobModel.updateMany).not.toHaveBeenCalled();
      expect(jobSourceModel.updateOne).toHaveBeenCalledWith(
        { key: 'greenhouse-axon' },
        {
          $set: {
            lastSyncedAt: expect.any(Date),
            lastSyncStatus: ESyncStatus.FAILED,
            lastSyncError: 'boom',
          },
        },
      );
    });

    it('refuses to close jobs when the board is empty but active jobs exist', async () => {
      const { service, externalJobModel, jobSourceModel } = setup({
        fetchResult: [],
        activeCount: 5,
      });

      await service.syncSource('greenhouse-axon');

      expect(externalJobModel.bulkWrite).not.toHaveBeenCalled();
      expect(externalJobModel.updateMany).not.toHaveBeenCalled();
      expect(jobSourceModel.updateOne).toHaveBeenCalledWith(
        { key: 'greenhouse-axon' },
        {
          $set: expect.objectContaining({
            lastSyncStatus: ESyncStatus.FAILED,
            lastSyncError: 'empty board response',
          }),
        },
      );
    });

    it('keeps known listed jobs active without refetching and remembers rejected ids', async () => {
      const { service, externalJobModel, jobSourceModel, greenhouseAdapter } = setup({
        source: { ...SOURCE, rejectedExternalIds: ['20', '21'] },
        knownIds: ['10', '11'],
        fetchResult: {
          jobs: [
            buildRaw({ externalId: '1' }),
            buildRaw({ externalId: '2', title: 'Kế toán tổng hợp' }),
          ],
          listedIds: ['1', '2', '10', '20', '30'],
          rejectedIds: ['30'],
        },
      });

      await service.syncSource('greenhouse-axon');

      expect(externalJobModel.distinct).toHaveBeenCalledWith('externalId', {
        sourceKey: 'greenhouse-axon',
      });
      expect(greenhouseAdapter.fetchJobs).toHaveBeenCalledWith(
        'axon',
        new Set(['10', '11', '20', '21']),
      );
      expect(externalJobModel.updateMany).toHaveBeenNthCalledWith(
        1,
        {
          sourceKey: 'greenhouse-axon',
          status: EExternalJobStatus.ACTIVE,
          externalId: { $in: ['10', '20', '30'] },
        },
        { $set: { lastSeenAt: expect.any(Date) } },
      );
      expect(externalJobModel.updateMany).toHaveBeenNthCalledWith(
        2,
        {
          sourceKey: 'greenhouse-axon',
          status: EExternalJobStatus.ACTIVE,
          $or: [
            { externalId: { $nin: ['1', '10', '20', '30'] } },
            { expiresAt: { $lt: expect.any(Date) } },
          ],
        },
        { $set: { status: EExternalJobStatus.CLOSED } },
      );
      expect(jobSourceModel.updateOne).toHaveBeenCalledWith(
        { key: 'greenhouse-axon' },
        {
          $set: expect.objectContaining({
            lastSyncStats: { fetched: 2, kept: 1, skipped: 0, rejected: 1, upserted: 1, closed: 0 },
            rejectedExternalIds: ['20', '30', '2'],
          }),
          $unset: { lastSyncError: 1 },
        },
      );
    });

    it('records an early stop as a note on a successful sync', async () => {
      const { service, jobSourceModel } = setup({
        fetchResult: { jobs: [buildRaw()], listedIds: ['1', '2'], stoppedEarly: '429' },
      });

      await service.syncSource('greenhouse-axon');

      const [, update] = jobSourceModel.updateOne.mock.calls[0];
      expect(update.$set).toEqual(
        expect.objectContaining({
          lastSyncStatus: ESyncStatus.SUCCESS,
          lastSyncError: 'stopped early: 429',
        }),
      );
      expect(update.$unset).toBeUndefined();
    });

    it('maps multi-company fields, catalog skills, experience level, salary and expiry', async () => {
      const expiresAt = new Date('2026-11-20T00:00:00Z');
      const { service, externalJobModel } = setup({
        fetchResult: [
          buildRaw({
            title: 'Lập trình viên Backend',
            companyName: 'FPT IS',
            skills: ['Java', 'Spring Boot', 'Automation QA'],
            monthsOfExperience: 40,
            salaryText: '20.000.000 – 30.000.000 VND',
            expiresAt,
          }),
        ],
      });

      await service.syncSource('greenhouse-axon');

      expect(externalJobModel.bulkWrite.mock.calls[0][0][0].updateOne.update.$set).toEqual(
        expect.objectContaining({
          companyName: 'FPT IS',
          skills: ['Java', 'Spring Boot'],
          level: EJobLevel.SENIOR,
          salaryText: '20.000.000 – 30.000.000 VND',
          expiresAt,
        }),
      );
    });

    it('falls back to text skill extraction when no raw skill is in the catalog', async () => {
      const { service, externalJobModel } = setup({
        fetchResult: [buildRaw({ skills: ['Luật / Pháp Chế'] })],
      });

      await service.syncSource('greenhouse-axon');

      const stored = externalJobModel.bulkWrite.mock.calls[0][0][0].updateOne.update.$set;
      expect(stored.skills).toEqual(['Node.js']);
      expect(stored.companyName).toBe('Axon');
      expect(stored.level).toBe(EJobLevel.SENIOR);
    });

    it('skips disabled sources', async () => {
      const { service, greenhouseAdapter, jobSourceModel } = setup({
        source: { ...SOURCE, enabled: false },
      });

      await service.syncSource('greenhouse-axon');

      expect(greenhouseAdapter.fetchJobs).not.toHaveBeenCalled();
      expect(jobSourceModel.updateOne).not.toHaveBeenCalled();
    });

    it('skips unknown sources', async () => {
      const { service, greenhouseAdapter } = setup({ source: null });

      await service.syncSource('missing');

      expect(greenhouseAdapter.fetchJobs).not.toHaveBeenCalled();
    });
  });

  describe('enqueueEnabledSources', () => {
    it('enqueues every enabled source', async () => {
      const { service, jobSourceModel, queueService } = setup();
      jobSourceModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([{ key: 'greenhouse-axon' }, { key: 'lever-ninjavan' }]),
        }),
      });

      await service.enqueueEnabledSources();

      expect(jobSourceModel.find).toHaveBeenCalledWith({ enabled: true });
      expect(queueService.enqueueSync).toHaveBeenCalledWith('greenhouse-axon');
      expect(queueService.enqueueSync).toHaveBeenCalledWith('lever-ninjavan');
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

      await expect(service.requestSync('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(queueService.enqueueSync).not.toHaveBeenCalled();
    });
  });
});
