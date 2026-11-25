import { BadRequestException } from '@nestjs/common';
import {
  andFilter,
  buildDateRange,
  buildKeywordFilter,
  buildPaginationMeta,
  MAX_PAGE_LIMIT,
  parseListQuery,
  resolvePagination,
} from './list-query.helper';

const options = {
  filterFields: new Set(['name', 'status', 'score', 'tags']),
  sortFields: new Set(['name', 'createdAt']),
};

describe('parseListQuery', () => {
  it('answers 400 for a filter that is not a valid regex', () => {
    expect(() => parseListQuery({ name: '/c++/i' }, options)).toThrow(BadRequestException);
  });

  it('never reads keyword as a filter', () => {
    expect(parseListQuery({ keyword: '/c++/i', name: 'acme' }, options).filter).toEqual({
      name: 'acme',
    });
  });

  it('keeps allowlisted fields and drops unknown and top-level operator keys', () => {
    const { filter } = parseListQuery(
      { name: 'acme', password: 'x', $where: '1', $or: '[{"a":1}]', page: '2', limit: '5' },
      options,
    );
    expect(filter).toEqual({ name: 'acme' });
  });

  it('ignores populate, fields and projection from the client', () => {
    const { filter } = parseListQuery(
      { populate: 'userId', fields: 'password', projection: 'x', status: 'OPEN' },
      options,
    );
    expect(filter).toEqual({ status: 'OPEN' });
  });

  it('keeps comparison operators and drops other nested operators', () => {
    const { filter } = parseListQuery(
      {
        filter: JSON.stringify({ score: { $gte: 50, $where: '1' }, status: { $regex: '(a+)+$' } }),
      },
      options,
    );
    expect(filter).toEqual({ score: { $gte: 50 } });
  });

  it('turns client regex into a literal case-insensitive search', () => {
    const { filter } = parseListQuery('name=/a.*b/ig', options);
    expect(filter.name).toBeInstanceOf(RegExp);
    expect(filter.name.source).toBe('a\\.\\*b');
    expect(filter.name.flags).toBe('i');
    expect(filter.name.test('xa.*by')).toBe(true);
    expect(filter.name.test('axxb')).toBe(false);
  });

  it('escapes regex values inside $in arrays', () => {
    const { filter } = parseListQuery(
      { filter: JSON.stringify({ tags: { $in: ['ts'] } }) },
      options,
    );
    expect(filter.tags).toEqual({ $in: ['ts'] });

    const withRegex = parseListQuery('tags=/(a+)+$/i,/b/', options);
    const values = (withRegex.filter.tags.$in ?? withRegex.filter.tags) as unknown[];
    for (const value of values) {
      if (value instanceof RegExp) expect(value.source).not.toContain('(a+)+$');
    }
  });

  it('keeps only allowlisted sort fields with 1/-1', () => {
    const { sort } = parseListQuery('sort=-createdAt,password,name', options);
    expect(Object.entries(sort)).toEqual([
      ['createdAt', -1],
      ['name', 1],
      ['_id', 1],
    ]);
  });

  it('falls back to defaultSort when no valid sort is given', () => {
    const { sort } = parseListQuery('sort=password', {
      ...options,
      defaultSort: { createdAt: -1 },
    });
    expect(sort).toEqual({ createdAt: -1, _id: 1 });
  });

  it('accepts empty or missing queries', () => {
    expect(parseListQuery(undefined, options)).toEqual({ filter: {}, sort: {} });
    expect(parseListQuery('', options)).toEqual({ filter: {}, sort: {} });
  });
});

describe('resolvePagination', () => {
  it('clamps limit to the maximum', () => {
    expect(resolvePagination('1', '1000')).toEqual({ page: 1, limit: MAX_PAGE_LIMIT, offset: 0 });
  });

  it('falls back to defaults for invalid values', () => {
    expect(resolvePagination('0', 'abc')).toEqual({ page: 1, limit: 10, offset: 0 });
    expect(resolvePagination(undefined, undefined)).toEqual({ page: 1, limit: 10, offset: 0 });
    expect(resolvePagination(Number.NaN, -5)).toEqual({ page: 1, limit: 10, offset: 0 });
    expect(resolvePagination('2.5', '10')).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  it('computes the offset from numbers or numeric strings', () => {
    expect(resolvePagination(3, 20)).toEqual({ page: 3, limit: 20, offset: 40 });
    expect(resolvePagination('3', '20')).toEqual({ page: 3, limit: 20, offset: 40 });
  });
});

describe('buildPaginationMeta', () => {
  it('returns the legacy snake_case shape and rounds pages up', () => {
    expect(buildPaginationMeta(2, 10, 21)).toEqual({
      pagination: { current_page: 2, per_page: 10, total_pages: 3, total: 21 },
    });
  });
});

describe('buildKeywordFilter', () => {
  it.each([
    ['Nguyễn', 'Nguyen Van An'],
    ['nguyen', 'NGUYỄN Văn An'],
    ['đa nang', 'Đà Nẵng'],
    ['Ha Noi', 'Hà Nội'],
  ])('finds %s in %s: accents do not matter', (keyword, stored) => {
    const [{ name }] = buildKeywordFilter(keyword, ['name']).$or;
    expect(name.test(stored)).toBe(true);
  });

  it('still tells different letters apart', () => {
    const [{ name }] = buildKeywordFilter('ha noi', ['name']).$or;
    expect(name.test('Hai Noi')).toBe(false);
  });

  it('matches the trimmed keyword literally in every field', () => {
    expect(buildKeywordFilter(' c++ ', ['name', 'email'])).toEqual({
      $or: [{ name: /c\+\+/i }, { email: /c\+\+/i }],
    });
  });

  it('is undefined for a missing or blank keyword', () => {
    expect(buildKeywordFilter(undefined, ['name'])).toBeUndefined();
    expect(buildKeywordFilter('   ', ['name'])).toBeUndefined();
  });
});

describe('andFilter', () => {
  it('keeps existing $or and $and conditions', () => {
    const filter: Record<string, any> = { $or: [{ a: 1 }], $and: [{ b: 1 }] };
    andFilter(filter, { c: 1 });
    expect(filter).toEqual({ $or: [{ a: 1 }], $and: [{ b: 1 }, { c: 1 }] });
  });

  it('does nothing without a condition', () => {
    const filter = {};
    andFilter(filter, undefined);
    expect(filter).toEqual({});
  });
});

describe('buildDateRange', () => {
  it('is inclusive and accepts either end', () => {
    const from = '2026-11-01T00:00:00.000Z';
    const to = '2026-11-25T00:00:00.000Z';
    expect(buildDateRange(from, to)).toEqual({ $gte: new Date(from), $lte: new Date(to) });
    expect(buildDateRange(undefined, to)).toEqual({ $lte: new Date(to) });
    expect(buildDateRange()).toBeUndefined();
  });
});
