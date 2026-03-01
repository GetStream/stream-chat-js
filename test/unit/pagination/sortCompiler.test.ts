// sortCompiler.spec.ts
import { describe, it, expect } from 'vitest';
import {
  binarySearchInsertIndex,
  makeComparator,
} from '../../../src/pagination/sortCompiler';
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

describe('binarySearchInsertIndex', () => {
  it('inserts at beginning, middle, and end as expected', () => {
    const items: Item[] = [
      { cid: 'a', v: 10 },
      { cid: 'b', v: 20 },
      { cid: 'c', v: 30 },
      { cid: 'd', v: 40 },
    ];
    const cmp = toComparator({ v: 1 });

    // Insert before all
    let index = binarySearchInsertIndex<Item>({
      sortedArray: items,
      needle: { cid: 'x', v: 5 },
      compare: cmp,
    });
    expect(index).toBe(0);

    // Insert in the middle
    index = binarySearchInsertIndex<Item>({
      sortedArray: items,
      needle: { cid: 'y', v: 25 },
      compare: cmp,
    });
    expect(index).toBe(2); // between 20 and 30

    // Insert after all
    index = binarySearchInsertIndex<Item>({
      sortedArray: items,
      needle: { cid: 'z', v: 50 },
      compare: cmp,
    });
    expect(index).toBe(4);
  });

  it('inserts after equal values block (stable position after equals)', () => {
    const items: Item[] = [
      { cid: 'a', v: 10 },
      { cid: 'b', v: 10 },
      { cid: 'c', v: 10 },
    ];
    const cmp = toComparator({ v: 1 });

    const index = binarySearchInsertIndex<Item>({
      sortedArray: items,
      needle: { cid: 'x', v: 10 },
      compare: cmp,
    });

    // By design, our binary search returns the first position where existing > needle.
    // For equals, it advances to the right of the equal block.
    expect(index).toBe(3);
  });

  it('respects multi-field comparator (e.g., secondary key decides insertion point)', () => {
    const items: Item[] = [
      { cid: '2', v: 1, nested: { x: 5 } },
      { cid: '1', v: 1, nested: { x: 10 } }, // comes earlier due to nested.x desc
      { cid: '3', v: 2, nested: { x: 0 } },
    ];
    const cmp = toComparator([{ v: 1 }, { 'nested.x': -1 }]);

    // Needle with same v=1 but nested.x=7 should go between cid=1 (x=10) and cid=2 (x=5)
    const index = binarySearchInsertIndex<Item>({
      sortedArray: orderByComparator(items, cmp).map(
        (cid) => items.find((i) => i.cid === cid)!,
      ) as Item[],
      needle: { cid: 'x', v: 1, nested: { x: 7 } },
      compare: cmp,
    });

    expect(index).toBe(1); // after the 10, before the 5
  });
});
