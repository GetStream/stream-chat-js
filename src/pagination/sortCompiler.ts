import {
  compare,
  resolveDotPathValue as defaultResolvePathValue,
  normalizeComparedValues,
} from './utility.normalization';
import type { SortParamRequest } from '../types';
import type { Comparator, PathResolver } from './types.normalization';

export type ItemLocation = {
  currentIndex: number;
  insertionIndex: number;
};

/**
 * Binary search over an abstract sorted array. Returns the needle's `currentIndex` (`-1` if absent)
 * and the `insertionIndex` where `compare` places it (after items that compare equal). With
 * `plateauScan`, a needle not at the insertion index is looked for by identity, scanning outward
 * from it.
 */
export function binarySearch<T>({
  needle,
  length,
  getItemAt,
  itemIdentityEquals,
  compare,
  plateauScan,
}: {
  needle: T;
  length: number;
  /** Reads the item at an index (the array may hold IDs resolved through an index). */
  getItemAt: (index: number) => T | undefined;
  /** Identity, not equality under the sort order. */
  itemIdentityEquals: (item1: T, item2: T) => boolean;
  compare: Comparator<T>;
  plateauScan?: boolean;
}): ItemLocation {
  if (length === 0) return { currentIndex: -1, insertionIndex: 0 };

  let lo = 0;
  let hi = length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midItem = getItemAt(mid);
    if (!midItem) {
      // An ID without a backing item: report not found.
      return { currentIndex: -1, insertionIndex: -1 };
    }

    if (itemIdentityEquals(midItem, needle) && mid > 0) {
      // The needle's own slot compares 0 and says nothing about where it belongs, and its value may
      // have just changed in place (items held by reference): use the left neighbour, or it never
      // moves.
      const leftItem = getItemAt(mid - 1);
      if (leftItem && compare(leftItem, needle) > 0) {
        hi = mid;
        continue;
      }
    }

    if (compare(midItem, needle) <= 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const insertionIndex = lo;

  const itemAtExpectedIndex = getItemAt(insertionIndex);
  if (itemAtExpectedIndex && itemIdentityEquals(itemAtExpectedIndex, needle)) {
    return { currentIndex: insertionIndex, insertionIndex };
  }

  if (!plateauScan) {
    return { currentIndex: -1, insertionIndex };
  }

  const checkSide = (atIndex: number) => {
    const result = { exhausted: false, found: false };
    const item = getItemAt(atIndex);
    if (!item) result.exhausted = true;
    else if (itemIdentityEquals(item, needle)) result.found = true;
    return result;
  };

  let iLeft = insertionIndex - 1;
  let iRight = insertionIndex + 1; // insertionIndex itself is already checked
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

  return { currentIndex: -1, insertionIndex };
}

/**
 * Builds a comparator from a sort spec: terms apply in order, then `tiebreaker`.
 * `null`/`undefined` values sort last whatever the direction.
 *
 * @param params - Comparator configuration.
 * @param params.sort - The sort specification defining fields and directions.
 * @param params.resolvePathValue - Resolver used to read a field value from an item.
 * @param params.tiebreaker - Comparator applied when all sort terms are equal. Defaults to
 *   comparing `cid`.
 * @returns The comparator.
 */
export function makeComparator<T>({
  sort,
  resolvePathValue = defaultResolvePathValue,
  tiebreaker = (a, b) => compare((a as any).cid, (b as any).cid),
}: {
  sort: SortParamRequest[];
  resolvePathValue?: PathResolver<T>;
  tiebreaker?: Comparator<T>;
}): Comparator<T> {
  return (a: T, b: T) => {
    for (const { field: path, direction } of sort) {
      const leftValue = resolvePathValue(a, path as string);
      const rightValue = resolvePathValue(b, path as string);
      const normalized = normalizeComparedValues(leftValue, rightValue);
      let comparison: number;
      switch (normalized.kind) {
        case 'date':
        case 'number':
        case 'string':
        case 'boolean':
          comparison = compare(normalized.a, normalized.b);
          break;
        default: {
          // Return before the direction flip below, which would turn "null last" into "null first"
          // on a descending sort.
          if (leftValue == null && rightValue == null) {
            comparison = 0;
            break;
          }
          if (leftValue == null) return 1;
          if (rightValue == null) return -1;
          // Both non-null but not normalizable: compare as strings (respects direction).
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
