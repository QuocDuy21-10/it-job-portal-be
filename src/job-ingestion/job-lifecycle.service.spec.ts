import { EExternalJobCloseReason } from './enums/external-job-close-reason.enum';
import { EExternalJobStatus } from './enums/external-job-status.enum';
import { ERejectionReason } from './enums/rejection-reason.enum';
import { IKnownJobState, ISyncObservation } from './interfaces/job-lifecycle.interface';
import { DAY_MS, HOUR_MS } from './job-ingestion.constants';
import { JobLifecycleService } from './job-lifecycle.service';

const NOW = new Date('2026-10-28T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const later = (ms: number) => new Date(NOW.getTime() + ms);

const known = (
  entries: Array<Partial<IKnownJobState> & { externalId: string }>,
): Map<string, IKnownJobState> =>
  new Map(
    entries.map(entry => [
      entry.externalId,
      { status: EExternalJobStatus.ACTIVE, lastFetchedAt: ago(DAY_MS), ...entry },
    ]),
  );

describe('JobLifecycleService', () => {
  const lifecycle = new JobLifecycleService();

  describe('planFetch', () => {
    it('orders new, reappeared closed, stale, then the oldest refresh first', () => {
      const states = known([
        { externalId: 'refresh-new', lastFetchedAt: ago(8 * DAY_MS) },
        { externalId: 'refresh-old', lastFetchedAt: ago(30 * DAY_MS) },
        { externalId: 'legacy', lastFetchedAt: undefined },
        { externalId: 'stale', status: EExternalJobStatus.STALE, lastFetchedAt: ago(9 * DAY_MS) },
        {
          externalId: 'closed',
          status: EExternalJobStatus.CLOSED,
          closeReason: EExternalJobCloseReason.GONE_FROM_SOURCE,
        },
      ]);

      const plan = lifecycle.planFetch(
        ['refresh-new', 'refresh-old', 'legacy', 'stale', 'closed', 'new'],
        states,
        [],
        NOW,
      );

      expect(plan).toEqual(['new', 'closed', 'stale', 'legacy', 'refresh-old', 'refresh-new']);
    });

    it('skips jobs fetched within the refresh window that have not expired', () => {
      const states = known([
        { externalId: 'fresh' },
        { externalId: 'fresh-stale', status: EExternalJobStatus.STALE },
        { externalId: 'fresh-expired', expiresAt: ago(HOUR_MS) },
        { externalId: 'fresh-future', expiresAt: later(DAY_MS) },
      ]);

      expect(
        lifecycle.planFetch(
          ['fresh', 'fresh-stale', 'fresh-expired', 'fresh-future'],
          states,
          [],
          NOW,
        ),
      ).toEqual(['fresh-expired']);
    });

    it('rechecks expired closed jobs only on the refresh cycle', () => {
      const states = known([
        {
          externalId: 'expired-recent',
          status: EExternalJobStatus.CLOSED,
          closeReason: EExternalJobCloseReason.EXPIRED,
        },
        {
          externalId: 'expired-old',
          status: EExternalJobStatus.CLOSED,
          closeReason: EExternalJobCloseReason.EXPIRED,
          lastFetchedAt: ago(8 * DAY_MS),
        },
      ]);

      expect(lifecycle.planFetch(['expired-recent', 'expired-old'], states, [], NOW)).toEqual([
        'expired-old',
      ]);
    });

    it('waits for a rejection retryAt and retries once it has passed', () => {
      const rejections = [
        { externalId: 'waiting', reason: ERejectionReason.NOT_IT, retryAt: later(HOUR_MS) },
        { externalId: 'due', reason: ERejectionReason.NOT_FOUND, retryAt: ago(HOUR_MS) },
      ];

      expect(lifecycle.planFetch(['waiting', 'due'], new Map(), rejections, NOW)).toEqual(['due']);
    });
  });

  describe('isSuspectListing', () => {
    it.each([
      [20, 100, true],
      [50, 100, false],
      [5, 19, false],
      [0, 3, true],
      [0, 0, false],
    ])('listed %i against baseline %i -> %s', (listed, baseline, expected) => {
      expect(lifecycle.isSuspectListing(listed, baseline)).toBe(expected);
    });
  });

  describe('computeTransitions', () => {
    const observe = (overrides: Partial<ISyncObservation>): ISyncObservation => ({
      listedIds: [],
      fetchedIds: [],
      rejected: [],
      listingComplete: true,
      now: NOW,
      ...overrides,
    });

    it('marks listed but unfetched jobs as seen, leaving closed ones alone', () => {
      const states = known([
        { externalId: 'active' },
        { externalId: 'stale', status: EExternalJobStatus.STALE, staleSince: ago(HOUR_MS) },
        { externalId: 'closed', status: EExternalJobStatus.CLOSED },
      ]);

      expect(
        lifecycle.computeTransitions(states, observe({ listedIds: ['active', 'stale', 'closed'] })),
      ).toEqual({ seenIds: ['active', 'stale'], staleIds: [], closures: [] });
    });

    it('moves absent active jobs to STALE and closes stale ones past the grace period', () => {
      const states = known([
        { externalId: 'active' },
        { externalId: 'stale-old', status: EExternalJobStatus.STALE, staleSince: ago(6 * HOUR_MS) },
        { externalId: 'stale-new', status: EExternalJobStatus.STALE, staleSince: ago(HOUR_MS) },
        { externalId: 'closed', status: EExternalJobStatus.CLOSED },
      ]);

      expect(lifecycle.computeTransitions(states, observe({}))).toEqual({
        seenIds: [],
        staleIds: ['active'],
        closures: [{ externalId: 'stale-old', reason: EExternalJobCloseReason.GONE_FROM_SOURCE }],
      });
    });

    it('applies no absence transition when the listing is not complete', () => {
      const states = known([
        { externalId: 'active' },
        { externalId: 'stale-old', status: EExternalJobStatus.STALE, staleSince: ago(6 * HOUR_MS) },
      ]);

      expect(lifecycle.computeTransitions(states, observe({ listingComplete: false }))).toEqual({
        seenIds: [],
        staleIds: [],
        closures: [],
      });
    });

    it('closes known jobs rejected on refetch with a matching reason', () => {
      const states = known([{ externalId: 'gone' }, { externalId: 'moved' }]);

      const { closures } = lifecycle.computeTransitions(
        states,
        observe({
          listedIds: ['gone', 'moved'],
          rejected: [
            { externalId: 'gone', reason: ERejectionReason.NOT_FOUND },
            { externalId: 'moved', reason: ERejectionReason.NOT_IT },
          ],
        }),
      );

      expect(closures).toEqual([
        { externalId: 'gone', reason: EExternalJobCloseReason.NOT_FOUND },
        { externalId: 'moved', reason: EExternalJobCloseReason.NO_LONGER_MATCHES },
      ]);
    });

    it('leaves jobs fetched this run to the upsert', () => {
      const states = known([{ externalId: 'fetched', status: EExternalJobStatus.CLOSED }]);

      expect(
        lifecycle.computeTransitions(
          states,
          observe({ listedIds: ['fetched'], fetchedIds: ['fetched'] }),
        ),
      ).toEqual({ seenIds: [], staleIds: [], closures: [] });
    });
  });

  describe('mergeRejections', () => {
    it('adds fresh rejections with a retry date, drops kept and unlisted ids', () => {
      const previous = [
        { externalId: 'old', reason: ERejectionReason.NOT_IT, retryAt: later(DAY_MS) },
        { externalId: 'unlisted', reason: ERejectionReason.NOT_IT, retryAt: later(DAY_MS) },
        { externalId: 'kept', reason: ERejectionReason.NOT_FOUND, retryAt: ago(DAY_MS) },
      ];

      const merged = lifecycle.mergeRejections(
        previous,
        [{ externalId: 'new', reason: ERejectionReason.NOT_FOUND }],
        ['kept'],
        ['old', 'kept', 'new'],
        NOW,
      );

      expect(merged).toEqual([
        previous[0],
        { externalId: 'new', reason: ERejectionReason.NOT_FOUND, retryAt: later(3 * DAY_MS) },
      ]);
    });
  });
});
