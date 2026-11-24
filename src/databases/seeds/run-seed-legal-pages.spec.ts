import { seedLegalPages } from './run-seed-legal-pages';

describe('seedLegalPages', () => {
  it('only inserts missing pages, as drafts, so edited texts survive a re-run', async () => {
    const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 4 });

    await expect(seedLegalPages({ bulkWrite })).resolves.toBe(4);

    const operations = bulkWrite.mock.calls[0][0];
    expect(operations.map(({ updateOne }: any) => updateOne.filter)).toEqual([
      { page: 'terms', locale: 'vi' },
      { page: 'privacy', locale: 'vi' },
      { page: 'terms', locale: 'en' },
      { page: 'privacy', locale: 'en' },
    ]);
    for (const { updateOne } of operations) {
      expect(Object.keys(updateOne.update)).toEqual(['$setOnInsert']);
      expect(updateOne.update.$setOnInsert.isPublished).toBe(false);
      expect(updateOne.upsert).toBe(true);
    }
  });
});
