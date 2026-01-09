/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  compare,
  resolveDotPathValue as defaultResolvePathValue,
  normalizeComparedValues,
} from './utility.normalization';
import { normalizeQuerySort } from '../utils';
import type { AscDesc } from '../types';
import type { Comparator, PathResolver } from './types.normalization';

export function binarySearchInsertIndex<T>({
  compare,
  needle,
  sortedArray,
}: {
  sortedArray: T[];
  needle: T;
  compare: Comparator<T>;
}): number {
  let low = 0;
  let high = sortedArray.length;

  while (low < high) {
    const middle = (low + high) >>> 1; // fast floor((low+high)/2)
    const comparisonResult = compare(sortedArray[middle], needle);

    // We want the first position where existing > needle to insert before it
    if (comparisonResult > 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

/**
 * Negative number (< 0) → a comes before b
 *
 * Zero (0) → leave a and b unchanged relative to each other
 * (but they can still move relative to others — sort in JS is not guaranteed stable in older engines, though modern V8/Node/Chrome/Firefox make it stable)
 *
 * Positive number (> 0) → a comes after b
 * @param sort
 * @param resolvePathValue
 * @param tiebreaker
 */
export function makeComparator<
  T,
  S extends Record<string, AscDesc> | Record<string, AscDesc>[],
>({
  sort,
  resolvePathValue = defaultResolvePathValue,
  tiebreaker = (a, b) => compare((a as any).cid, (b as any).cid),
}: {
  sort: S;
  resolvePathValue?: PathResolver<T>;
  tiebreaker?: Comparator<T>;
}): Comparator<T> {
  const terms = normalizeQuerySort(sort);

  return (a: T, b: T) => {
    for (const { field: path, direction } of terms) {
      const leftValue = resolvePathValue(a, path);
      const rightValue = resolvePathValue(b, path);
      const normalized = normalizeComparedValues(leftValue, rightValue);
      let comparison: number;
      switch (normalized.kind) {
        case 'date':
        case 'number':
        case 'string':
        case 'boolean':
          comparison = compare(normalized.a, normalized.b);
          break;
        default:
          // deterministic fallback: null/undefined last; else string compare
          if (leftValue == null && rightValue == null) comparison = 0;
          else if (leftValue == null) comparison = 1;
          else if (rightValue == null) comparison = -1;
          else {
            const stringLeftValue = String(leftValue),
              stringRightValue = String(rightValue);
            comparison =
              stringLeftValue === stringRightValue
                ? 0
                : stringLeftValue < stringRightValue
                  ? -1
                  : 1;
          }
      }
      if (comparison !== 0) return direction === 1 ? comparison : -comparison;
    }
    return tiebreaker ? tiebreaker(a, b) : 0;
  };
}
