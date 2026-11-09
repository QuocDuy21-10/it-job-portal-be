import { findPrefixRedundant, summarizeExplain } from './query-plan-baseline';

describe('findPrefixRedundant', () => {
  it('flags a plain prefix index but keeps unique/TTL/text ones', () => {
    const r = findPrefixRedundant([
      { name: '_id_', key: { _id: 1 } },
      { name: 'userId_1', key: { userId: 1 } },
      { name: 'userId_1_isActive_1', key: { userId: 1, isActive: 1 } },
      { name: 'userId_u', key: { userId: 1 }, unique: true },
      { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { name: 'expiresAt_1_x_1', key: { expiresAt: 1, x: 1 } },
      { name: 'createdAt_-1', key: { createdAt: -1 } },
      { name: 'createdAt_1_y_1', key: { createdAt: 1, y: 1 } },
    ]);
    expect(r).toEqual([{ name: 'userId_1', coveredBy: 'userId_1_isActive_1' }]);
  });
});

describe('summarizeExplain', () => {
  it('reads a find explain with an index scan', () => {
    const s = summarizeExplain({
      queryPlanner: {
        winningPlan: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'isActive_1' } },
      },
      executionStats: {
        nReturned: 10,
        totalKeysExamined: 12,
        totalDocsExamined: 10,
        executionTimeMillis: 3,
        executionStages: { stage: 'LIMIT', inputStage: { stage: 'FETCH' } },
      },
    });
    expect(s).toMatchObject({
      collScan: false,
      indexes: ['isActive_1'],
      nReturned: 10,
      totalDocsExamined: 10,
    });
    expect(s.stages).toEqual(expect.arrayContaining(['FETCH', 'IXSCAN', 'LIMIT']));
  });

  it('flags COLLSCAN inside an aggregate $cursor stage', () => {
    const s = summarizeExplain({
      stages: [
        {
          $cursor: {
            queryPlanner: { winningPlan: { stage: 'COLLSCAN' } },
            executionStats: {
              nReturned: 500,
              totalKeysExamined: 0,
              totalDocsExamined: 500,
              executionTimeMillis: 20,
            },
          },
        },
        { $facet: {} },
      ],
    });
    expect(s).toMatchObject({
      collScan: true,
      indexes: [],
      totalDocsExamined: 500,
      executionTimeMillis: 20,
    });
  });
});
