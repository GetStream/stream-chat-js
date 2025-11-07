import { describe, expect, it, vi } from 'vitest';
import {
  AscDesc,
  BasePaginator,
  DEFAULT_PAGINATION_OPTIONS,
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorCursor,
  type PaginatorOptions,
  PaginatorState,
  PrimitiveFilter,
  QueryFilter,
  QueryFilters,
  RequireOnlyOne,
} from '../../../src';
import { sleep } from '../../../src/utils';
import { makeComparator } from '../../../src/pagination/sortCompiler';
import { DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES } from '../../../src/constants';

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

type QueryShape = {
  filters: {
    [Key in keyof TestItem]:
      | RequireOnlyOne<QueryFilter<TestItem[Key]>>
      | PrimitiveFilter<TestItem[Key]>;
  };
  sort: { [Key in keyof TestItem]?: AscDesc };
};

class IncompletePaginator extends BasePaginator<TestItem, QueryShape> {
  sort: QueryFilters<TestItem> | undefined;
  sortComparator: (a: TestItem, b: TestItem) => number = vi.fn();
  queryResolve: Function = vi.fn();
  queryReject: Function = vi.fn();
  queryPromise: Promise<PaginationQueryReturnValue<TestItem>> | null = null;
  mockClientQuery = vi.fn();

  constructor(options: PaginatorOptions<TestItem, QueryShape> = {}) {
    super(options);
  }

  query(
    params: PaginationQueryParams<QueryShape>,
  ): Promise<PaginationQueryReturnValue<TestItem>> {
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

const defaultNextQueryShape: QueryShape = { filters: { id: 'test-id' }, sort: { id: 1 } };

class Paginator extends IncompletePaginator {
  constructor(options: PaginatorOptions<TestItem, QueryShape> = {}) {
    super(options);
  }

  getNextQueryShape = vi.fn().mockReturnValue(defaultNextQueryShape);
}

describe('BasePaginator', () => {
  describe('constructor', () => {
    it('initiates with the defaults', () => {
      const paginator = new Paginator();
      expect(paginator.state.getLatestValue()).toEqual({
        hasNext: true,
        hasPrev: true,
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        cursor: undefined,
        offset: 0,
      });
      expect(paginator.isInitialized).toBe(false);
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(0);
      expect(paginator.config.initialCursor).toBeUndefined();
      expect(paginator.config.initialOffset).toBeUndefined();
      expect(paginator.config.throwErrors).toBe(false);
      expect(paginator.pageSize).toBe(DEFAULT_PAGINATION_OPTIONS.pageSize);
      expect(paginator.config.debounceMs).toBe(DEFAULT_PAGINATION_OPTIONS.debounceMs);
      expect(paginator.config.lockItemOrder).toBe(
        DEFAULT_PAGINATION_OPTIONS.lockItemOrder,
      );
      expect(paginator.config.hasPaginationQueryShapeChanged).toBe(
        DEFAULT_PAGINATION_OPTIONS.hasPaginationQueryShapeChanged,
      );
    });

    it('initiates with custom options', () => {
      const options: PaginatorOptions<TestItem, QueryShape> = {
        debounceMs: DEFAULT_PAGINATION_OPTIONS.debounceMs - 100,
        doRequest: () => Promise.resolve({ items: [{ id: 'test-id' }] }),
        hasPaginationQueryShapeChanged: () => true,
        initialCursor: { next: 'next', prev: 'prev' },
        initialOffset: 10,
        lockItemOrder: !DEFAULT_PAGINATION_OPTIONS.lockItemOrder,
        pageSize: DEFAULT_PAGINATION_OPTIONS.pageSize - 1,
        throwErrors: true,
      };
      const paginator = new Paginator(options);
      expect(paginator.state.getLatestValue()).toEqual({
        hasNext: true,
        hasPrev: true,
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        cursor: options.initialCursor,
        offset: options.initialOffset,
      });
      expect(paginator.isInitialized).toBe(false);
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(0);
      expect(paginator.config.initialCursor).toStrictEqual(options.initialCursor);
      expect(paginator.config.initialOffset).toStrictEqual(options.initialOffset);
      expect(paginator.config.throwErrors).toBe(options.throwErrors);
      expect(paginator.pageSize).toBe(options.pageSize);
      expect(paginator.config.hasPaginationQueryShapeChanged).toStrictEqual(
        options.hasPaginationQueryShapeChanged,
      );
      expect(paginator.config.debounceMs).toBe(options.debounceMs);
      expect(paginator.config.lockItemOrder).toBe(options.lockItemOrder);
    });
  });

  describe('pagination API', () => {
    it('throws is the paginator does implement own getNextQueryShape', () => {
      const paginator = new IncompletePaginator();
      // @ts-expect-error accessing protected property
      expect(paginator.getNextQueryShape).toThrow(
        'Paginator.getNextQueryShape() is not implemented',
      );
    });

    describe('shouldResetStateBeforeQuery', () => {
      const stateBeforeQuery: PaginatorState<TestItem> = {
        hasNext: true,
        hasPrev: true,
        isLoading: false,
        items: [{ id: 'test-item' }],
        lastQueryError: undefined,
        cursor: { next: 'next', prev: 'prev' },
        offset: 10,
      };

      const prevQueryShape: QueryShape = { filters: { id: 'a' }, sort: { id: 1 } };
      const nextQueryShape: QueryShape = { filters: { id: 'b' }, sort: { id: 1 } };

      it('resets the state before a query when querying the first page', () => {
        const paginator = new Paginator();
        const initialState = { ...stateBeforeQuery, items: undefined };
        paginator.state.next(initialState);
        expect(paginator.state.getLatestValue()).toEqual(initialState);
        // @ts-expect-error accessing protected property
        expect(paginator.shouldResetStateBeforeQuery()).toBe(true);
      });

      it('resets the state before a query when query shape changed', () => {
        const prevQueryShape: QueryShape = { filters: { id: 'a' }, sort: { id: 1 } };
        const nextQueryShape: QueryShape = { filters: { id: 'b' }, sort: { id: 1 } };
        const paginator = new Paginator();
        expect(
          // @ts-expect-error accessing protected property
          paginator.shouldResetStateBeforeQuery(prevQueryShape, nextQueryShape),
        ).toBe(true);
        expect(
          // @ts-expect-error accessing protected property
          paginator.shouldResetStateBeforeQuery(prevQueryShape, prevQueryShape),
        ).toBe(false);
      });

      it('determines whether pagination state should be reset before a query using custom logic', () => {
        const options = {
          hasPaginationQueryShapeChanged: vi.fn().mockReturnValue(true),
        };
        const paginator = new Paginator(options);
        expect(
          // @ts-expect-error accessing protected property
          paginator.shouldResetStateBeforeQuery(prevQueryShape, nextQueryShape),
        ).toBe(true);
        expect(
          // @ts-expect-error accessing protected property
          paginator.shouldResetStateBeforeQuery(prevQueryShape, prevQueryShape),
        ).toBe(true);
        expect(options.hasPaginationQueryShapeChanged).toHaveBeenCalledTimes(2);
      });
    });

    it('paginates to next pages (cursor)', async () => {
      const paginator = new Paginator();
      let nextPromise = paginator.next();
      // wait for the DB data first page load
      await sleep(0);
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
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'next',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

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

    it('paginates to next pages (offset)', async () => {
      const paginator = new Paginator({ pageSize: 1 });
      let nextPromise = paginator.next();
      // wait for the DB data first page load
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);

      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'next',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      nextPromise = paginator.next();
      expect(paginator.isLoading).toBe(true);
      paginator.queryResolve({ items: [{ id: 'id2' }] });
      await nextPromise;
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(2);

      nextPromise = paginator.next();
      paginator.queryResolve({ items: [] });
      await nextPromise;
      expect(paginator.hasNext).toBe(false);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(2);

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
      // await first page load from the DB
      await toNextTick();
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
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'next',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      vi.useRealTimers();
    });

    it('paginates to a previous page', async () => {
      const paginator = new Paginator();
      let nextPromise = paginator.prev();
      await sleep(0);
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
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'prev',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

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
      await toNextTick();
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
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'prev',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });
      vi.useRealTimers();
    });

    it('prevents pagination if another query is in progress', async () => {
      const paginator = new Paginator();
      const nextPromise1 = paginator.next();
      // wait for the first page load from the DB
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(1);
      const nextPromise2 = paginator.next();
      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await Promise.all([nextPromise1, nextPromise2]);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(1);
    });

    it('resets the state if the query shape changed', async () => {
      const paginator = new Paginator({ pageSize: 1 });
      let nextPromise = paginator.next();
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);

      paginator.getNextQueryShape.mockReturnValueOnce({
        filters: { id: 'test' },
        sort: { id: -1 },
      });
      nextPromise = paginator.next();
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.items).toBeUndefined();
      expect(paginator.offset).toBe(0);
      paginator.queryResolve({ items: [{ id: 'id2' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.items).toEqual([{ id: 'id2' }]);
      expect(paginator.offset).toBe(1);
    });

    it('resets the state if forced', async () => {
      const paginator = new Paginator({ pageSize: 1 });
      let nextPromise = paginator.next();
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);

      nextPromise = paginator.next({ reset: 'yes' });
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.items).toBeUndefined();
      expect(paginator.offset).toBe(0);
      paginator.queryResolve({ items: [{ id: 'id2' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.items).toEqual([{ id: 'id2' }]);
      expect(paginator.offset).toBe(1);
    });

    it('does not reset the state if forced', async () => {
      const paginator = new Paginator({ pageSize: 1 });
      let nextPromise = paginator.next();
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasNext).toBe(true);
      expect(paginator.hasPrev).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);

      paginator.getNextQueryShape.mockReturnValueOnce({
        filters: { id: 'test' },
        sort: { id: -1 },
      });
      nextPromise = paginator.next({ reset: 'no' });
      await sleep(0);
      expect(paginator.items).toStrictEqual([{ id: 'id1' }]);
      expect(paginator.offset).toBe(1);
      paginator.queryResolve({ items: [{ id: 'id2' }] });
      await nextPromise;
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.offset).toBe(2);
    });

    it('stores lastQueryError and clears it with the next successful query', async () => {
      const paginator = new Paginator();
      let nextPromise = paginator.next();
      // wait for the first page load from DB
      await sleep(0);
      const error = new Error('Failed');
      paginator.queryReject(error);
      // hand over to finish the cleanup and state update after the query execution
      await sleep(0);
      expect(paginator.lastQueryError).toEqual(error);
      expect(paginator.isLoading).toEqual(false);

      nextPromise = paginator.next();
      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
    });

    it('throws error if enabled', async () => {
      const paginator = new Paginator({ throwErrors: true });
      let nextPromise = paginator.next();
      // wait for the first page load from DB
      await sleep(0);
      const error = new Error('Failed');
      paginator.queryReject(error);
      await expect(nextPromise).rejects.toThrowError(error);
      // hand over to finish the cleanup and state update after the query execution
      await sleep(0);
      expect(paginator.lastQueryError).toEqual(error);
      expect(paginator.isLoading).toEqual(false);

      nextPromise = paginator.next();
      // wait for the first page load from DB
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
    });

    it('retries the query', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator();
      let nextPromise = paginator.next({ retryCount: 2 });
      // wait for the first page load from DB
      await toNextTick();
      const error = new Error('Failed');
      paginator.queryReject(error);
      // hand over to finish the cleanup and state update after the query execution
      await toNextTick();
      expect(paginator.lastQueryError).toEqual(error);
      vi.advanceTimersByTime(DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES);
      await toNextTick();

      paginator.queryResolve({ items: [{ id: 'id1' }], next: 'next1', prev: 'prev1' });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ next: 'next1', prev: 'prev1' });
      vi.useRealTimers();
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
      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'exists but does not match the filter anymore removes the item %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder });
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
        },
      );

      it.each([
        [' adjusts the order on lockItemOrder: false', false],
        [' does not adjust the order on lockItemOrder: true', true],
      ])('exists and matches the filter updates the item and %s', (_, lockItemOrder) => {
        const paginator = new Paginator({ lockItemOrder });
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

        if (lockItemOrder) {
          expect(paginator.items).toStrictEqual([adjustedItem, item2, item3]);
        } else {
          expect(paginator.items).toStrictEqual([item2, item3, adjustedItem]);
        }
      });

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist and does not match the filter results in no action %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder });
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
          expect(paginator.items).toStrictEqual([item]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist and matches the filter inserts according to default sort order (append) %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder });
          paginator.state.partialNext({
            items: [item3, item],
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });

          expect(paginator.ingestItem(item2)).toBeTruthy();
          expect(paginator.items).toStrictEqual([item3, item, item2]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist and matches the filter inserts according to sort order %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder });
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
        },
      );

      it('reflects the boost priority on lockItemOrder: false for newly ingested items', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item2, item3, item]);
      });

      it('reflects the boost priority on lockItemOrder: false for existing items recently boosted', () => {
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
          ...item2,
          age: 103,
        };
        paginator.boost(item2.id);
        expect(paginator.ingestItem(adjustedItem)).toBeTruthy(); // item updated
        expect(paginator.items).toHaveLength(3);

        expect(paginator.items).toStrictEqual([adjustedItem, item, item3]);
      });

      it('does not reflect the boost priority on lockItemOrder: true', () => {
        const paginator = new Paginator({ lockItemOrder: true });
        paginator.state.partialNext({
          items: [item, item2, item3],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        paginator.sort = { age: 1 };

        const adjustedItem = {
          ...item2,
          age: 103,
        };
        paginator.boost(item2.id);
        expect(paginator.ingestItem(adjustedItem)).toBeTruthy(); // item updated
        expect(paginator.items).toHaveLength(3);

        expect(paginator.items).toStrictEqual([item, adjustedItem, item3]);
      });

      it('reflects the boost priority on lockItemOrder: true when ingesting a new item', () => {
        const paginator = new Paginator({ lockItemOrder: true });
        paginator.state.partialNext({
          items: [item3, item],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item2, item3, item]);
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

    describe('setItems', () => {
      it('overrides all the items in the state with provided value', () => {
        const paginator = new Paginator();
        const items1 = [{ id: 'test-item1' }];
        const items2 = [{ id: 'test-item2' }];
        paginator.setItems(items1);
        expect(paginator.items).toStrictEqual(items1);
        paginator.setItems(items2);
        expect(paginator.items).toStrictEqual(items2);
      });

      const items = [{ id: 'test-item1' }];
      const expectedStateEmissions = [
        {
          cursor: undefined,
          hasNext: true,
          hasPrev: true,
          isLoading: false,
          items: undefined,
          lastQueryError: undefined,
          offset: 0,
        },
        {
          cursor: undefined,
          hasNext: true,
          hasPrev: true,
          isLoading: false,
          items,
          lastQueryError: undefined,
          offset: 1,
        },
      ];

      it('emits state change as long as the items are not the same', () => {
        const paginator = new Paginator();
        const subscriptionHandler = vi.fn();
        const unsubscribe = paginator.state.subscribe(subscriptionHandler);
        expect(subscriptionHandler).toHaveBeenCalledTimes(1);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[0],
          undefined,
        );

        paginator.setItems(items);
        expect(paginator.items).toStrictEqual(items);
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[1],
          expectedStateEmissions[0],
        );

        // setting an object with the same reference
        paginator.setItems(items);
        expect(paginator.items).toStrictEqual(items);
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[1],
          expectedStateEmissions[0],
        );

        unsubscribe();
      });

      it('emits state change as long as the state factory returns objects with different reference', () => {
        const paginator = new Paginator();
        const subscriptionHandler = vi.fn();
        const unsubscribe = paginator.state.subscribe(subscriptionHandler);

        paginator.setItems(() => items);
        expect(paginator.items).toStrictEqual(items);
        // first call is on subscribe
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[1],
          expectedStateEmissions[0],
        );

        // setting an object with the same reference
        paginator.setItems(() => items);
        expect(paginator.items).toStrictEqual(items);
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[1],
          expectedStateEmissions[0],
        );

        unsubscribe();
      });

      it('updates the cursor if provided', () => {
        const paginator = new Paginator();
        const cursors: PaginatorCursor[] = [
          { next: 'next1', prev: 'prev1' },
          { next: 'next2', prev: 'prev1' },
        ];
        const subscriptionHandler = vi.fn();
        const unsubscribe = paginator.state.subscribe(subscriptionHandler);

        paginator.setItems(items, cursors[0]);
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          { ...expectedStateEmissions[1], cursor: cursors[0], offset: 0 },
          { ...expectedStateEmissions[0], cursor: undefined, offset: 0 },
        );

        unsubscribe();
      });
    });

    describe('reload', () => {
      it('starts the ended pagination from the beginning', async () => {
        const paginator = new Paginator({ pageSize: 2 });
        paginator.state.next({
          hasNext: false,
          hasPrev: false,
          isLoading: false,
          items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
          offset: 4,
        });
        let reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasNext).toBe(true);
        expect(paginator.hasPrev).toBe(true);

        paginator.queryResolve({ items: [{ id: 'id1' }] });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasNext).toBe(false);
        expect(paginator.hasPrev).toBe(true);
        expect(paginator.items).toEqual([{ id: 'id1' }]);
        expect(paginator.cursor).toBeUndefined();
        expect(paginator.offset).toBe(1);
        expect(paginator.mockClientQuery).toHaveBeenCalledWith({
          direction: 'next',
          queryShape: defaultNextQueryShape,
          reset: 'yes',
          retryCount: 0,
        });

        reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasNext).toBe(true);
        expect(paginator.hasPrev).toBe(true);

        paginator.queryResolve({ items: [{ id: 'id2' }], next: 'next2' });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasNext).toBe(true);
        expect(paginator.hasPrev).toBe(false);
        expect(paginator.items).toEqual([{ id: 'id2' }]);
        expect(paginator.cursor).toStrictEqual({ next: 'next2', prev: null });
        expect(paginator.offset).toBe(0);
        expect(paginator.mockClientQuery).toHaveBeenCalledWith({
          direction: 'next',
          queryShape: defaultNextQueryShape,
          reset: 'yes',
          retryCount: 0,
        });

        // reset in another direction
        reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasNext).toBe(true);
        expect(paginator.hasPrev).toBe(true);
        expect(paginator.items).toBe(undefined);

        paginator.queryResolve({ items: [{ id: 'id2' }], next: 'next2' });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasNext).toBe(true);
        expect(paginator.hasPrev).toBe(false);
        expect(paginator.items).toEqual([{ id: 'id2' }]);
        expect(paginator.cursor).toStrictEqual({ next: 'next2', prev: null });
        expect(paginator.offset).toBe(0);
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

    describe('item boosting', () => {
      const a = { id: 'a', age: 10, name: 'A' } as TestItem;
      const b = { id: 'b', age: 20, name: 'B' } as TestItem;
      const c = { id: 'c', age: 30, name: 'C' } as TestItem;

      const byIdAsc = (l: TestItem, r: TestItem) =>
        l.id < r.id ? -1 : l.id > r.id ? 1 : 0;

      describe('clearExpiredBoosts', () => {
        it('removes expired boosts and updates maxBoostSeq', () => {
          const paginator = new Paginator();
          // @ts-expect-error accessing protected property
          paginator.boosts.clear();
          const now = 1000000;

          paginator.boost('fresh', { until: now + 1000, seq: 1 });
          paginator.boost('stale', { until: now - 1, seq: 5 });

          // @ts-expect-error accessing protected method
          paginator.clearExpiredBoosts(now);

          // @ts-expect-error accessing protected property
          expect(Array.from(paginator.boosts.keys())).toEqual(['fresh']);
          expect(paginator.maxBoostSeq).toBe(1);
        });

        it('sets maxBoostSeq to 0 when no boosts remain', () => {
          const paginator = new Paginator();
          // two expired boosts at "now"
          paginator.boost('x', { until: 1000, seq: 1 });
          paginator.boost('y', { until: 1500, seq: 3 });

          // @ts-expect-error accessing protected method
          paginator.clearExpiredBoosts(10000);

          // @ts-expect-error accessing protected property
          expect(paginator.boosts.size).toBe(0);
          expect(paginator.maxBoostSeq).toBe(0);
        });
      });

      describe('boostComparator', () => {
        it('prioritizes boosted over non-boosted', () => {
          vi.useFakeTimers();
          const now = new Date('2025-01-01T00:00:00Z');
          vi.setSystemTime(now);

          const paginator = new Paginator();
          paginator.sortComparator = byIdAsc;

          // Boost only "a"
          paginator.boost('b', { ttlMs: 10000, seq: 0 });

          // @ts-expect-error: protected method
          expect(paginator.boostComparator(a, b)).toBe(1); // a after b
          // @ts-expect-error
          expect(paginator.boostComparator(b, a)).toBe(-1); // b stays before a

          // Let boost expire
          vi.setSystemTime(new Date(now.getTime() + 11000));
          // @ts-expect-error
          expect(paginator.boostComparator(a, b)).toBe(-1); // fallback to byIdAsc
          vi.useRealTimers();
        });

        it('when both boosted, higher seq comes first; ties fall back to sortComparator', () => {
          vi.useFakeTimers();
          const now = new Date('2025-01-01T00:00:00Z');
          vi.setSystemTime(now);

          const paginator = new Paginator();
          // Fallback comparator id asc
          paginator.sortComparator = byIdAsc;

          paginator.boost('a', { ttlMs: 60000, seq: 1 });
          paginator.boost('b', { ttlMs: 60000, seq: 3 });

          // b has higher seq → should come first → comparator(a,b) > 0
          // @ts-expect-error
          expect(paginator.boostComparator(a, b)).toBe(1);
          // reverse check
          // @ts-expect-error
          expect(paginator.boostComparator(b, a)).toBe(-1);

          // Equal seq → fall back to sortComparator (id asc => a before b)
          paginator.boost('a', { ttlMs: 60000, seq: 2 });
          paginator.boost('b', { ttlMs: 60000, seq: 2 });
          // @ts-expect-error
          expect(paginator.boostComparator(a, b)).toBe(-1);

          vi.useRealTimers();
        });

        it('ignores expired boosts automatically during comparison', () => {
          vi.useFakeTimers();
          const now = new Date('2025-01-01T00:00:00Z');
          vi.setSystemTime(now);

          const paginator = new Paginator();
          paginator.sortComparator = byIdAsc;

          paginator.boost('b', { ttlMs: 5000, seq: 10 });
          // Initially boosted
          // @ts-expect-error
          expect(paginator.boostComparator(a, b)).toBe(1);

          // Advance beyond TTL so boost is expired; comparator should fall back
          vi.setSystemTime(new Date(now.getTime() + 6000));
          // @ts-expect-error
          expect(paginator.boostComparator(a, b)).toBe(-1); // byIdAsc, not boost
          vi.useRealTimers();
        });
      });

      describe('boost', () => {
        it('assigns default TTL (15s) and default seq=0; updates maxBoostSeq only upward', () => {
          vi.useFakeTimers();
          const now = new Date('2025-01-01T00:00:00Z');
          vi.setSystemTime(now);

          const paginator = new Paginator();

          paginator.boost('k'); // default 15s, seq 0
          const b1 = paginator.getBoost('k')!;
          expect(b1.seq).toBe(0);
          expect(b1.until).toBe(now.getTime() + 15000);
          expect(paginator.maxBoostSeq).toBe(0);

          // Raise max seq
          paginator.boost('m', { ttlMs: 1000, seq: 5 });
          expect(paginator.maxBoostSeq).toBe(5);

          // Lower seq should NOT decrease maxBoostSeq
          paginator.boost('n', { ttlMs: 1000, seq: 2 });
          expect(paginator.maxBoostSeq).toBe(5);

          vi.useRealTimers();
        });

        it('accepts explicit until and seq', () => {
          const paginator = new Paginator();
          paginator.boost('z', { until: 42, seq: 7 });
          const b = paginator.getBoost('z')!;
          expect(b.until).toBe(42);
          expect(b.seq).toBe(7);
          expect(paginator.maxBoostSeq).toBe(7);
        });
      });

      describe('getBoost', () => {
        it('returns the boost record when present; otherwise undefined', () => {
          const paginator = new Paginator();
          expect(paginator.getBoost('missing')).toBeUndefined();
          paginator.boost('a', { ttlMs: 1000, seq: 1 });
          const b = paginator.getBoost('a');
          expect(b).toBeDefined();
          expect(b!.seq).toBe(1);
        });
      });

      describe('removeBoost', () => {
        it('removes a boost and recalculates maxBoostSeq', () => {
          const paginator = new Paginator();
          paginator.boost('a', { ttlMs: 60000, seq: 1 });
          paginator.boost('b', { ttlMs: 60000, seq: 5 });
          paginator.boost('c', { ttlMs: 60000, seq: 2 });
          expect(paginator.maxBoostSeq).toBe(5);

          paginator.removeBoost('b'); // remove current max
          expect(paginator.getBoost('b')).toBeUndefined();
          expect(paginator.maxBoostSeq).toBe(2);

          paginator.removeBoost('c');
          expect(paginator.getBoost('c')).toBeUndefined();
          expect(paginator.maxBoostSeq).toBe(1);

          paginator.removeBoost('a');
          expect(paginator.getBoost('a')).toBeUndefined();
          expect(paginator.maxBoostSeq).toBe(0);
        });
      });

      describe('isBoosted', () => {
        it('returns true when boost exists and now <= until; false otherwise', () => {
          vi.useFakeTimers();
          const now = new Date('2025-01-01T00:00:00Z');
          vi.setSystemTime(now);

          const paginator = new Paginator();
          expect(paginator.isBoosted('x')).toBe(false);

          paginator.boost('x', { ttlMs: 5000, seq: 0 });
          expect(paginator.isBoosted('x')).toBe(true);

          // Exactly at until is still considered boosted per <= check
          vi.setSystemTime(new Date(now.getTime() + 5000));
          expect(paginator.isBoosted('x')).toBe(true);

          // After until → false
          vi.setSystemTime(new Date(now.getTime() + 5001));
          expect(paginator.isBoosted('x')).toBe(false);

          vi.useRealTimers();
        });
      });

      describe('integration: ingestion respects boostComparator implicitly', () => {
        it('newly ingested boosted items float above non-boosted regardless of fallback sort', () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

          const paginator = new Paginator();
          paginator.sortComparator = makeComparator<
            TestItem,
            Partial<Record<keyof TestItem, AscDesc>>
          >({
            sort: { age: 1 }, // ascending age (so normally a < b < c by age)
          });
          paginator.state.partialNext({ items: [a, b] });

          // Boost "c" before ingest → it should be placed ahead of non-boosted even though age is highest
          paginator.boost('c', { ttlMs: 60000, seq: 1 });
          expect(paginator.ingestItem(c)).toBeTruthy();

          // c should be first due to boost, then a, then b (fallback sort would place c last otherwise)
          expect(paginator.items!.map((i) => i.id)).toEqual(['c', 'a', 'b']);

          vi.useRealTimers();
        });
      });
    });
  });
});
