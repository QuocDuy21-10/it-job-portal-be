import { EJobApprovalStatus } from './enums/job-approval-status.enum';

// Single source of truth for which internal jobs the public may see.
export const buildPublicJobVisibilityFilter = (
  now: Date = new Date(),
): Record<string, unknown> => ({
  isActive: true,
  approvalStatus: EJobApprovalStatus.APPROVED,
  $or: [{ endDate: { $gte: now } }, { endDate: null }],
});

export const isJobPubliclyVisible = (
  job: { approvalStatus?: string; isActive?: boolean; endDate?: Date | string | null },
  now: Date = new Date(),
): boolean =>
  job.approvalStatus === EJobApprovalStatus.APPROVED &&
  !!job.isActive &&
  (!job.endDate || new Date(job.endDate) >= now);

// Audit fields (admin/HR emails and IDs) are only for SUPER_ADMIN and the job's own HR.
export const PUBLIC_JOB_PROJECTION =
  '-createdBy -updatedBy -deletedBy -approvedBy -approvalNote -followersNotifiedAt -isDeleted -deletedAt -__v';
