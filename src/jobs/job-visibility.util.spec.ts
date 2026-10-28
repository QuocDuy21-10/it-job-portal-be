import { EJobApprovalStatus } from './enums/job-approval-status.enum';
import { buildPublicJobVisibilityFilter } from './job-visibility.util';

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
