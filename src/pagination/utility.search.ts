/**
 * Partition-point ("lower bound") binary search over the index range `[0, length)`.
 *
 * `predicate` must be **monotonic** over the range — `false` for a (possibly empty) prefix, then
 * `true` for the remaining suffix. Returns the first index at which `predicate(index)` holds, or
 * `length` if it never does. O(log length).
 *
 * Unlike `binarySearch`, this locates a *boundary* defined by a predicate rather than a specific
 * item by identity — e.g. "first message at/after a timestamp" over a chronologically sorted array.
 */
export function lowerBound(
  length: number,
  predicate: (index: number) => boolean,
): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (predicate(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function locateOnPlateauAlternating<T>(
  items: readonly T[],
  needle: T,
  compare: (left: T, right: T) => number,
  getItemId: (x: T) => string,
  insertionIndex: number,
): number {
  const targetId = getItemId(needle);
  let leftIndex = insertionIndex - 1;
  let rightIndex = insertionIndex;

  for (let step = 0; ; step++) {
    const searchRight = step % 2 === 0;

    if (searchRight) {
      if (rightIndex < items.length && compare(items[rightIndex], needle) === 0) {
        if (getItemId(items[rightIndex]) === targetId) return rightIndex;
        rightIndex++;
        continue;
      }
    } else {
      if (leftIndex >= 0 && compare(items[leftIndex], needle) === 0) {
        if (getItemId(items[leftIndex]) === targetId) return leftIndex;
        leftIndex--;
        continue;
      }
    }

    const rightOut =
      rightIndex >= items.length || compare(items[rightIndex], needle) !== 0;
    const leftOut = leftIndex < 0 || compare(items[leftIndex], needle) !== 0;
    if (rightOut && leftOut) break; // plateau exhausted
  }

  return -1;
}

export function locateOnPlateauScanOneSide<T>(
  items: readonly T[],
  needle: T,
  compare: (left: T, right: T) => number,
  getItemId: (x: T) => string,
  insertionIndex: number,
): number {
  const targetId = getItemId(needle);

  // scan left
  for (let i = insertionIndex - 1; i >= 0 && compare(items[i], needle) === 0; i--) {
    if (getItemId(items[i]) === targetId) return i;
  }
  // scan right
  for (let i = insertionIndex; i < items.length && compare(items[i], needle) === 0; i++) {
    if (getItemId(items[i]) === targetId) return i;
  }
  return -1;
}
