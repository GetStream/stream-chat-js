import { describe, expect, it } from 'vitest';
import { lowerBound } from '../../../src/pagination/utility.search';

describe('lowerBound', () => {
  // predicate = "value at index is >= threshold" over a sorted array
  const firstAtLeast = (sorted: number[], threshold: number) =>
    lowerBound(sorted.length, (index) => sorted[index] >= threshold);

  it('returns 0 when the whole range satisfies the predicate', () => {
    expect(firstAtLeast([5, 6, 7], 5)).toBe(0);
  });

  it('returns length when no index satisfies the predicate', () => {
    expect(firstAtLeast([1, 2, 3], 10)).toBe(3);
  });

  it('returns 0 for an empty range', () => {
    expect(lowerBound(0, () => true)).toBe(0);
  });

  it('finds the boundary in the middle', () => {
    expect(firstAtLeast([1, 3, 5, 7, 9], 5)).toBe(2);
    expect(firstAtLeast([1, 3, 5, 7, 9], 6)).toBe(3);
  });

  it('returns the first satisfying index across a plateau of equal values', () => {
    expect(firstAtLeast([1, 5, 5, 5, 9], 5)).toBe(1);
  });
});
