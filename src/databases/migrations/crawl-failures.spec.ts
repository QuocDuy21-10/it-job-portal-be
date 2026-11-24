import { ERejectionReason } from 'src/job-ingestion/enums/rejection-reason.enum';
import { runCrawlFailuresMigration } from './crawl-failures';

const RETRY_AT = new Date('2026-12-24T00:00:00Z');

describe('runCrawlFailuresMigration', () => {
  it('copies rejections with $setOnInsert so a re-run or a newer failure is never overwritten', async () => {
    const sources = {
      find: () => ({
        toArray: async () => [
          {
            key: 'topdev',
            rejections: [{ externalId: '1', reason: ERejectionReason.NOT_IT, retryAt: RETRY_AT }],
          },
          { key: 'itviec' },
        ],
      }),
    };
    const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 1 });

    await expect(runCrawlFailuresMigration(sources, { bulkWrite })).resolves.toEqual({
      sources: 1,
      inserted: 1,
    });

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    expect(bulkWrite.mock.calls[0][0]).toEqual([
      {
        updateOne: {
          filter: { sourceKey: 'topdev', externalId: '1' },
          update: {
            $setOnInsert: {
              reason: ERejectionReason.NOT_IT,
              retryAt: RETRY_AT,
              failedAt: new Date('2026-11-24T00:00:00Z'),
            },
          },
          upsert: true,
        },
      },
    ]);
  });
});
