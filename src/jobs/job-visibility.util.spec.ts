import { EJobApprovalStatus } from './enums/job-approval-status.enum';
import { EJobListState } from './enums/job-list-state.enum';
import { buildJobStateFilter, buildPublicJobVisibilityFilter } from './job-visibility.util';

describe('buildPublicJobVisibilityFilter', () => {
  it('keeps only active, approved jobs that have not expired', () => {
    const now = new Date('2026-10-28T00:00:00Z');

    expect(buildPublicJobVisibilityFilter(now)).toEqual({
      isActive: true,
      approvalStatus: EJobApprovalStatus.APPROVED,
      $or: [{ endDate: { $gte: now } }, { endDate: null }],
    });
  });

  it('defaults to the current time', () => {
    const before = Date.now();
    const filter = buildPublicJobVisibilityFilter() as { $or: [{ endDate: { $gte: Date } }] };

    expect(filter.$or[0].endDate.$gte.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('buildJobStateFilter', () => {
  const now = new Date('2026-11-25T00:00:00.000Z');
  const past = new Date('2026-11-24T00:00:00.000Z');
  const future = new Date('2026-11-26T00:00:00.000Z');

  // Evaluates only the operators buildJobStateFilter uses.
  const matches = (job: any, filter: any): boolean =>
    Object.entries<any>(filter).every(([key, expected]) => {
      if (key === '$or') return expected.some((part: any) => matches(job, part));
      const value = job[key] ?? null;
      if (expected === null || typeof expected !== 'object') return value === expected;
      return Object.entries<any>(expected).every(([op, operand]) => {
        if (op === '$ne') return value !== operand;
        if (op === '$gte') return value !== null && value >= operand;
        if (op === '$lt') return value !== null && value < operand;
        throw new Error(`Unexpected operator ${op}`);
      });
    });

  it('puts every job in exactly one state', () => {
    for (const approvalStatus of Object.values(EJobApprovalStatus)) {
      for (const isActive of [true, false]) {
        for (const endDate of [past, now, future, undefined]) {
          const job = { approvalStatus, isActive, endDate };
          const states = Object.values(EJobListState).filter(state =>
            matches(job, buildJobStateFilter(state, now)),
          );
          expect({ job, states }).toEqual({ job, states: [expect.any(String)] });
        }
      }
    }
  });

  it('counts an expired job as expired even after the cron turned it off', () => {
    const job = { approvalStatus: 'APPROVED', isActive: false, endDate: past };
    expect(matches(job, buildJobStateFilter(EJobListState.EXPIRED, now))).toBe(true);
    expect(matches(job, buildJobStateFilter(EJobListState.PAUSED, now))).toBe(false);
  });
});
