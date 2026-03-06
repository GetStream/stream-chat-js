// sortCompiler.spec.ts
import { describe, it, expect } from 'vitest';
import { binarySearch, makeComparator } from '../../../src/pagination/sortCompiler';
import { resolveDotPathValue as defaultResolvePathValue } from '../../../src/pagination/utility.normalization';
import type { AscDesc } from '../../../src';

// Minimal item type for tests
type Item = {
  cid: string; // tie-breaker field (default tiebreak compares by cid)
  v?: unknown; // primary field for many tests
  nested?: { x?: unknown }; // nested field for dot-path tests
};

// Small utility: sort a shallow copy and return cids to verify ordering
function orderByComparator(items: Item[], cmp: (a: Item, b: Item) => number): string[] {
  return [...items].sort(cmp).map((i) => i.cid);
}

/**
 * Helper to build a comparator with optional resolvePathValue override.
 */
function toComparator(
  sort: Record<string, AscDesc> | Array<Record<string, AscDesc>>,
  resolvePathValue = defaultResolvePathValue,
) {
  return makeComparator<Item, Record<string, AscDesc> | Array<Record<string, AscDesc>>>({
    sort,
    resolvePathValue,
  });
}

describe('makeComparator', () => {
  it('sorts numbers ascending/descending', () => {
    const items: Item[] = [
      { cid: 'c', v: 10 },
      { cid: 'a', v: 2 },
      { cid: 'b', v: 2 }, // equal to test tie-breaker by cid
      { cid: 'd', v: 100 },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['a', 'b', 'c', 'd']);

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('sorts strings ascending/descending with tie-break on cid', () => {
    const items: Item[] = [
      { cid: '2', v: 'beta' },
      { cid: '1', v: 'alpha' },
      { cid: '4', v: 'alpha' }, // same string as cid=1; tie-break by cid
      { cid: '3', v: 'gamma' },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['1', '4', '2', '3']);

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['3', '2', '1', '4']);
  });

  it('sorts booleans (false < true)', () => {
    const items: Item[] = [
      { cid: 'c', v: true },
      { cid: 'a', v: false },
      { cid: 'b', v: false },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['a', 'b', 'c']);

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['c', 'a', 'b']);
  });

  it('sorts dates (Date objects) descending', () => {
    const items: Item[] = [
      { cid: 'a', v: new Date('2023-01-01T00:00:00Z') },
      { cid: 'b', v: new Date('2024-01-01T00:00:00Z') },
      { cid: 'c', v: new Date('2022-06-15T00:00:00Z') },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['c', 'a', 'b']);

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['b', 'a', 'c']);
  });

  it('sorts dates given as ISO strings equivalently to Date objects', () => {
    const items: Item[] = [
      { cid: 'a', v: '2023-01-01T00:00:00Z' },
      { cid: 'b', v: '2024-01-01T00:00:00Z' },
      { cid: 'c', v: '2022-06-15T00:00:00Z' },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['c', 'a', 'b']);

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['b', 'a', 'c']);
  });

  it('sorts dates given as epoch ms (numbers) equivalently', () => {
    const items: Item[] = [
      { cid: 'a', v: Date.parse('2023-01-01T00:00:00Z') },
      { cid: 'b', v: Date.parse('2024-01-01T00:00:00Z') },
      { cid: 'c', v: Date.parse('2022-06-15T00:00:00Z') },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['c', 'a', 'b']);

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['b', 'a', 'c']);
  });

  it('uses resolvePathValue for nested paths', () => {
    const items: Item[] = [
      { cid: 'a', nested: { x: 100 } },
      { cid: 'b', nested: { x: 50 } },
      { cid: 'c', nested: { x: 75 } },
    ];

    const cmp = toComparator({ 'nested.x': 1 });
    expect(orderByComparator(items, cmp)).toEqual(['b', 'c', 'a']);
  });

  it('applies multi-field sorting in order (then uses cid tiebreaker)', () => {
    const items: Item[] = [
      { cid: '3', v: 1, nested: { x: 5 } },
      { cid: '1', v: 1, nested: { x: 10 } },
      { cid: '2', v: 1, nested: { x: 10 } },
      { cid: '4', v: 2, nested: { x: 0 } },
    ];

    // First by v asc, then nested.x desc; if both equal, tie-break by cid asc
    const cmp = toComparator([{ v: 1 }, { 'nested.x': -1 }]);
    expect(orderByComparator(items, cmp)).toEqual(['1', '2', '3', '4']);
  });

  it('fallback ordering: null/undefined come last (ascending) and first (descending)', () => {
    const items: Item[] = [
      { cid: 'a', v: 10 },
      { cid: 'b', v: undefined },
      { cid: 'c', v: null },
      { cid: 'd', v: 5 },
    ];

    const asc = toComparator({ v: 1 });
    expect(orderByComparator(items, asc)).toEqual(['d', 'a', 'b', 'c']); // null/undefined last

    const desc = toComparator({ v: -1 });
    expect(orderByComparator(items, desc)).toEqual(['b', 'c', 'a', 'd']); // null/undefined first
  });

  it('applies custom tiebreaker when provided', () => {
    const items: Item[] = [
      { cid: 'b', v: 1 },
      { cid: 'a', v: 1 },
      { cid: 'c', v: 1 },
    ];

    const customTiebreaker = (l: Item, r: Item) => r.cid.localeCompare(l.cid);

    const cmp = makeComparator<Item, Record<string, AscDesc>>({
      sort: { v: 1 }, // all v equal
      resolvePathValue: defaultResolvePathValue,
      tiebreaker: customTiebreaker,
    });

    expect(orderByComparator(items, cmp)).toEqual(['c', 'b', 'a']);
  });

  it('accepts array sort spec and object sort spec equivalently', () => {
    const items: Item[] = [
      { cid: '3', v: 2 },
      { cid: '1', v: 1 },
      { cid: '2', v: 1 },
    ];

    const arrayBasedComparator = toComparator([{ v: 1 }]);
    const objectBasedComparator = toComparator({ v: 1 });

    expect(orderByComparator(items, arrayBasedComparator)).toEqual(['1', '2', '3']);
    expect(orderByComparator(items, objectBasedComparator)).toEqual(['1', '2', '3']);
  });
});

const numberCompare = (a: number, b: number) => a - b;
const numberIdentityEquals = (a: number, b: number) => a === b;

describe('binarySearch (generic cursor-based)', () => {
  describe('empty array', () => {
    it('returns not found and insertionIndex 0 for empty array', () => {
      const result = binarySearch<number>({
        needle: 42,
        length: 0,
        getItemAt: () => undefined,
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
      });

      expect(result).toEqual({ currentIndex: -1, insertionIndex: 0 });
    });
  });

  describe('single-element array', () => {
    it('finds the element with plateauScan enabled', () => {
      const arr = [10];

      const result = binarySearch<number>({
        needle: arr[0],
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
        plateauScan: true,
      });

      // insertionIndex is after the last <= needle (upper bound)
      expect(result).toEqual({ currentIndex: 0, insertionIndex: 1 });
    });

    it('does not find the element when plateauScan is disabled', () => {
      const arr = [10];

      const result = binarySearch<number>({
        needle: arr[0],
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
        plateauScan: false,
      });

      // insertionIndex is upper bound; currentIndex is -1 when plateauScan is false
      expect(result).toEqual({ currentIndex: -1, insertionIndex: 1 });
    });

    it('inserts before the element when needle is smaller', () => {
      const arr = [10];

      const result = binarySearch<number>({
        needle: 5,
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
        plateauScan: true,
      });

      expect(result).toEqual({ currentIndex: -1, insertionIndex: 0 });
    });

    it('inserts after the element when needle is larger', () => {
      const arr = [10];

      const result = binarySearch<number>({
        needle: 20,
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
        plateauScan: true,
      });

      expect(result).toEqual({ currentIndex: -1, insertionIndex: 1 });
    });
  });

  describe('unique ascending numbers', () => {
    const arr = [1, 3, 5, 7, 9];

    it('computes correct insertionIndex when item not present (various positions)', () => {
      const baseArgs = {
        length: arr.length,
        getItemAt: (i: number) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
      };

      // before all elements
      expect(
        binarySearch<number>({
          ...baseArgs,
          needle: 0,
          plateauScan: true,
        }),
      ).toEqual({
        currentIndex: -1,
        insertionIndex: 0,
      });

      // between 1 and 3
      expect(
        binarySearch<number>({
          ...baseArgs,
          needle: 2,
          plateauScan: true,
        }),
      ).toEqual({
        currentIndex: -1,
        insertionIndex: 1,
      });

      // between 3 and 5
      expect(
        binarySearch<number>({
          ...baseArgs,
          needle: 4,
          plateauScan: true,
        }),
      ).toEqual({
        currentIndex: -1,
        insertionIndex: 2,
      });

      // after all elements
      expect(
        binarySearch<number>({
          ...baseArgs,
          needle: 10,
          plateauScan: true,
        }),
      ).toEqual({
        currentIndex: -1,
        insertionIndex: arr.length,
      });
    });

    it('finds existing elements only when plateauScan is enabled', () => {
      const baseArgs = {
        length: arr.length,
        getItemAt: (i: number) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
      };

      for (let idx = 0; idx < arr.length; idx++) {
        const needle = arr[idx];

        const found = binarySearch<number>({
          ...baseArgs,
          needle,
          plateauScan: true,
        });

        // insertionIndex is upper bound (after the element)
        expect(found.currentIndex).toBe(idx);
        expect(found.insertionIndex).toBe(idx + 1);

        const notFound = binarySearch<number>({
          ...baseArgs,
          needle,
          plateauScan: false,
        });

        // Without plateauScan, currentIndex is always -1 even for existing element
        expect(notFound.currentIndex).toBe(-1);
        expect(notFound.insertionIndex).toBe(idx + 1);
      }
    });

    it('treats omitted plateauScan the same as plateauScan=false', () => {
      const needleIndex = 2;
      const needle = arr[needleIndex]; // 5

      const result = binarySearch<number>({
        needle,
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
      });

      // by default, plateauScan is falsy
      expect(result.currentIndex).toBe(-1);
      // insertionIndex is upper bound
      expect(result.insertionIndex).toBe(needleIndex + 1);
    });
  });

  describe('duplicates (plateaus) with object identity', () => {
    type Obj = { id: number; label: string };

    it('returns end-of-plateau insertionIndex and correct currentIndex for identity', () => {
      // Plateau of 3's in the middle
      const arr: Obj[] = [
        { id: 1, label: 'a' }, // 0
        { id: 3, label: 'b' }, // 1
        { id: 3, label: 'c' }, // 2
        { id: 3, label: 'd' }, // 3
        { id: 5, label: 'e' }, // 4
      ];

      const compare = (a: Obj, b: Obj) => a.id - b.id;
      const identityEquals = (a: Obj, b: Obj) => a === b;

      const baseArgs = {
        length: arr.length,
        getItemAt: (i: number) => arr[i],
        itemIdentityEquals: identityEquals,
        compare,
        plateauScan: true,
      };

      // insertionIndex for id=3 value is after all 3's → index 4
      const insertionIndexFor3 = 4;

      const needleMiddle = arr[2];
      const resMiddle = binarySearch<Obj>({
        ...baseArgs,
        needle: needleMiddle,
      });
      expect(resMiddle).toEqual({
        currentIndex: 2,
        insertionIndex: insertionIndexFor3,
      });

      const needleLeft = arr[1];
      const resLeft = binarySearch<Obj>({ ...baseArgs, needle: needleLeft });
      expect(resLeft).toEqual({
        currentIndex: 1,
        insertionIndex: insertionIndexFor3,
      });

      const needleRight = arr[3];
      const resRight = binarySearch<Obj>({ ...baseArgs, needle: needleRight });
      expect(resRight).toEqual({
        currentIndex: 3,
        insertionIndex: insertionIndexFor3,
      });
    });

    it('plateau at the start of the array', () => {
      const arr: Obj[] = [
        { id: 3, label: 'a' }, // 0
        { id: 3, label: 'b' }, // 1
        { id: 3, label: 'c' }, // 2
        { id: 5, label: 'd' }, // 3
        { id: 8, label: 'e' }, // 4
      ];
      const compare = (a: Obj, b: Obj) => a.id - b.id;
      const identityEquals = (a: Obj, b: Obj) => a === b;

      const insertionIndexFor3 = 3; // first element with id > 3 is index 3

      const result = binarySearch<Obj>({
        needle: arr[0],
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: identityEquals,
        compare,
        plateauScan: true,
      });

      expect(result).toEqual({
        currentIndex: 0,
        insertionIndex: insertionIndexFor3,
      });
    });

    it('plateau at the end of the array', () => {
      const arr: Obj[] = [
        { id: 1, label: 'a' }, // 0
        { id: 2, label: 'b' }, // 1
        { id: 5, label: 'c' }, // 2
        { id: 5, label: 'd' }, // 3
        { id: 5, label: 'e' }, // 4
      ];
      const compare = (a: Obj, b: Obj) => a.id - b.id;
      const identityEquals = (a: Obj, b: Obj) => a === b;

      const insertionIndexFor5 = arr.length; // no element > 5

      const result = binarySearch<Obj>({
        needle: arr[4],
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: identityEquals,
        compare,
        plateauScan: true,
      });

      expect(result).toEqual({
        currentIndex: 4,
        insertionIndex: insertionIndexFor5,
      });
    });

    it('does not match by value when identity differs', () => {
      const arr: Obj[] = [
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
      ];

      const compare = (a: Obj, b: Obj) => a.id - b.id;
      const identityEquals = (a: Obj, b: Obj) => a === b;

      // same id as arr[1] but different object => not identical
      const needle: Obj = { id: 2, label: 'other' };

      const result = binarySearch<Obj>({
        needle,
        length: arr.length,
        getItemAt: (i) => arr[i],
        itemIdentityEquals: identityEquals,
        compare,
        plateauScan: true,
      });

      // upper bound for id=2 is after index 1 → index 2
      expect(result).toEqual({
        currentIndex: -1,
        insertionIndex: 2,
      });
    });
  });

  describe('corruption handling (getItemAt returns undefined during binary search)', () => {
    it('returns -1/-1 when mid item is undefined', () => {
      // length = 4 → first mid = 2
      const length = 4;

      const getItemAt = (index: number): number | undefined => {
        if (index === 2) return undefined; // corruption at mid
        return index; // arbitrary non-undefined value for others
      };

      const result = binarySearch<number>({
        needle: 10,
        length,
        getItemAt,
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
        plateauScan: true,
      });

      expect(result).toEqual({ currentIndex: -1, insertionIndex: -1 });
    });
  });

  describe('plateauScan scanning behavior around insertionIndex', () => {
    it('treats undefined during plateau scan as exhaustion of that side only', () => {
      // We make one index undefined, but ensure binary search never hits it.
      // length = 5 => first mid = 2. We'll set arr[2] so that compare(midItem, needle) > 0,
      // forcing hi = 2 and thus never touching index 4 in binary search.
      const backing: Array<number | undefined> = [10, 20, 30, 40, undefined];

      const getItemAt = (i: number) => backing[i];

      const needle = 5; // smaller than 30, so hi will move left on the first step

      const result = binarySearch<number>({
        needle,
        length: backing.length,
        getItemAt,
        itemIdentityEquals: numberIdentityEquals,
        compare: numberCompare,
        plateauScan: true,
      });

      // insertionIndex is correct for the sorted values [10,20,30,40]
      // first > 5 is 10 at index 0
      expect(result).toEqual({
        currentIndex: -1,
        insertionIndex: 0,
      });
    });
  });
});
