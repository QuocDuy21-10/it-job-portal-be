import { EJobApprovalStatus } from './enums/job-approval-status.enum';

// Single source of truth for which internal jobs the public may see.
export const buildPublicJobVisibilityFilter = (
  now: Date = new Date(),
): Record<string, unknown> => ({
  isActive: true,
  approvalStatus: EJobApprovalStatus.APPROVED,
  $or: [{ endDate: { $gte: now } }, { endDate: null }],
});
