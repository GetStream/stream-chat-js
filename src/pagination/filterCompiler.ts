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

    // Logical operators are ANDed with each other and with sibling field conditions on the same
    // node (`{ $or: [...], field: value }` means `field == value AND $or`): do not skip the loop.
    if (filterNode.$and && !filterNode.$and.every((n) => matches(n))) return false;
    if (filterNode.$or && !filterNode.$or.some((n) => matches(n))) return false;
    if (filterNode.$nor && filterNode.$nor.some((n) => matches(n))) return false;

    for (const [field, condition] of Object.entries(filterNode)) {
      if (field === '$and' || field === '$or' || field === '$nor') continue;
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

/** `$gt/$gte/$lt/$lte` are scalar-only: false if either side is iterable or incomparable. */
function orderedCompareOp(a: any, b: any, ok: (c: number) => boolean): boolean {
  if (isIterableButNotString(a) || isIterableButNotString(b)) return false;
  const n = normalizeComparedValues(a, b);
  if (n.kind === 'incomparable') return false;
  return ok(compare(n.a, n.b));
}

/**
 * Scalars are normalized before comparing (`'1'` equals `1`, ISO dates compare by value). Two arrays
 * are equal as sets (order and duplicates ignored, `[]` equals `[]`). A scalar against an array
 * matches by membership, so a scalar never equals `[]`.
 */
function equalsOp(left: any, right: any): boolean {
  const leftIsIter = isIterableButNotString(left);
  const rightIsIter = isIterableButNotString(right);

  if (!leftIsIter && !rightIsIter) {
    const n = normalizeComparedValues(left, right);
    if (n.kind === 'incomparable') return Object.is(left, right);
    return n.a === n.b;
  }

  if (leftIsIter && rightIsIter) {
    const a = toIterableArray(left);
    const b = toIterableArray(right);
    return arraysEqualAsSets(a, b);
  }

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
 * A string value matches when every query token is contained in some token of the value (substring,
 * not only prefix); a `string[]` value matches when any element does. The query is a string
 * (tokenized) or a `string[]`.
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

const LOGICAL_FILTER_OPERATORS = ['$and', '$or', '$nor'] as const;

/**
 * Whether a filter constrains `field`, at the top level or inside a logical operator. Nothing else is
 * recursed into: the same key elsewhere (`{ custom: { hidden: … } }`) is a different field.
 */
export const filterConstrainsField = (filters: unknown, field: string): boolean => {
  if (!filters || typeof filters !== 'object') return false;
  if (Array.isArray(filters))
    return filters.some((entry) => filterConstrainsField(entry, field));
  const node = filters as Record<string, unknown>;
  if (field in node) return true;
  return LOGICAL_FILTER_OPERATORS.some((operator) =>
    filterConstrainsField(node[operator], field),
  );
};
