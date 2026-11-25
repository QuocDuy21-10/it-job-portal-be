import { EJobApprovalStatus } from './enums/job-approval-status.enum';
import { EJobListState } from './enums/job-list-state.enum';

// Single source of truth for which internal jobs the public may see.
export const buildPublicJobVisibilityFilter = (
  now: Date = new Date(),
): Record<string, unknown> => ({
  isActive: true,
  approvalStatus: EJobApprovalStatus.APPROVED,
  $or: [{ endDate: { $gte: now } }, { endDate: null }],
});

export const buildJobStateFilter = (
  state: EJobListState,
  now: Date = new Date(),
): Record<string, unknown> => {
  switch (state) {
    case EJobListState.PENDING:
      return { approvalStatus: EJobApprovalStatus.PENDING };
    case EJobListState.REJECTED:
      return { approvalStatus: EJobApprovalStatus.REJECTED };
    case EJobListState.ACTIVE:
      return buildPublicJobVisibilityFilter(now);
    case EJobListState.PAUSED:
      return { ...buildPublicJobVisibilityFilter(now), isActive: false };
    case EJobListState.EXPIRED:
      // isActive is ignored: the cron turns it off some time after endDate.
      return { approvalStatus: EJobApprovalStatus.APPROVED, endDate: { $ne: null, $lt: now } };
  }
};

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
