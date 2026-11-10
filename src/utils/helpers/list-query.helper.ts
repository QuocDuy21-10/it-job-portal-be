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

/** Parses an aqp query string/object into an allowlisted Mongo filter and sort. Pagination is separate. */
export function parseListQuery(
  rawQuery: unknown,
  options: ListQueryOptions,
): { filter: Record<string, any>; sort: Record<string, SortDirection> } {
  const { filter: rawFilter, sort: rawSort } = aqp((rawQuery ?? '') as Parameters<typeof aqp>[0]);

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

  if (Object.keys(sort).length === 0 && options.defaultSort) {
    return { filter, sort: { ...options.defaultSort } };
  }
  return { filter, sort };
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
