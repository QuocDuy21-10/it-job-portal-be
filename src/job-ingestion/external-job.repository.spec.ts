import { EExternalJobCloseReason } from './enums/external-job-close-reason.enum';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { ExternalJobRepository } from './external-job.repository';
import { computeContentHash } from './ingestion-filters';
import { IKnownJobState } from './interfaces/job-lifecycle.interface';
import { INormalizedExternalJob } from './interfaces/normalized-external-job.interface';

const NOW = new Date('2026-10-28T12:00:00Z');
const VISIBLE = { $in: [EExternalJobStatus.ACTIVE, EExternalJobStatus.STALE] };

const buildJob = (overrides: Partial<INormalizedExternalJob> = {}): INormalizedExternalJob => ({
  sourceKey: 'topdev',
  externalId: '1',
  sourceUrl: 'https://topdev.vn/detail-jobs/java-1',
  applyUrl: 'https://topdev.vn/detail-jobs/java-1',
  title: 'Java Developer',
  companyName: 'FPT IS',
  location: 'Hà Nội',
  isRemote: false,
  skills: ['Java'],
  descriptionHtml: '',
  ...overrides,
});

const setup = (docs: Partial<IKnownJobState>[] = []) => {
  const select = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) });
  const model = {
    find: jest.fn().mockReturnValue({ select }),
    bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
    countDocuments: jest.fn().mockResolvedValue(4),
  };

  return { repository: new ExternalJobRepository(model as any), model, select };
};

describe('ExternalJobRepository', () => {
  it('loads known job states keyed by external id', async () => {
    const doc = { externalId: '1', status: EExternalJobStatus.ACTIVE };
    const { repository, model, select } = setup([doc]);

    const known = await repository.loadKnownStates('topdev');

    expect(model.find).toHaveBeenCalledWith({ sourceKey: 'topdev' });
    expect(select).toHaveBeenCalledWith(
      'externalId status lastFetchedAt expiresAt staleSince closeReason contentHash',
    );
    expect(known.get('1')).toBe(doc);
  });

  describe('upsertFetched', () => {
    it('writes full content for new or changed jobs and only lifecycle fields when unchanged', async () => {
      const unchanged = buildJob({ externalId: 'same' });
      const changed = buildJob({ externalId: 'changed', title: 'Senior Java Developer' });
      const fresh = buildJob({ externalId: 'new' });
      const known = new Map<string, IKnownJobState>([
        [
          'same',
          {
            externalId: 'same',
            status: EExternalJobStatus.ACTIVE,
            contentHash: computeContentHash(unchanged),
          },
        ],
        [
          'changed',
          { externalId: 'changed', status: EExternalJobStatus.CLOSED, contentHash: 'old' },
        ],
      ]);
      const { repository, model } = setup();

      const counts = await repository.upsertFetched([unchanged, changed, fresh], known, NOW);

      expect(counts).toEqual({ created: 1, updated: 1, unchanged: 1, reactivated: 1 });
      const [operations, options] = model.bulkWrite.mock.calls[0];
      expect(options).toEqual({ ordered: false });
      const lifecycle = { status: EExternalJobStatus.ACTIVE, lastFetchedAt: NOW, lastSeenAt: NOW };
      const unset = { staleSince: 1, closedAt: 1, closeReason: 1 };
      expect(operations[0].updateOne).toEqual({
        filter: { sourceKey: 'topdev', externalId: 'same' },
        update: { $set: lifecycle, $unset: unset },
        upsert: true,
      });
      expect(operations[1].updateOne.update.$set).toEqual({
        ...changed,
        ...lifecycle,
        contentHash: computeContentHash(changed),
        lastContentUpdatedAt: NOW,
      });
      expect(operations[2].updateOne.update.$set).toEqual(
        expect.objectContaining({ externalId: 'new', contentHash: expect.any(String) }),
      );
    });

    it('skips the database when nothing was kept', async () => {
      const { repository, model } = setup();

      await expect(repository.upsertFetched([], new Map(), NOW)).resolves.toEqual({
        created: 0,
        updated: 0,
        unchanged: 0,
        reactivated: 0,
      });
      expect(model.bulkWrite).not.toHaveBeenCalled();
    });
  });

  it('marks listed jobs seen and brings STALE ones back to ACTIVE', async () => {
    const { repository, model } = setup();

    await repository.markSeen('topdev', ['1'], NOW);

    expect(model.updateMany).toHaveBeenCalledWith(
      { sourceKey: 'topdev', externalId: { $in: ['1'] }, status: VISIBLE },
      { $set: { lastSeenAt: NOW, status: EExternalJobStatus.ACTIVE }, $unset: { staleSince: 1 } },
    );
  });

  it('moves only ACTIVE jobs to STALE', async () => {
    const { repository, model } = setup();

    await expect(repository.markStale('topdev', ['1'], NOW)).resolves.toBe(3);
    expect(model.updateMany).toHaveBeenCalledWith(
      { sourceKey: 'topdev', externalId: { $in: ['1'] }, status: EExternalJobStatus.ACTIVE },
      { $set: { status: EExternalJobStatus.STALE, staleSince: NOW } },
    );
  });

  it('closes jobs grouped by reason in one bulk write', async () => {
    const { repository, model } = setup();

    const closed = await repository.close(
      'topdev',
      [
        { externalId: 'a', reason: EExternalJobCloseReason.GONE_FROM_SOURCE },
        { externalId: 'b', reason: EExternalJobCloseReason.NOT_FOUND },
        { externalId: 'c', reason: EExternalJobCloseReason.GONE_FROM_SOURCE },
      ],
      NOW,
    );

    const closeUpdate = (reason: EExternalJobCloseReason) => ({
      $set: { status: EExternalJobStatus.CLOSED, closedAt: NOW, closeReason: reason },
      $unset: { staleSince: 1 },
    });
    expect(closed).toBe(2);
    expect(model.bulkWrite.mock.calls[0][0]).toEqual([
      {
        updateMany: {
          filter: { sourceKey: 'topdev', externalId: { $in: ['a', 'c'] }, status: VISIBLE },
          update: closeUpdate(EExternalJobCloseReason.GONE_FROM_SOURCE),
        },
      },
      {
        updateMany: {
          filter: { sourceKey: 'topdev', externalId: { $in: ['b'] }, status: VISIBLE },
          update: closeUpdate(EExternalJobCloseReason.NOT_FOUND),
        },
      },
    ]);
  });

  it('closes visible jobs past their expiry', async () => {
    const { repository, model } = setup();

    await expect(repository.closeExpired('topdev', NOW)).resolves.toBe(3);
    expect(model.updateMany).toHaveBeenCalledWith(
      { sourceKey: 'topdev', status: VISIBLE, expiresAt: { $lt: NOW } },
      {
        $set: {
          status: EExternalJobStatus.CLOSED,
          closedAt: NOW,
          closeReason: EExternalJobCloseReason.EXPIRED,
        },
        $unset: { staleSince: 1 },
      },
    );
  });

  it.each([
    ['markSeen', (repository: ExternalJobRepository) => repository.markSeen('topdev', [], NOW)],
    ['markStale', (repository: ExternalJobRepository) => repository.markStale('topdev', [], NOW)],
    ['close', (repository: ExternalJobRepository) => repository.close('topdev', [], NOW)],
  ])('%s does nothing for an empty list', async (_name, call) => {
    const { repository, model } = setup();

    await call(repository);

    expect(model.updateMany).not.toHaveBeenCalled();
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });

  it('counts visible jobs, clears stored descriptions and resets fetch times', async () => {
    const { repository, model } = setup();

    await expect(repository.countVisible('topdev')).resolves.toBe(4);
    expect(model.countDocuments).toHaveBeenCalledWith({ sourceKey: 'topdev', status: VISIBLE });

    await repository.clearDescriptions('topdev');
    expect(model.updateMany).toHaveBeenCalledWith(
      { sourceKey: 'topdev', descriptionHtml: { $ne: '' } },
      { $set: { descriptionHtml: '' } },
    );

    await repository.resetFetchedAt('topdev');
    expect(model.updateMany).toHaveBeenCalledWith(
      { sourceKey: 'topdev', status: VISIBLE },
      { $unset: { lastFetchedAt: 1 } },
    );
  });
});
