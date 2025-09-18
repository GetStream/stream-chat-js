/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  arraysEqualAsSets,
  asArray,
  compare,
  isIterableButNotString,
  normalizeComparedValues,
  resolveDotPathValue,
  toIterableArray,
  tokenize,
} from './utility.normalization';
import type { FieldToDataResolver } from './types.normalization';
import type { QueryFilters } from '../types';

export type ItemMatchesFilterOptions<DataSource> = {
  /** Custom resolvers to extract values from an item given a path */
  resolvers?: ReadonlyArray<FieldToDataResolver<DataSource>>;
};

export function itemMatchesFilter<T>(
  item: T,
  filter: QueryFilters<any>,
  options: ItemMatchesFilterOptions<T>,
): boolean {
  const resolvers = options.resolvers ?? [];
  const resolverValueCache = new Map<string, unknown>();

  const resolveOnce = (field: string) => {
    if (resolverValueCache.has(field)) return resolverValueCache.get(field);
    const resolver = resolvers?.find((resolver) => resolver.matchesField(field)) ?? {
      resolve: resolveDotPathValue,
    };
    const value = resolver.resolve(item, field);
    resolverValueCache.set(field, value);
    return value;
  };

  const matches = (filterNode: QueryFilters<any>): boolean => {
    if (!filterNode || typeof filterNode !== 'object') return true;

    if (filterNode.$and) return filterNode.$and.every((n) => matches(n));
    if (filterNode.$or) return filterNode.$or.some((n) => matches(n));
    if (filterNode.$nor) return !filterNode.$nor.some((n) => matches(n));

    for (const [field, condition] of Object.entries(filterNode)) {
      const itemPropertyValue = resolveOnce(field);

      if (
        typeof condition !== 'object' ||
        condition === null ||
        Array.isArray(condition)
      ) {
        if (!equalsOp(itemPropertyValue, condition)) return false;
        continue;
      }

      for (const [op, filterValue] of Object.entries(condition)) {
        switch (op) {
          case '$eq':
            if (!equalsOp(itemPropertyValue, filterValue)) return false;
            break;
          case '$ne':
            if (equalsOp(itemPropertyValue, filterValue)) return false;
            break;

          case '$in':
            if (!inSetOp(itemPropertyValue, asArray(filterValue))) return false;
            break;
          case '$nin':
            if (inSetOp(itemPropertyValue, asArray(filterValue))) return false;
            break;

          case '$gt':
            if (!orderedCompareOp(itemPropertyValue, filterValue, (c) => c > 0))
              return false;
            break;
          case '$gte':
            if (!orderedCompareOp(itemPropertyValue, filterValue, (c) => c >= 0))
              return false;
            break;
          case '$lt':
            if (!orderedCompareOp(itemPropertyValue, filterValue, (c) => c < 0))
              return false;
            break;
          case '$lte':
            if (!orderedCompareOp(itemPropertyValue, filterValue, (c) => c <= 0))
              return false;
            break;

          case '$exists':
            if (!!itemPropertyValue !== !!filterValue) return false;
            break;
          case '$contains':
            if (!containsOp(itemPropertyValue, filterValue)) return false;
            break;
          case '$autocomplete':
            if (!autoCompleteOp(itemPropertyValue, filterValue)) return false;
            break;
          default:
            return false;
        }
      }
    }
    return true;
  };
  return matches(filter);
}

/**
 * Duplicates ignored for array–array equality: ['a','a','b'] equals ['b','a'].
 *
 * Empty arrays: [] equals []; a scalar never equals [].
 *
 * This reuses your normalizeComparedValues so '1' equals 1, ISO dates compare correctly, etc.
 *
 * $gt/$gte/$lt/$lte remain scalar-only (return false if either side is iterable), as you wanted.
 *
 * $in/$nin left may be scalar or iterable; the right is a list.
 * @param a
 * @param b
 * @param ok
 */
function orderedCompareOp(a: any, b: any, ok: (c: number) => boolean): boolean {
  if (isIterableButNotString(a) || isIterableButNotString(b)) return false;
  const n = normalizeComparedValues(a, b);
  if (n.kind === 'incomparable') return false;
  return ok(compare(n.a, n.b));
}

function equalsOp(left: any, right: any): boolean {
  const leftIsIter = isIterableButNotString(left);
  const rightIsIter = isIterableButNotString(right);

  if (!leftIsIter && !rightIsIter) {
    // scalar vs scalar
    const n = normalizeComparedValues(left, right);
    if (n.kind === 'incomparable') return Object.is(left, right);
    return n.a === n.b;
  }

  if (leftIsIter && rightIsIter) {
    // array vs array → set equality (order-insensitive)
    const a = toIterableArray(left);
    const b = toIterableArray(right);
    return arraysEqualAsSets(a, b);
  }

  // one side scalar, the other iterable → membership
  if (leftIsIter) {
    const a = toIterableArray(left);
    return a.some((elem) => equalsOp(elem, right));
  } else {
    const b = toIterableArray(right);
    return b.some((elem) => equalsOp(left, elem));
  }
}

function inSetOp(a: any, arr: any[]): boolean {
  return arr.some((b) => equalsOp(a, b));
}

function containsOp(value: any, needle: any): boolean {
  if (Array.isArray(value)) return value.includes(needle);
  if (typeof value === 'string' && typeof needle === 'string')
    return value.includes(needle);
  return false;
}

/**
 * A value matches an autocomplete query if:
 * - value is string: every query token is a prefix of some token in the value
 * - value is string[]: any element matches as above
 * - query can be string (tokenized) or string[]
 */
function autoCompleteOp(value: any, query: any): boolean {
  if (value == null || query == null) return false;

  const queryTokens: string[] = Array.isArray(query)
    ? query.map(String).flatMap(tokenize)
    : tokenize(String(query));
  if (queryTokens.length === 0) return false;

  const matchOneString = (s: string): boolean => {
    const valTokens = tokenize(s);
    return queryTokens.every((qt) => valTokens.some((vt) => vt.includes(qt)));
  };

  if (typeof value === 'string') return matchOneString(value);
  if (Array.isArray(value))
    return value.some((v) => typeof v === 'string' && matchOneString(v));
  return false;
}
