import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseCorsOrigins(' https://a.example , https://b.example,, ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('returns an empty list for a missing value', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });
});
