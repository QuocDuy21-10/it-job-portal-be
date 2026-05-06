import {
  getLocationByCode,
  planLocationBackfill,
  resolveLocationFromInput,
  resolveLocationPayload,
} from './location-catalog';

describe('location-catalog', () => {
  it('resolves canonical codes directly', () => {
    const result = resolveLocationPayload({ locationCode: 'ha-noi' });

    expect(result).toEqual({
      location: 'Hà Nội',
      locationCode: 'ha-noi',
      matchedBy: 'locationCode',
    });
  });

  it('maps known legacy aliases to canonical codes', () => {
    expect(resolveLocationFromInput('Ha Noi')?.code).toBe('ha-noi');
    expect(resolveLocationFromInput('Ho Chi Minh City')?.code).toBe('ho-chi-minh');
    expect(getLocationByCode('remote')?.label).toBe('Remote');
  });

  it('marks unmapped values clearly for migration reporting', () => {
    expect(planLocationBackfill(undefined, 'Mars Colony')).toEqual({
      normalizedInput: 'mars colony',
      status: 'unresolved',
    });
  });
});
