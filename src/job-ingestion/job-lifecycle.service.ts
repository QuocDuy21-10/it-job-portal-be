import { Injectable } from '@nestjs/common';
import { EExternalJobCloseReason } from './enums/external-job-close-reason.enum';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { ERejectionReason } from './enums/rejection-reason.enum';
import {
  IFetchedRejection,
  IJobClosure,
  IJobTransitions,
  IKnownJobState,
  ISourceRejection,
  ISyncObservation,
} from './interfaces/job-lifecycle.interface';
import {
  DAY_MS,
  HOUR_MS,
  MIN_BASELINE_FOR_RATIO,
  MIN_LISTED_RATIO,
  REFRESH_AFTER_DAYS,
  REJECTION_RETRY_DAYS,
  STALE_GRACE_HOURS,
} from './job-ingestion.constants';

// Lower ranks are fetched first.
const RANK_NEW = 0;
const RANK_REAPPEARED = 1;
const RANK_STALE = 2;
const RANK_REFRESH = 3;

type RankedId = { id: string; rank: number; fetchedAt: number };

/** Pure rules for which jobs to fetch and how job states move between syncs. */
@Injectable()
export class JobLifecycleService {
  planFetch(
    listedIds: string[],
    known: ReadonlyMap<string, IKnownJobState>,
    rejections: ISourceRejection[],
    now: Date,
  ): string[] {
    const waiting = new Set(
      rejections
        .filter(rejection => rejection.retryAt.getTime() > now.getTime())
        .map(rejection => rejection.externalId),
    );
    const refreshCutoff = now.getTime() - REFRESH_AFTER_DAYS * DAY_MS;
    const isFresh = (state: IKnownJobState) =>
      state.lastFetchedAt !== undefined && state.lastFetchedAt.getTime() >= refreshCutoff;
    const isExpired = (state: IKnownJobState) =>
      state.expiresAt !== undefined && state.expiresAt.getTime() <= now.getTime();

    const rankOf = (id: string): number | undefined => {
      if (waiting.has(id)) {
        return undefined;
      }

      const state = known.get(id);

      if (!state) {
        return RANK_NEW;
      }

      if (state.status === EExternalJobStatus.CLOSED) {
        // Sources keep expired postings listed for a while; recheck them only on the refresh cycle.
        return state.closeReason === EExternalJobCloseReason.EXPIRED && isFresh(state)
          ? undefined
          : RANK_REAPPEARED;
      }

      if (isFresh(state) && !isExpired(state)) {
        return undefined;
      }

      return state.status === EExternalJobStatus.STALE ? RANK_STALE : RANK_REFRESH;
    };

    return listedIds
      .map(id => ({ id, rank: rankOf(id), fetchedAt: known.get(id)?.lastFetchedAt?.getTime() ?? 0 }))
      .filter((entry): entry is RankedId => entry.rank !== undefined)
      .sort((a, b) => a.rank - b.rank || a.fetchedAt - b.fetchedAt)
      .map(entry => entry.id);
  }

  isSuspectListing(listedCount: number, baseline: number): boolean {
    if (listedCount === 0) {
      // A full board never empties out at once in practice.
      return baseline > 0;
    }

    return baseline >= MIN_BASELINE_FOR_RATIO && listedCount < baseline * MIN_LISTED_RATIO;
  }

  computeTransitions(
    known: ReadonlyMap<string, IKnownJobState>,
    { listedIds, fetchedIds, rejected, listingComplete, now }: ISyncObservation,
  ): IJobTransitions {
    const listed = new Set(listedIds);
    const fetched = new Set(fetchedIds);
    const rejectedReasons = new Map(rejected.map(item => [item.externalId, item.reason]));
    const graceCutoff = now.getTime() - STALE_GRACE_HOURS * HOUR_MS;
    const seenIds: string[] = [];
    const staleIds: string[] = [];
    const closures: IJobClosure[] = [];

    for (const [id, state] of known) {
      if (fetched.has(id) || state.status === EExternalJobStatus.CLOSED) {
        continue;
      }

      const rejectedReason = rejectedReasons.get(id);

      if (rejectedReason) {
        closures.push({
          externalId: id,
          reason:
            rejectedReason === ERejectionReason.NOT_FOUND
              ? EExternalJobCloseReason.NOT_FOUND
              : EExternalJobCloseReason.NO_LONGER_MATCHES,
        });
      } else if (listed.has(id)) {
        seenIds.push(id);
      } else if (!listingComplete) {
        continue;
      } else if (
        state.status === EExternalJobStatus.STALE &&
        state.staleSince &&
        state.staleSince.getTime() <= graceCutoff
      ) {
        closures.push({ externalId: id, reason: EExternalJobCloseReason.GONE_FROM_SOURCE });
      } else if (state.status === EExternalJobStatus.ACTIVE) {
        // markStale always sets staleSince, so a STALE job here is still inside its grace period.
        staleIds.push(id);
      }
    }

    return { seenIds, staleIds, closures };
  }

  mergeRejections(
    previous: ISourceRejection[],
    fresh: IFetchedRejection[],
    keptIds: string[],
    listedIds: string[],
    now: Date,
  ): ISourceRejection[] {
    const listed = new Set(listedIds);
    const kept = new Set(keptIds);
    const merged = new Map(previous.map(rejection => [rejection.externalId, rejection]));

    for (const { externalId, reason } of fresh) {
      merged.set(externalId, {
        externalId,
        reason,
        retryAt: new Date(now.getTime() + REJECTION_RETRY_DAYS[reason] * DAY_MS),
      });
    }

    // Pruned to listed ids so the list never outgrows the source.
    return [...merged.values()].filter(
      rejection => listed.has(rejection.externalId) && !kept.has(rejection.externalId),
    );
  }
}
