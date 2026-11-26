export type SlideWindow = { isActive: boolean; startAt?: Date | null; endAt?: Date | null };

export type SlideStatus = 'hidden' | 'scheduled' | 'live' | 'ended';

// endAt is exclusive: a slide ending at midnight is gone at midnight.
export const isSlideVisible = ({ isActive, startAt, endAt }: SlideWindow, now: Date): boolean =>
  isActive && (!startAt || startAt <= now) && (!endAt || now < endAt);

export const getSlideStatus = (slide: SlideWindow, now: Date): SlideStatus => {
  if (!slide.isActive) return 'hidden';
  if (slide.startAt && slide.startAt > now) return 'scheduled';
  if (slide.endAt && slide.endAt <= now) return 'ended';
  return 'live';
};

// `null` also matches documents that lack the field.
export const buildVisibleSlidesFilter = (now: Date): Record<string, unknown> => ({
  isActive: true,
  $and: [
    { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
    { $or: [{ endAt: null }, { endAt: { $gt: now } }] },
  ],
});
