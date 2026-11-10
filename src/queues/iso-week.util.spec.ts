import { isoWeekKey } from './iso-week.util';

describe('isoWeekKey', () => {
  it.each([
    ['2026-01-01T00:00:00.000Z', '2026-W01'],
    ['2024-12-30T00:00:00.000Z', '2025-W01'],
    ['2027-01-01T00:00:00.000Z', '2026-W53'],
    ['2026-11-09T02:00:00.000Z', '2026-W46'],
  ])('maps %s to %s', (iso, expected) => {
    expect(isoWeekKey(new Date(iso))).toBe(expected);
  });
});
