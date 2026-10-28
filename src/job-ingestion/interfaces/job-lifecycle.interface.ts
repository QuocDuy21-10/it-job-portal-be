import { EExternalJobCloseReason } from '../enums/external-job-close-reason.enum';
import { EExternalJobStatus } from '../enums/external-job-status.enum';
import { ERejectionReason } from '../enums/rejection-reason.enum';

export interface IKnownJobState {
  externalId: string;
  status: EExternalJobStatus;
  lastFetchedAt?: Date;
  expiresAt?: Date;
  staleSince?: Date;
  closeReason?: EExternalJobCloseReason;
  contentHash?: string;
}

export interface IFetchedRejection {
  externalId: string;
  reason: ERejectionReason;
}

export interface ISourceRejection extends IFetchedRejection {
  retryAt: Date;
}

export interface ISyncObservation {
  listedIds: string[];
  // Jobs fetched and kept this run.
  fetchedIds: string[];
  // Jobs fetched (or filtered) this run and found unusable.
  rejected: IFetchedRejection[];
  // False for a SUSPECT listing: absence then proves nothing.
  listingComplete: boolean;
  now: Date;
}

export interface IJobClosure {
  externalId: string;
  reason: EExternalJobCloseReason;
}

export interface IJobTransitions {
  // Listed but not fetched: refresh lastSeenAt, STALE back to ACTIVE.
  seenIds: string[];
  // ACTIVE jobs absent from a complete listing.
  staleIds: string[];
  closures: IJobClosure[];
}
