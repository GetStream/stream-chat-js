/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  compare,
  resolveDotPathValue as defaultResolvePathValue,
  normalizeComparedValues,
} from './utility.normalization';
import { normalizeQuerySort } from '../utils';
import type { AscDesc } from '../types';
import type { Comparator, PathResolver } from './types.normalization';

export type ItemLocation = {
  currentIndex: number;
  insertionIndex: number;
};

/**
 * Generic binary-search + plateau lookup over an abstract sorted array.
 *
 * The array is represented by:
 *  - its length
 *  - a getter `getItemAt(index)` that returns the item (or undefined)
 *
 * It returns:
 *  - current: actual index of the item in the array
 *  - expected: lower-bound position where the item belongs according to compare function
 */
export function binarySearch<T>({
  needle,
  length,
  getItemAt,
  itemIdentityEquals,
  compare,
  plateauScan,
}: {
  /** Target item in the searched array */
  needle: T;
  length: number;
  /** Retrieves the item from an array. The array could be just an array of reference by id to an index.
   * Therefore, we do not access the array directly but allow to determine, how the item is constructed.
   */
  getItemAt: (index: number) => T | undefined;
  /** Used to determine identity, not equality based on sort / comparator rules */
  itemIdentityEquals: (item1: T, item2: T) => boolean;
  /** Used to determine equality from the sort order point of view. */
  compare: Comparator<T>;
  plateauScan?: boolean;
}): ItemLocation {
  // empty array
  if (length === 0) return { currentIndex: -1, insertionIndex: 0 };

  // --- 1) Binary search to find lower bound (insertionIndex) ---
  let lo = 0;
  let hi = length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1; // fast floor((low+high)/2)
    const midItem = getItemAt(mid);
    if (!midItem) {
      // Corruption: we have an ID but no backing item.
      // Bail out with "not found".
      return { currentIndex: -1, insertionIndex: -1 };
    }

    if (compare(midItem, needle) <= 0) {
      // midItem < needle ⇒ go right
      lo = mid + 1;
    } else {
      // midItem ≥ needle ⇒ go left
      hi = mid;
    }
  }

  const insertionIndex = lo;

  // item is located where it is expected to be according to the sort
  const itemAtExpectedIndex = getItemAt(insertionIndex);
  if (itemAtExpectedIndex && itemIdentityEquals(itemAtExpectedIndex, needle)) {
    return { currentIndex: insertionIndex, insertionIndex };
  }

  if (!plateauScan) {
    return { currentIndex: -1, insertionIndex };
  }

  // --- 2) Plateau scan around insertionIndex ---

  const checkSide = (atIndex: number) => {
    const result = { exhausted: false, found: false };
    const item = getItemAt(atIndex);
    if (!item) result.exhausted = true;
    else if (itemIdentityEquals(item, needle)) result.found = true;
    return result;
  };

  // Alternating left/right scan
  let iLeft = insertionIndex - 1;
  let iRight = insertionIndex + 1; // we've already checked insertionIndex
  let leftDone = iLeft < 0;
  let rightDone = iRight >= length;

  while (!leftDone || !rightDone) {
    if (!leftDone) {
      const result = checkSide(iLeft);
      if (result.found) return { currentIndex: iLeft, insertionIndex };
      leftDone = result.exhausted || --iLeft < 0;
    }

    if (!rightDone) {
      const result = checkSide(iRight);
      if (result.found) return { currentIndex: iRight, insertionIndex };
      rightDone = result.exhausted || ++iRight >= length;
    }
  }

  // Not found in plateau; insertion index is still the correct lower bound.
  return { currentIndex: -1, insertionIndex };
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
