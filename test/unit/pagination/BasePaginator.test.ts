import { describe, expect, it, vi } from 'vitest';
import {
  AscDesc,
  BasePaginator,
  DEFAULT_PAGINATION_OPTIONS,
  PaginationQueryParams,
  PaginationQueryReturnValue,
  type PaginatorOptions,
  QueryFilters,
} from '../../../src';
import { sleep } from '../../../src/utils';
import { makeComparator } from '../../../src/pagination/sortCompiler';

const toNextTick = async () => {
  const sleepPromise = sleep(0);
  vi.advanceTimersByTime(0);
  await sleepPromise;
};

type TestItem = {
  id: string;
  name?: string;
  teams?: string[];
  blocked?: boolean;
  createdAt?: string; // date string
  age?: number;
};

class Paginator extends BasePaginator<TestItem> {
  sort: QueryFilters<TestItem> | undefined;
  sortComparator: (a: TestItem, b: TestItem) => number = vi.fn();
  queryResolve: Function = vi.fn();
  queryReject: Function = vi.fn();
  queryPromise: Promise<PaginationQueryReturnValue<TestItem>> | null = null;
  mockClientQuery = vi.fn();

  constructor(options: PaginatorOptions = {}) {
    super(options);
  }

  query(params: PaginationQueryParams): Promise<PaginationQueryReturnValue<TestItem>> {
    const promise = new Promise<PaginationQueryReturnValue<TestItem>>(
      (queryResolve, queryReject) => {
        this.queryResolve = queryResolve;
        this.queryReject = queryReject;
      },
    );
    this.mockClientQuery(params);
    this.queryPromise = promise;
    return promise;
  }

  filterQueryResults(items: TestItem[]): TestItem[] | Promise<TestItem[]> {
    return items;
  }
}

describe('BasePaginator', () => {
  describe('constructor', () => {
    it('initiates with the defaults', () => {
      const paginator = new Paginator();
      expect(paginator.pageSize).toBe(DEFAULT_PAGINATION_OPTIONS.pageSize);
      expect(paginator.state.getLatestValue()).toEqual({
        hasNext: true,
        hasPrev: true,
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        cursor: undefined,
        offset: 0,
      });
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(0);
    });

    it('initiates with custom options', () => {
      const paginator = new Paginator({ pageSize: 1 });
      expect(paginator.pageSize).not.toBe(DEFAULT_PAGINATION_OPTIONS.pageSize);
      expect(paginator.pageSize).toBe(1);
      expect(paginator.state.getLatestValue()).toEqual({
        hasNext: true,
        hasPrev: true,
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        cursor: undefined,
        offset: 0,
      });
    });
  });
  describe('pagination API', () => {
    it('paginates to next pages', async () => {
      const paginator = new Paginator();
      let nextPromise = paginator.next();
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);

      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({ direction: 'next' });

      nextPromise = paginator.next();
      expect(paginator.isLoading).toBe(true);
      paginator.queryResolve({ items: [{ id: 'id2' }], next: 'next2', prev: 'prev2' });
      await nextPromise;
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ next: 'next2', prev: 'prev2' });

      nextPromise = paginator.next();
      paginator.queryResolve({ items: [] });
      await nextPromise;
      expect(paginator.hasNext).toBe(false);
      expect(paginator.hasPrev).toBe(false);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ next: null, prev: null });

      paginator.next();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(3);
    });
    it('paginates to next pages debounced', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({ debounceMs: 2000 });

      paginator.nextDebounced();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);

      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await paginator.queryPromise;
      await toNextTick();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({ direction: 'next' });

      vi.useRealTimers();
    });

    it('paginates to a previous page', async () => {
      const paginator = new Paginator();
      let nextPromise = paginator.prev();
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);

      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({ direction: 'prev' });

      nextPromise = paginator.prev();
      expect(paginator.isLoading).toBe(true);
      paginator.queryResolve({ items: [{ id: 'id2' }], next: 'next2', prev: 'prev2' });
      await nextPromise;
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ next: 'next2', prev: 'prev2' });

      nextPromise = paginator.prev();
      paginator.queryResolve({ items: [] });
      await nextPromise;
      expect(paginator.hasNext).toBe(false);
      expect(paginator.hasPrev).toBe(false);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ next: null, prev: null });

      paginator.prev();
      expect(paginator.isLoading).toBe(false);
    });
    it('debounces the pagination to a previous page', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({ debounceMs: 2000 });

      paginator.prevDebounced();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);

      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await paginator.queryPromise;
      await toNextTick();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({ direction: 'prev' });
      vi.useRealTimers();
    });

    it('prevents pagination if another query is in progress', async () => {
      const paginator = new Paginator();
      const nextPromise1 = paginator.next();
      expect(paginator.isLoading).toBe(true);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(1);
      const nextPromise2 = paginator.next();
      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await Promise.all([nextPromise1, nextPromise2]);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(1);
    });

    it('stores lastQueryError and clears it with the next successful query', async () => {
      const paginator = new Paginator();
      let nextPromise = paginator.next();
      const error = new Error('Failed');
      paginator.queryReject(error);
      await nextPromise;
      expect(paginator.lastQueryError).toEqual(error);

      nextPromise = paginator.next();
      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
    });
  });
  describe('item management', () => {
    const item: TestItem = {
      id: 'id1',
      name: 'test',
      age: 100,
      teams: ['abc', 'efg'],
    };

    const item2 = {
      ...item,
      id: 'id2',
      name: 'test2',
      age: 101,
    };

    const item3 = {
      ...item,
      id: 'id3',
      name: 'test3',
      age: 102,
    };

    describe('matchesFilter', () => {
      it('returns true if no filter is provided', async () => {
        const paginator = new Paginator();
        expect(paginator.matchesFilter(item)).toBeTruthy();
      });
      it('returns false if does not match the filter', async () => {
        const paginator = new Paginator();
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          name: { $eq: 'test1' },
        });
        expect(paginator.matchesFilter(item)).toBeFalsy();
      });
      it('returns true if item matches the filter', async () => {
        const paginator = new Paginator();
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          $or: [{ name: { $eq: 'test1' } }, { teams: { $contains: 'abc' } }],
        });
        expect(paginator.matchesFilter(item)).toBeTruthy();
      });
    });

    describe('ingestItem', () => {
      it('exists but does not match the filter anymore removes the item', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item2, item],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $eq: ['abc', 'efg'] }, // required membership in these two teams
        });

        const adjustedItem = {
          ...item,
          teams: ['efg'], // removed from the team abc
        };

        expect(paginator.ingestItem(adjustedItem)).toBeTruthy(); // item removed
        expect(paginator.items).toHaveLength(2);
      });

      it('exists and matches the filter updates the item', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item, item2, item3],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        paginator.sort = { age: 1 };

        const adjustedItem = {
          ...item,
          age: 103,
        };

        expect(paginator.ingestItem(adjustedItem)).toBeTruthy(); // item updated
        expect(paginator.items).toHaveLength(3);
        expect(paginator.items![0]).toStrictEqual(item2);
        expect(paginator.items![1]).toStrictEqual(item3);
        expect(paginator.items![2]).toStrictEqual(adjustedItem);
      });

      it('does not exist and does not match the filter results in no action', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        const adjustedItem = {
          ...item,
          id: 'id2',
          name: 'test2',
        };

        expect(paginator.ingestItem(adjustedItem)).toBeFalsy(); // no action
        expect(paginator.items).toHaveLength(1);
        expect(paginator.items![0]).toStrictEqual(item);
      });

      it('does not exist and matches the filter inserts according to default sort order (append)', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toHaveLength(3);
        expect(paginator.items![0]).toStrictEqual(item3);
        expect(paginator.items![1]).toStrictEqual(item);
        expect(paginator.items![2]).toStrictEqual(item2);
      });

      it('does not exist and matches the filter inserts according to sort order', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toHaveLength(3);
        expect(paginator.items![0]).toStrictEqual(item3);
        expect(paginator.items![1]).toStrictEqual(item2);
        expect(paginator.items![2]).toStrictEqual(item);
      });
    });

    describe('removeItem', () => {
      it('removes existing item', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item2, item],
        });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        expect(paginator.removeItem({ item: item3 })).toBeTruthy();
        expect(paginator.items).toHaveLength(2);
        expect(paginator.items![0]).toStrictEqual(item2);
        expect(paginator.items![1]).toStrictEqual(item);
      });

      it('results in no action for non-existent item', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item2, item],
        });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        expect(paginator.removeItem({ item: item3 })).toBeFalsy();
        expect(paginator.items).toHaveLength(2);
        expect(paginator.items![0]).toStrictEqual(item2);
        expect(paginator.items![1]).toStrictEqual(item);
      });
    });

    describe('contains', () => {
      it('returns true if the item exists', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item2, item],
        });
        expect(paginator.contains(item3)).toBeTruthy();
      });

      it('returns false if the items does not exist', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item2, item],
        });
        expect(paginator.contains(item3)).toBeFalsy();
      });
    });

    describe('locateByItem', () => {
      const a: TestItem = { id: 'a', age: 30, name: 'A' };
      const b: TestItem = { id: 'b', age: 25, name: 'B' };
      const c: TestItem = { id: 'c', age: 25, name: 'C' };
      const d: TestItem = { id: 'd', age: 20, name: 'D' };

      const tieBreakerById = (l: TestItem, r: TestItem) =>
        l.id < r.id ? -1 : l.id > r.id ? 1 : 0;

      it('returns {index:-1, insertionIndex:0} for empty list', () => {
        const paginator = new Paginator();
        const res = paginator.locateByItem(a);
        expect(res).toEqual({ index: -1, insertionIndex: 0 });
      });

      it('finds an existing item on a tie plateau (no ID tiebreaker)', () => {
        const paginator = new Paginator();
        // comparator: age desc only (ties produce a plateau)
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        // items are already sorted by age desc
        paginator.state.partialNext({ items: [a, b, c, d] });

        const res = paginator.locateByItem(c);
        expect(res.index).toBe(2); // c is at index 2 in [a, b, c, d]
        // insertionIndex for identical key (age 25) is after the plateau
        expect(res.insertionIndex).toBe(3);
      });

      it('returns insertion index when not found on a tie plateau (no ID tiebreaker)', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        paginator.state.partialNext({ items: [a, b, c, d] });

        // same sort keys as b/c but different id; not present
        const x: TestItem = { id: 'x', age: 25, name: 'X' };
        const res = paginator.locateByItem(x);
        // insertion point should be after the 25-plateau (after c at index 2)
        expect(res.index).toBe(-1);
        expect(res.insertionIndex).toBe(3);
      });

      it('finds exact index with ID tiebreaker in comparator (pure O(log n))', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          // tie-breaker on id asc guarantees a total order
          tiebreaker: tieBreakerById,
        });

        // With tiebreaker, the order within age==25 is by id asc: b (id 'b'), then c (id 'c')
        paginator.state.partialNext({ items: [a, b, c, d] });

        const res = paginator.locateByItem(c);
        expect(res.index).toBe(2);
        // In this setting the insertionIndex is deterministic but not strictly needed when found
        expect(res.insertionIndex).toBeGreaterThanOrEqual(2);
      });

      it('computes insertion at the beginning when needle sorts before all items', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          tiebreaker: tieBreakerById,
        });
        paginator.state.partialNext({ items: [a, b, c, d] });

        const z: TestItem = { id: 'z', age: 40, name: 'Z' }; // highest age → goes to front
        const res = paginator.locateByItem(z);
        expect(res.index).toBe(-1);
        expect(res.insertionIndex).toBe(0);
      });

      it('computes insertion at the end when needle sorts after all items', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          tiebreaker: tieBreakerById,
        });
        paginator.state.partialNext({ items: [a, b, c, d] });

        const z: TestItem = { id: 'z', age: 10, name: 'Z' }; // lowest age → goes to end
        const res = paginator.locateByItem(z);
        expect(res.index).toBe(-1);
        expect(res.insertionIndex).toBe(4);
      });

      it('checks both immediate neighbors before plateau scan (fast path)', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        paginator.state.partialNext({ items: [a, b, c, d] });

        // needle equal to left neighbor of insertionIndex
        const resLeftNeighbor = paginator.locateByItem(c);
        expect(resLeftNeighbor.index).toBe(2);

        // needle equal to right neighbor (craft by duplicating c’s sort but different id not present)
        const y: TestItem = { id: 'y', age: 25, name: 'Y' };
        const resRightNeighbor = paginator.locateByItem(y);
        expect(resRightNeighbor.index).toBe(-1);
        expect(resRightNeighbor.insertionIndex).toBe(3);
      });
    });

    describe('findItem', () => {
      const a: TestItem = { id: 'a', age: 30 };
      const b: TestItem = { id: 'b', age: 25 };
      const c: TestItem = { id: 'c', age: 25 };
      const d: TestItem = { id: 'd', age: 20 };

      it('returns the exact item instance when present', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        paginator.state.partialNext({ items: [a, b, c, d] });

        // Same identity object:
        expect(paginator.findItem(c)).toBe(c);

        // Same identity by id but different object reference still matches by locateByItem:
        const cClone = { ...c };
        expect(paginator.findItem(cClone)).toBe(c);
      });

      it('returns undefined when not present', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        paginator.state.partialNext({ items: [a, b, d] });

        const needle: TestItem = { id: 'x', age: 25 };
        expect(paginator.findItem(needle)).toBeUndefined();
      });

      it('works with an ID tie-breaker comparator as well', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          tiebreaker: (l: TestItem, r: TestItem) =>
            l.id < r.id ? -1 : l.id > r.id ? 1 : 0,
        });
        paginator.state.partialNext({ items: [a, b, c, d] });

        expect(paginator.findItem(c)).toBe(c);
        const x: TestItem = { id: 'x', age: 25 };
        expect(paginator.findItem(x)).toBeUndefined();
      });

      it('handles empty list', () => {
        const paginator = new Paginator();
        expect(paginator.findItem({ id: 'z' })).toBeUndefined();
      });
    });

    describe('filter resolvers', () => {
      const resolvers1 = [{ matchesField: () => true, resolve: () => 'abc' }];
      const resolvers2 = [
        { matchesField: () => false, resolve: () => 'efg' },
        { matchesField: () => true, resolve: () => 'hij' },
      ];
      it('get overridden with setFilterResolvers', () => {
        const paginator = new Paginator();
        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toHaveLength(0);

        paginator.setFilterResolvers(resolvers1);

        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toHaveLength(resolvers1.length);
        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toStrictEqual(resolvers1);

        paginator.setFilterResolvers(resolvers2);

        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toHaveLength(resolvers2.length);
        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toStrictEqual(resolvers2);

        paginator.setFilterResolvers([]);
        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toHaveLength(0);
      });

      it('get expanded with addFilterResolvers', () => {
        const paginator = new Paginator();
        paginator.addFilterResolvers(resolvers1);

        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toStrictEqual(resolvers1);

        paginator.addFilterResolvers(resolvers2);

        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toStrictEqual([
          ...resolvers1,
          ...resolvers2,
        ]);

        paginator.addFilterResolvers([]);
        // @ts-expect-error accessing protected property
        expect(paginator._filterFieldToDataResolvers).toStrictEqual([
          ...resolvers1,
          ...resolvers2,
        ]);
      });
    });
  });
});
