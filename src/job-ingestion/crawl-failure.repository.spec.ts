import { CrawlFailureRepository } from './crawl-failure.repository';
import { ERejectionReason } from './enums/rejection-reason.enum';
import { DAY_MS } from './job-ingestion.constants';

const NOW = new Date('2026-11-24T00:00:00Z');
const KEY = 'topdev';

const setup = () => {
  const model = {
    bulkWrite: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
    find: jest.fn(),
  };
  return { repository: new CrawlFailureRepository(model as any), model };
};
const observe = (overrides = {}) => ({
  failures: [],
  keptIds: [],
  listedIds: ['1'],
  listingComplete: true,
  now: NOW,
  ...overrides,
});

describe('CrawlFailureRepository', () => {
  it('reads only failures that still have to wait', async () => {
    const { repository, model } = setup();
    const query = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
    model.find.mockReturnValue(query);

    await repository.findWaiting(KEY, NOW);

    expect(model.find).toHaveBeenCalledWith({ sourceKey: KEY, retryAt: { $gt: NOW } });
  });

  it('stores one failure per job with its retry date', async () => {
    const { repository, model } = setup();

    await repository.record(
      KEY,
      observe({
        failures: [
          { externalId: '1', reason: ERejectionReason.NOT_FOUND, url: 'https://x/1' },
          { externalId: '2', reason: ERejectionReason.FETCH_ERROR, detail: 'x'.repeat(400) },
        ],
      }),
    );

    const [first, second] = model.bulkWrite.mock.calls[0][0].map((op: any) => op.updateOne);
    expect(first).toEqual({
      filter: { sourceKey: KEY, externalId: '1' },
      update: {
        $set: {
          reason: ERejectionReason.NOT_FOUND,
          failedAt: NOW,
          retryAt: new Date(NOW.getTime() + 3 * DAY_MS),
          url: 'https://x/1',
        },
        $unset: { detail: 1 },
      },
      upsert: true,
    });
    expect(second.update.$set.retryAt).toEqual(NOW);
    expect(second.update.$set.detail).toHaveLength(300);
    expect(second.update.$unset).toBeUndefined();
  });

  it('forgets jobs that were kept or are no longer listed', async () => {
    const { repository, model } = setup();

    await repository.record(KEY, observe({ keptIds: ['1'], listedIds: ['1', '2'] }));

    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(model.deleteMany.mock.calls).toEqual([
      [{ sourceKey: KEY, externalId: { $in: ['1'] } }],
      [{ sourceKey: KEY, externalId: { $nin: ['1', '2'] } }],
    ]);
  });

  it('does not trust a SUSPECT listing to forget failures', async () => {
    const { repository, model } = setup();

    await repository.record(KEY, observe({ listingComplete: false }));

    expect(model.deleteMany).toHaveBeenCalledTimes(1);
  });
});
