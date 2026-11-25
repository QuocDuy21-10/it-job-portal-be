import { BadRequestException } from '@nestjs/common';
import aqp from 'api-query-params';

export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;

export type SortDirection = 1 | -1;

export interface ListQueryOptions {
  filterFields: ReadonlySet<string>;
  sortFields: ReadonlySet<string>;
  defaultSort?: Record<string, SortDirection>;
}

const SAFE_VALUE_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']);

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VIETNAMESE_LETTERS = [
  'aàáảãạăằắẳẵặâầấẩẫậ',
  'eèéẻẽẹêềếểễệ',
  'iìíỉĩị',
  'oòóỏõọôồốổỗộơờớởỡợ',
  'uùúủũụưừứửữự',
  'yỳýỷỹỵ',
  'dđ',
];

/** Literal and case-insensitive; "Nguyen" and "Nguyễn" find each other. */
const buildSearchRegex = (text: string): RegExp =>
  new RegExp(
    [...escapeRegex(text.normalize('NFC'))]
      .map(char => {
        const letters = VIETNAMESE_LETTERS.find(group => group.includes(char.toLowerCase()));
        return letters ? `[${letters}]` : char;
      })
      .join(''),
    'i',
  );

/** `keyword` as a plain-text search over the given fields. */
export function buildKeywordFilter(keyword: string | undefined, fields: readonly string[]) {
  const trimmed = keyword?.trim();
  if (!trimmed) return undefined;

  const regex = buildSearchRegex(trimmed);
  return { $or: fields.map(field => ({ [field]: regex })) };
}

/** Adds a condition through $and so it cannot overwrite an existing $or or field. */
export function andFilter(
  filter: Record<string, any>,
  condition: Record<string, unknown> | undefined,
): void {
  if (condition) filter.$and = [...(filter.$and ?? []), condition];
}

export function buildDateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
}

// Client regex becomes a literal substring search so it cannot trigger ReDoS.
const toLiteralRegex = (value: unknown): unknown =>
  value instanceof RegExp
    ? new RegExp(escapeRegex(value.source), value.flags.includes('i') ? 'i' : '')
    : value;

const sanitizeOperand = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(toLiteralRegex) : toLiteralRegex(value);

function sanitizeFilterValue(value: unknown): unknown {
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value)
      .filter(([op]) => SAFE_VALUE_OPERATORS.has(op))
      .map(([op, operand]) => [op, sanitizeOperand(operand)]);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return sanitizeOperand(value);
}

// `keyword` is searched as plain text elsewhere; aqp would read "/c++/i" as a regex and throw.
function parseRawQuery(rawQuery: unknown) {
  const query =
    rawQuery && typeof rawQuery === 'object'
      ? Object.fromEntries(Object.entries(rawQuery).filter(([key]) => key !== 'keyword'))
      : (rawQuery ?? '');
  try {
    return aqp(query as Parameters<typeof aqp>[0]);
  } catch {
    throw new BadRequestException('Bộ lọc không đúng định dạng');
  }
}

/** Parses an aqp query string/object into an allowlisted Mongo filter and sort. Pagination is separate. */
export function parseListQuery(
  rawQuery: unknown,
  options: ListQueryOptions,
): { filter: Record<string, any>; sort: Record<string, SortDirection> } {
  const { filter: rawFilter, sort: rawSort } = parseRawQuery(rawQuery);

  const filter: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawFilter ?? {})) {
    if (!options.filterFields.has(key)) continue;
    const safeValue = sanitizeFilterValue(value);
    if (safeValue !== undefined) filter[key] = safeValue;
  }

  const sort: Record<string, SortDirection> = {};
  for (const [key, value] of Object.entries(rawSort ?? {})) {
    if (options.sortFields.has(key) && (value === 1 || value === -1)) sort[key] = value;
  }

  const applied = Object.keys(sort).length > 0 ? sort : { ...options.defaultSort };
  // Equal sort values have no fixed order in MongoDB, so pages would repeat and skip documents.
  if (Object.keys(applied).length > 0) applied._id = 1;
  return { filter, sort: applied };
}

export function resolvePagination(
  page: unknown,
  limit: unknown,
  defaultLimit = DEFAULT_PAGE_LIMIT,
  maxLimit = MAX_PAGE_LIMIT,
): { page: number; limit: number; offset: number } {
  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const safePage = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const safeLimit =
    Number.isInteger(limitNumber) && limitNumber > 0
      ? Math.min(limitNumber, maxLimit)
      : defaultLimit;
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

export function buildPaginationMeta(page: number, limit: number, total: number) {
  return {
    pagination: {
      current_page: page,
      per_page: limit,
      total_pages: Math.ceil(total / limit),
      total,
    },
  };
}
