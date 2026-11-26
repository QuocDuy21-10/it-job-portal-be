import { buildVisibleSlidesFilter, getSlideStatus, isSlideVisible } from './banner-visibility';

const now = new Date('2027-01-15T00:00:00Z');
const at = (iso: string) => new Date(iso);

describe('banner visibility', () => {
  it.each([
    ['a hidden slide', { isActive: false }, false, 'hidden'],
    ['an open-ended slide', { isActive: true }, true, 'live'],
    [
      'a slide before its start',
      { isActive: true, startAt: at('2027-01-16T00:00:00Z') },
      false,
      'scheduled',
    ],
    ['a slide exactly at its start', { isActive: true, startAt: now }, true, 'live'],
    [
      'a slide inside its window',
      { isActive: true, startAt: at('2027-01-01T00:00:00Z'), endAt: at('2027-02-01T00:00:00Z') },
      true,
      'live',
    ],
    ['a slide exactly at its end', { isActive: true, endAt: now }, false, 'ended'],
    [
      'a hidden slide inside its window',
      { isActive: false, endAt: at('2027-02-01T00:00:00Z') },
      false,
      'hidden',
    ],
  ] as const)('%s', (_case, slide, visible, status) => {
    expect(isSlideVisible(slide, now)).toBe(visible);
    expect(getSlideStatus(slide, now)).toBe(status);
  });

  it('builds the same rule as a query', () => {
    expect(buildVisibleSlidesFilter(now)).toEqual({
      isActive: true,
      $and: [
        { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: null }, { endAt: { $gt: now } }] },
      ],
    });
  });
});
