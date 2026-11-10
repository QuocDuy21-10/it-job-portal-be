import { INDEX_AUDIT_DROPS, IndexAuditDb, runIndexAuditMigration } from './index-audit';

const NEW_JOB_INDEX = 'approvalStatus_1_isActive_1_createdAt_-1_isDeleted_1_endDate_1';

function fakeDb(initial: Record<string, string[]>) {
  const state = new Map(Object.entries(initial).map(([name, idx]) => [name, new Set(idx)]));
  const db: IndexAuditDb = {
    collection: (name: string) => ({
      indexes: async () => {
        const indexes = state.get(name);
        if (!indexes) throw Object.assign(new Error('ns does not exist'), { code: 26 });
        return [...indexes].map(indexName => ({ name: indexName }));
      },
      dropIndex: async (indexName: string) => state.get(name)?.delete(indexName),
    }),
  };
  const createJobIndexes = jest.fn(async () => state.get('jobs')?.add(NEW_JOB_INDEX));
  return { db, state, createJobIndexes };
}

describe('runIndexAuditMigration', () => {
  it('lists exactly the 16 indexes from the spec', () => {
    expect(INDEX_AUDIT_DROPS).toHaveLength(16);
    expect(new Set(INDEX_AUDIT_DROPS.map(d => `${d.collection}.${d.indexName}`)).size).toBe(16);
  });

  it('drops listed indexes that exist, keeps others, and ensures job indexes', async () => {
    const { db, state, createJobIndexes } = fakeDb({
      jobs: ['_id_', 'approvalStatus_1', 'name_text_description_text', 'skills_1'],
      sessions: ['_id_', 'userId_1', 'userId_1_isActive_1'],
    });

    const report = await runIndexAuditMigration(db, createJobIndexes);

    expect(report.dropped).toEqual([
      'jobs.approvalStatus_1',
      'jobs.name_text_description_text',
      'sessions.userId_1',
    ]);
    expect(report.missing).toHaveLength(13);
    expect(report.created).toEqual([`jobs.${NEW_JOB_INDEX}`]);
    expect([...state.get('jobs')!]).toEqual(['_id_', 'skills_1', NEW_JOB_INDEX]);
    expect([...state.get('sessions')!]).toEqual(['_id_', 'userId_1_isActive_1']);
    expect(createJobIndexes).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a second run drops nothing', async () => {
    const { db, createJobIndexes } = fakeDb({ jobs: ['_id_', 'approvalStatus_1'] });
    await runIndexAuditMigration(db, createJobIndexes);

    const second = await runIndexAuditMigration(db, createJobIndexes);

    expect(second.dropped).toEqual([]);
    expect(second.missing).toHaveLength(16);
    expect(second.created).toEqual([]);
  });

  it('rethrows errors other than a missing collection', async () => {
    const db: IndexAuditDb = {
      collection: () => ({
        indexes: async () => {
          throw Object.assign(new Error('not authorized'), { code: 13 });
        },
        dropIndex: async () => undefined,
      }),
    };

    await expect(runIndexAuditMigration(db, async () => undefined)).rejects.toThrow(
      'not authorized',
    );
  });
});
