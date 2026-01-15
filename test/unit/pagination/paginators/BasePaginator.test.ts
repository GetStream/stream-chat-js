import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AscDesc,
  BasePaginator,
  DEFAULT_PAGINATION_OPTIONS,
  ItemCoordinates,
  LOGICAL_HEAD_INTERVAL_ID,
  LOGICAL_TAIL_INTERVAL_ID,
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorCursor,
  type PaginatorOptions,
  PaginatorState,
  PrimitiveFilter,
  QueryFilter,
  QueryFilters,
  RequireOnlyOne,
  ZERO_PAGE_CURSOR,
} from '../../../../src';
import { sleep } from '../../../../src/utils';
import { makeComparator } from '../../../../src/pagination/sortCompiler';
import { DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES } from '../../../../src/constants';
import { ItemIndex } from '../../../../src/pagination/ItemIndex';

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
  // @ts-ignore
  sortComparator: (a: TestItem, b: TestItem) => number = vi.fn().mockReturnValue(0); // BasePaginator implementation
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

const itemIndex = new ItemIndex<TestItem>({ getId: ({ id }) => id });
const a: TestItem = { id: 'a', age: 30, name: 'A' };
const b: TestItem = { id: 'b', age: 25, name: 'B' };
const c: TestItem = { id: 'c', age: 25, name: 'C' };
const d: TestItem = { id: 'd', age: 20, name: 'D' };

const v: TestItem = { id: 'v', age: 10, name: 'V' };
const x: TestItem = { id: 'x', age: 5, name: 'x' };
const y: TestItem = { id: 'y', age: 4, name: 'Y' };
const z: TestItem = { id: 'z', age: 1, name: 'Z' };

describe('BasePaginator', () => {
  describe('constructor', () => {
    it('initiates with the defaults', () => {
      const paginator = new Paginator();
      expect(paginator.state.getLatestValue()).toEqual({
        hasMoreTail: true,
        hasMoreHead: true,
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
        initialCursor: { tailward: 'tailward', headward: 'headward' },
        initialOffset: 10,
        lockItemOrder: !DEFAULT_PAGINATION_OPTIONS.lockItemOrder,
        pageSize: DEFAULT_PAGINATION_OPTIONS.pageSize - 1,
        throwErrors: true,
      };
      const paginator = new Paginator(options);
      expect(paginator.state.getLatestValue()).toEqual({
        hasMoreTail: true,
        hasMoreHead: true,
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
        hasMoreTail: true,
        hasMoreHead: true,
        isLoading: false,
        items: [{ id: 'test-item' }],
        lastQueryError: undefined,
        cursor: { tailward: 'tailward', headward: 'headward' },
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
      const paginator = new Paginator({ initialCursor: ZERO_PAGE_CURSOR });
      let nextPromise = paginator.toTail();
      // wait for the DB data first page load
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);

      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'tailward',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      nextPromise = paginator.toTail();
      expect(paginator.isLoading).toBe(true);
      paginator.queryResolve({
        items: [{ id: 'id2' }],
        tailward: 'next2',
        headward: 'prev2',
      });
      await nextPromise;
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next2', headward: 'prev2' });

      nextPromise = paginator.toTail();
      paginator.queryResolve({ items: [] });
      await nextPromise;
      expect(paginator.hasMoreTail).toBe(false);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ tailward: null, headward: null });

      paginator.toTail();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(3);
    });

    it('paginates to next pages (offset)', async () => {
      const paginator = new Paginator({ pageSize: 1 });
      let nextPromise = paginator.toTail();
      // wait for the DB data first page load
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);

      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'tailward',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      nextPromise = paginator.toTail();
      expect(paginator.isLoading).toBe(true);
      paginator.queryResolve({ items: [{ id: 'id2' }] });
      await nextPromise;
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(2);

      nextPromise = paginator.toTail();
      paginator.queryResolve({ items: [] });
      await nextPromise;
      expect(paginator.hasMoreTail).toBe(false);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(2);

      paginator.toTail();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(3);
    });

    it('paginates to next pages debounced (cursor)', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({
        debounceMs: 2000,
        initialCursor: ZERO_PAGE_CURSOR,
        pageSize: 1,
      });

      paginator.toTailDebounced();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      vi.advanceTimersByTime(2000);
      // await first page load from the DB
      await toNextTick();
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);

      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await paginator.queryPromise;
      await toNextTick();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'tailward',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      vi.useRealTimers();
    });

    it('paginates to next pages debounced (offset)', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({ debounceMs: 2000, pageSize: 1 });

      paginator.toTailDebounced();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      vi.advanceTimersByTime(2000);
      // await first page load from the DB
      await toNextTick();
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);

      paginator.queryResolve({
        items: [{ id: 'id1' }],
      });
      await paginator.queryPromise;
      await toNextTick();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'tailward',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      vi.useRealTimers();
    });

    it('paginates to a previous page (cursor only)', async () => {
      const paginator = new Paginator({ initialCursor: ZERO_PAGE_CURSOR });
      let nextPromise = paginator.toHead();
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);

      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'headward',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });

      nextPromise = paginator.toHead();
      expect(paginator.isLoading).toBe(true);
      paginator.queryResolve({
        items: [{ id: 'id2' }],
        tailward: 'next2',
        headward: 'prev2',
      });
      await nextPromise;
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next2', headward: 'prev2' });

      nextPromise = paginator.toHead();
      paginator.queryResolve({ items: [] });
      await nextPromise;
      expect(paginator.hasMoreTail).toBe(false);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.cursor).toEqual({ tailward: null, headward: null });

      paginator.toHead();
      expect(paginator.isLoading).toBe(false);
    });

    it('debounces the pagination to a previous page (cursor only)', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({
        debounceMs: 2000,
        initialCursor: ZERO_PAGE_CURSOR,
      });

      paginator.toHeadDebounced();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      vi.advanceTimersByTime(2000);
      await toNextTick();
      expect(paginator.isLoading).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);

      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await paginator.queryPromise;
      await toNextTick();
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'headward',
        queryShape: defaultNextQueryShape,
        reset: undefined,
        retryCount: 0,
      });
      vi.useRealTimers();
    });

    it('cancelScheduledQuery cancels a pending debounced query', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({ debounceMs: 2000 });

      paginator.toTailDebounced();
      paginator.cancelScheduledQuery();

      vi.advanceTimersByTime(2000);
      await toNextTick();

      expect(paginator.isLoading).toBe(false);
      expect(paginator.mockClientQuery).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('prevents pagination if another query is in progress', async () => {
      const paginator = new Paginator();
      const nextPromise1 = paginator.toTail();
      // wait for the first page load from the DB
      await sleep(0);
      expect(paginator.isLoading).toBe(true);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(1);
      const nextPromise2 = paginator.toTail();
      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await Promise.all([nextPromise1, nextPromise2]);
      expect(paginator.mockClientQuery).toHaveBeenCalledTimes(1);
    });

    it('resets the state if the query shape changed', async () => {
      const paginator = new Paginator({ pageSize: 1 });
      let nextPromise = paginator.toTail();
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);

      paginator.getNextQueryShape.mockReturnValueOnce({
        filters: { id: 'test' },
        sort: { id: -1 },
      });
      nextPromise = paginator.toTail();
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
      let nextPromise = paginator.toTail();
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);

      nextPromise = paginator.toTail({ reset: 'yes' });
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
      let nextPromise = paginator.toTail();
      await sleep(0);
      paginator.queryResolve({ items: [{ id: 'id1' }] });
      await nextPromise;
      expect(paginator.isLoading).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toBeUndefined();
      expect(paginator.offset).toBe(1);

      paginator.getNextQueryShape.mockReturnValueOnce({
        filters: { id: 'test' },
        sort: { id: -1 },
      });
      nextPromise = paginator.toTail({ reset: 'no' });
      await sleep(0);
      expect(paginator.items).toStrictEqual([{ id: 'id1' }]);
      expect(paginator.offset).toBe(1);
      paginator.queryResolve({ items: [{ id: 'id2' }] });
      await nextPromise;
      expect(paginator.items).toEqual([{ id: 'id1' }, { id: 'id2' }]);
      expect(paginator.offset).toBe(2);
    });

    it('stores lastQueryError and clears it with the next successful query', async () => {
      const paginator = new Paginator({ initialCursor: ZERO_PAGE_CURSOR });
      let nextPromise = paginator.toTail();
      // wait for the first page load from DB
      await sleep(0);
      const error = new Error('Failed');
      paginator.queryReject(error);
      // hand over to finish the cleanup and state update after the query execution
      await sleep(0);
      expect(paginator.lastQueryError).toEqual(error);
      expect(paginator.isLoading).toEqual(false);

      nextPromise = paginator.toTail();
      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
    });

    it('throws error if enabled', async () => {
      const paginator = new Paginator({
        initialCursor: ZERO_PAGE_CURSOR,
        throwErrors: true,
      });
      let nextPromise = paginator.toTail();
      // wait for the first page load from DB
      await sleep(0);
      const error = new Error('Failed');
      paginator.queryReject(error);
      await expect(nextPromise).rejects.toThrowError(error);
      // hand over to finish the cleanup and state update after the query execution
      await sleep(0);
      expect(paginator.lastQueryError).toEqual(error);
      expect(paginator.isLoading).toEqual(false);

      nextPromise = paginator.toTail();
      // wait for the first page load from DB
      await sleep(0);
      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
    });

    it('retries the query', async () => {
      vi.useFakeTimers();
      const paginator = new Paginator({ initialCursor: ZERO_PAGE_CURSOR });
      let nextPromise = paginator.toTail({ retryCount: 2 });
      // wait for the first page load from DB
      await toNextTick();
      const error = new Error('Failed');
      paginator.queryReject(error);
      // hand over to finish the cleanup and state update after the query execution
      await toNextTick();
      expect(paginator.lastQueryError).toEqual(error);
      vi.advanceTimersByTime(DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES);
      await toNextTick();

      paginator.queryResolve({
        items: [{ id: 'id1' }],
        tailward: 'next1',
        headward: 'prev1',
      });
      await nextPromise;
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toEqual([{ id: 'id1' }]);
      expect(paginator.cursor).toEqual({ tailward: 'next1', headward: 'prev1' });
      vi.useRealTimers();
    });

    it('executeQuery uses explicit queryShape and does not call getNextQueryShape', async () => {
      const paginator = new Paginator();
      const forcedShape: QueryShape = {
        filters: { id: 'forced' },
        sort: { id: -1 },
      };

      const promise = paginator.executeQuery({
        direction: 'tailward',
        queryShape: forcedShape,
      });

      await sleep(0);
      paginator.queryResolve({ items: [] });
      await promise;

      expect(paginator.getNextQueryShape).not.toHaveBeenCalled();
      expect(paginator.mockClientQuery).toHaveBeenCalledWith({
        direction: 'tailward',
        queryShape: forcedShape,
        reset: undefined,
        retryCount: 0,
      });
    });

    it.todo(
      'prevents setting active interval and emitting new state whe updateState === false',
      () => {},
    );
  });

  describe('item management', () => {
    const item1: TestItem = {
      id: 'id1',
      name: 'test',
      age: 100,
      teams: ['abc', 'efg'],
    };

    const item2 = {
      ...item1,
      id: 'id2',
      name: 'test2',
      age: 101,
    };

    const item3 = {
      ...item1,
      id: 'id3',
      name: 'test3',
      age: 102,
    };

    it('hasResults reflects whether items have been set', () => {
      const paginator = new Paginator();
      expect(paginator.hasResults).toBe(false);

      paginator.state.partialNext({ items: [] });
      expect(paginator.hasResults).toBe(true);

      paginator.resetState();
      expect(paginator.hasResults).toBe(false);
    });

    describe('matchesFilter', () => {
      it('returns true if no filter is provided', async () => {
        const paginator = new Paginator();
        expect(paginator.matchesFilter(item1)).toBeTruthy();
      });
      it('returns false if does not match the filter', async () => {
        const paginator = new Paginator();
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          name: { $eq: 'test1' },
        });
        expect(paginator.matchesFilter(item1)).toBeFalsy();
      });
      it('returns true if item matches the filter', async () => {
        const paginator = new Paginator();
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          $or: [{ name: { $eq: 'test1' } }, { teams: { $contains: 'abc' } }],
        });
        expect(paginator.matchesFilter(item1)).toBeTruthy();
      });
    });

    describe('locateByItem', () => {
      afterEach(() => itemIndex.clear());

      const tieBreakerById = (l: TestItem, r: TestItem) =>
        l.id < r.id ? -1 : l.id > r.id ? 1 : 0;

      it('returns -1 for empty list', () => {
        const paginator = new Paginator();
        const res = paginator.locateByItem(a);
        expect(res).toEqual({
          state: { currentIndex: -1, insertionIndex: 0 },
        } as ItemCoordinates);
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

        const location = paginator.locateByItem(c);
        // c is at index 2 in [a, b, c, d]
        // insertionIndex for identical key (age 25) is after the plateau
        expect(location).toStrictEqual({
          state: { currentIndex: 2, insertionIndex: 3 },
        });
      });

      it('finds an existing item on a tie plateau (no ID tiebreaker) with itemIndex', () => {
        const paginator = new Paginator({ itemIndex });
        // comparator: age desc only (ties produce a plateau)
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        // items are already sorted by age desc
        paginator.ingestPage({ page: [a, b, c, d], setActive: true });

        const location = paginator.locateByItem(c);
        expect(location).toStrictEqual({
          state: { currentIndex: 2, insertionIndex: 3 },
          interval: {
            currentIndex: 2,
            insertionIndex: 3,
            interval: {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['a', 'b', 'c', 'd'],
            },
          },
        });
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
        const { state } = paginator.locateByItem(x);
        // insertion point should be after the 25-plateau (after c at index 2)
        expect(state?.currentIndex).toBe(-1);
        expect(state?.insertionIndex).toBe(3);
      });

      it('returns insertion index when not found on a tie plateau (no ID tiebreaker) with itemIndex', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        paginator.ingestPage({ page: [a, b, c, d], setActive: true });

        // same sort keys as b/c but different id; not present
        const x: TestItem = { id: 'x', age: 25, name: 'X' };
        const location = paginator.locateByItem(x);
        // insertion point should be after the 25-plateau (after c at index 2)
        expect(location).toStrictEqual({
          state: { currentIndex: -1, insertionIndex: 3 },
          interval: {
            currentIndex: -1,
            insertionIndex: 3,
            interval: {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['a', 'b', 'c', 'd'],
            },
          },
        });
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

        const { state } = paginator.locateByItem(c);
        expect(state?.currentIndex).toBe(2);
        // In this setting the insertionIndex is deterministic but not strictly needed when found
        expect(state?.insertionIndex).toBe(3);
      });

      it('finds exact index with ID tiebreaker in comparator (pure O(log n)) with itemIndex', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          // tie-breaker on id asc guarantees a total order
          tiebreaker: tieBreakerById,
        });

        // With tiebreaker, the order within age==25 is by id asc: b (id 'b'), then c (id 'c')
        paginator.ingestPage({ page: [a, b, c, d], setActive: true });
        const location = paginator.locateByItem(c);
        expect(location).toStrictEqual({
          state: { currentIndex: 2, insertionIndex: 3 },
          interval: {
            currentIndex: 2,
            insertionIndex: 3,
            interval: {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['a', 'b', 'c', 'd'],
            },
          },
        });
      });

      it('computes insertion for state at the beginning when needle sorts before all items', () => {
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
        const { state } = paginator.locateByItem(z);
        expect(state?.currentIndex).toBe(-1);
        expect(state?.insertionIndex).toBe(0);
      });

      it('computes insertion for state at the beginning when needle sorts before all items with itemIndex', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          tiebreaker: tieBreakerById,
        });
        paginator.ingestPage({ page: [a, b, c, d], setActive: true });

        const z: TestItem = { id: 'z', age: 40, name: 'Z' }; // highest age → goes to front
        const location = paginator.locateByItem(z);
        // interval does not exist so it is not included in the search result
        expect(location).toStrictEqual({
          state: { currentIndex: -1, insertionIndex: 0 },
        });
      });

      it('computes insertion for state at the end when needle sorts after all items', () => {
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
        const { state } = paginator.locateByItem(z);
        expect(state?.currentIndex).toBe(-1);
        expect(state?.insertionIndex).toBe(4);
      });

      it('computes insertion for state at the end when needle sorts after all items with item index', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          tiebreaker: tieBreakerById,
        });
        paginator.ingestPage({ page: [a, b, c, d], setActive: true });

        const z: TestItem = { id: 'z', age: 10, name: 'Z' }; // lowest age → goes to end
        const location = paginator.locateByItem(z);
        // interval does not exist so it is not included in the search result
        expect(location).toStrictEqual({
          state: { currentIndex: -1, insertionIndex: 4 },
        });
      });

      it('locates the correct interval when multiple intervals exist', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
          tiebreaker: tieBreakerById,
        });
        paginator.ingestPage({ page: [a, b, c, d], setActive: true });
        paginator.ingestPage({ page: [v, x, y, z], setActive: true });

        const location = paginator.locateByItem(z);
        // interval does not exist so it is not included in the search result
        expect(location).toStrictEqual({
          state: { currentIndex: 3, insertionIndex: 4 },
          interval: {
            interval: {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['v', 'x', 'y', 'z'],
            },
            currentIndex: 3,
            insertionIndex: 4,
          },
        });
      });
    });

    describe('ingestPage', () => {
      let paginator: Paginator;
      beforeEach(() => {
        paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
      });

      it('postQueryReconcile treats jump query as non-directional (direction undefined)', async () => {
        class JumpAwarePaginator extends Paginator {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          isJumpQueryShape(_queryShape: QueryShape): boolean {
            return true;
          }
        }

        const jumpPaginator = new JumpAwarePaginator({ itemIndex });
        jumpPaginator.sortComparator = paginator.sortComparator;

        const ingestSpy = vi.spyOn(jumpPaginator, 'ingestPage');

        await jumpPaginator.postQueryReconcile({
          direction: undefined,
          isFirstPage: true,
          queryShape: defaultNextQueryShape,
          requestedPageSize: 10,
          results: { items: [a] },
          updateState: false,
        });

        expect(ingestSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            policy: 'strict-overlap-only',
            isHead: undefined,
            isTail: undefined,
            targetIntervalId: undefined,
          }),
        );
      });

      it('sorts items according to effectiveSortComparator', () => {
        paginator.ingestPage({ page: [c, a, b, d, b, c, a], setActive: true });
        // sorts by age, not id
        expect(paginator.items).toStrictEqual([a, a, c, b, b, c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a', 'a', 'c', 'b', 'b', 'c', 'd'],
          },
        ]);
      });

      it('sets items in intervals only', () => {
        paginator.ingestPage({ page: [c, a, b, d, b, c, a] });
        expect(paginator.items).toBeUndefined();
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a', 'a', 'c', 'b', 'b', 'c', 'd'],
          },
        ]);
      });

      it('ingests into the anchored head interval', () => {
        paginator.ingestPage({ page: [c, d], isHead: true, setActive: true });
        expect(paginator.items).toStrictEqual([c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: false,
            hasMoreTail: true,
            isHead: true,
            isTail: false,
            itemIds: ['c', 'd'],
          },
        ]);

        paginator.ingestPage({ page: [a] });
        // ingestPage without setActive does not emit state.items
        expect(paginator.items).toStrictEqual([c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: false,
            hasMoreTail: true,
            isHead: true,
            isTail: false,
            itemIds: ['a', 'c', 'd'],
          },
        ]);
      });

      it('does not force-merge into head interval under strict-overlap-only policy', () => {
        paginator.ingestPage({ page: [c, d], isHead: true, setActive: true });

        // Under default ('auto') policy, ingesting [a] would be merged into the head interval
        // even though the sort bounds do not overlap.
        paginator.ingestPage({ page: [a], policy: 'strict-overlap-only' });

        // @ts-expect-error accessing protected property _itemIntervals
        const intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toHaveLength(2);

        const headInterval = intervals.find(
          (itv) => 'isHead' in itv && (itv as { isHead: boolean }).isHead,
        );
        expect(headInterval).toBeTruthy();
        expect(headInterval).toMatchObject({
          isHead: true,
          isTail: false,
          itemIds: ['c', 'd'],
        });

        const otherInterval = intervals.find(
          (itv) => !('isHead' in itv) || !(itv as { isHead: boolean }).isHead,
        );
        expect(otherInterval).toBeTruthy();
        expect(otherInterval).toMatchObject({
          isHead: false,
          isTail: false,
          itemIds: ['a'],
        });
      });

      it('merges intervals when they strictly overlap under strict-overlap-only policy', () => {
        paginator.ingestPage({ page: [b, c], setActive: true });
        paginator.ingestPage({ page: [c, d], policy: 'strict-overlap-only' });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['b', 'c', 'd'],
          },
        ]);
      });

      it('prepends and appends a page', () => {
        paginator.ingestPage({ page: [b, c], setActive: true });
        expect(paginator.items).toStrictEqual([b, c]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['b', 'c'],
          },
        ]);

        paginator.ingestPage({ page: [a] });
        expect(paginator.items).toStrictEqual([b, c]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(2);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['b', 'c'],
          },
        ]);

        paginator.ingestPage({ page: [d] });
        expect(paginator.items).toStrictEqual([b, c]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(3);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['b', 'c'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['d'],
          },
        ]);
      });

      it('ingests into the anchored tail interval', () => {
        paginator.ingestPage({ page: [b, c], isTail: true, setActive: true });
        expect(paginator.items).toStrictEqual([b, c]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: false,
            isHead: false,
            isTail: true,
            itemIds: ['b', 'c'],
          },
        ]);

        paginator.ingestPage({ page: [d] });
        // ingestPage without setActive does not emit state.items
        expect(paginator.items).toStrictEqual([b, c]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: false,
            isHead: false,
            isTail: true,
            itemIds: ['b', 'c', 'd'],
          },
        ]);
      });

      it('merges all the overlapping anchored intervals, parts of logical intervals with target interval', () => {
        let keys: string[] = [];
        paginator.ingestPage({ page: [c, d], setActive: true });
        paginator.ingestPage({ page: [b] });
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'], // b.age === c.age => merged
          },
        ]);
        // @ts-expect-error accessing protected property _itemIntervals
        keys = Array.from(paginator._itemIntervals.keys());

        paginator.ingestItem(a); // leads to creation of logical head
        // ingestItem does not emit into state.items if active interval isn't affected
        expect(paginator.items).toStrictEqual([c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['a'],
          },
          {
            id: keys[0],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'],
          },
        ]);

        // @ts-expect-error accessing protected property _itemIntervals
        keys = Array.from(paginator._itemIntervals.keys());

        paginator.ingestItem(z); // leads to creation of logical tail
        expect(paginator.items).toStrictEqual([c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(3);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['a'],
          },
          {
            id: keys[1],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['z'],
          },
        ]);

        // @ts-expect-error accessing protected property _itemIntervals
        keys = Array.from(paginator._itemIntervals.keys());

        paginator.ingestPage({ page: [x] });
        expect(paginator.items).toStrictEqual([c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(4);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['a'],
          },
          {
            id: keys[1],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'],
          },
          {
            id: expect.any(String), // new interval with new id
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['x'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['z'],
          },
        ]);
        // @ts-expect-error accessing protected property _itemIntervals
        keys = Array.from(paginator._itemIntervals.keys());

        paginator.ingestPage({ page: [y], targetIntervalId: keys[2] });
        expect(paginator.items).toStrictEqual([c, d]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(4);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['a'],
          },
          {
            id: keys[1],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'],
          },
          {
            id: keys[2],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['x', 'y'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['z'],
          },
        ]);

        // @ts-expect-error accessing protected property _itemIntervals
        keys = Array.from(paginator._itemIntervals.keys());
        const previousAnchoredPageId = keys[1];

        paginator.ingestPage({ page: [a, b, z] });
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(1);
        // @ts-expect-error accessing protected property _itemIntervals
        const currentAnchoredPageId = Array.from(paginator._itemIntervals.keys())[0];
        expect(previousAnchoredPageId).toBe(currentAnchoredPageId);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: currentAnchoredPageId,
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            // original interval (containing 'c') served as a base, therefore 'b' is merged after 'c'
            itemIds: ['a', 'c', 'b', 'd', 'x', 'y', 'z'],
          },
        ]);
      });

      it('marks head and tail anchored intervals and removes existing logical intervals', () => {
        paginator.ingestItem(b);
        paginator.ingestPage({ page: [d] });
        paginator.ingestItem(y);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['b'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['d'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['y'],
          },
        ]);

        paginator.ingestPage({ page: [a], isHead: true });
        paginator.ingestPage({ page: [z], isTail: true });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: false,
            hasMoreTail: true,
            isHead: true,
            isTail: false,
            itemIds: ['a'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['b'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['d'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['y'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: false,
            isHead: false,
            isTail: true,
            itemIds: ['z'],
          },
        ]);
      });

      it('merges incomplete head intervals with existing logical intervals and sorts their items', () => {
        paginator.ingestItem(a); // logical head
        paginator.ingestPage({ page: [d] }); // anchored interval
        paginator.ingestItem(y); // logical tail

        paginator.ingestPage({ page: [c], isHead: true });
        paginator.ingestPage({ page: [x], isTail: true });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: false,
            hasMoreTail: true,
            isHead: true,
            isTail: false,
            itemIds: ['a', 'c'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['d'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: false,
            isHead: false,
            isTail: true,
            itemIds: ['x', 'y'],
          },
        ]);
      });

      it('ignores targetInterval if it is a logical interval', () => {
        paginator.ingestItem(a); // logical head
        paginator.ingestPage({ page: [c, d] }); // anchored interval
        paginator.ingestPage({ page: [b], targetIntervalId: LOGICAL_HEAD_INTERVAL_ID });
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['a'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'], // according to sort c === b and thus b is inserted at the next free slot
          },
        ]);

        paginator.ingestPage({ page: [x], targetIntervalId: LOGICAL_HEAD_INTERVAL_ID });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: ['a'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['c', 'b', 'd'],
          },
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['x'],
          },
        ]);
      });

      it('merges to target interval within the neighbour interval bounds (does not overlap with neighbours) - paginator.toTail()', () => {
        paginator.ingestPage({ page: [a, b] });
        paginator.ingestPage({ page: [x, y] });
        // @ts-expect-error accessing protected property _itemIntervals
        const keys = Array.from(paginator._itemIntervals.keys());
        paginator.ingestPage({ page: [c, d], targetIntervalId: keys[0] });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: keys[0],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a', 'b', 'c', 'd'],
          },
          {
            id: keys[1],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['x', 'y'],
          },
        ]);
      });

      it('uses anchored target interval as base even if non-overlapping', () => {
        paginator.ingestPage({ page: [a] });
        paginator.ingestPage({ page: [b, d] });
        // @ts-expect-error accessing protected property _itemIntervals
        const keys = Array.from(paginator._itemIntervals.keys());
        paginator.ingestPage({ page: [c], targetIntervalId: keys[0] });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: keys[0],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a', 'b', 'c', 'd'],
          },
        ]);
      });

      it('merges page into anchored target interval even if disjoint', () => {
        paginator.ingestPage({ page: [a] });
        paginator.ingestPage({ page: [b, d] });
        // @ts-expect-error accessing protected property _itemIntervals
        let keys = Array.from(paginator._itemIntervals.keys());
        paginator.ingestPage({ page: [x], targetIntervalId: keys[0] });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: keys[0],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['a', 'x'],
          },
          {
            id: keys[1],
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['b', 'd'],
          },
        ]);

        paginator.resetState();
        paginator.ingestPage({ page: [a] });
        paginator.ingestPage({ page: [d] });
        paginator.ingestPage({ page: [x] });
        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(3);

        // @ts-expect-error accessing protected property _itemIntervals
        keys = Array.from(paginator._itemIntervals.keys());
        // ingesting into the interval with x will merge b into x
        paginator.ingestPage({ page: [b], targetIntervalId: keys[2] });

        // @ts-expect-error accessing protected property _itemIntervals
        expect(paginator._itemIntervals.size).toBe(3);
        // @ts-expect-error accessing protected property _itemIntervals
        const values = Array.from(paginator._itemIntervals.values());
        expect(values).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: keys[0],
              isHead: false,
              isTail: false,
              itemIds: ['a'],
            }),
            expect.objectContaining({
              isHead: false,
              isTail: false,
              itemIds: ['d'],
            }),
            expect.objectContaining({
              id: keys[2],
              isHead: false,
              isTail: false,
              itemIds: ['b', 'x'],
            }),
          ]),
        );
      });

      it('does not ingest if itemIndex is not available', () => {
        paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        expect(paginator.items).toBeUndefined();
        paginator.ingestPage({ page: [a] });
        expect(paginator.items).toBeUndefined();
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([]);
      });

      it('does not ingest if page has no items', () => {
        paginator.ingestPage({ page: [] });
        expect(paginator.items).toBeUndefined();
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([]);
      });
    });

    describe('ingestItem to state only', () => {
      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'item exists but does not match the filter anymore removes the item %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder });

          paginator.state.partialNext({
            items: [item3, item2, item1],
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $eq: ['abc', 'efg'] }, // required membership in these two teams
          });

          const adjustedItem = {
            ...item1,
            teams: ['efg'], // removed from the team abc
          };

          expect(paginator.ingestItem(adjustedItem)).toBeTruthy(); // item removed
          expect(paginator.items).toStrictEqual([item3, item2]);
        },
      );

      it.each([
        [' adjusts the order on lockItemOrder: false', false],
        [' does not adjust the order on lockItemOrder: true', true],
      ])('exists and matches the filter updates the item and %s', (_, lockItemOrder) => {
        const paginator = new Paginator({ lockItemOrder });
        paginator.state.partialNext({
          items: [item1, item2, item3],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        const adjustedItem1 = {
          ...item1,
          age: 103,
        };

        expect(paginator.ingestItem(adjustedItem1)).toBeTruthy(); // item updated

        if (lockItemOrder) {
          expect(paginator.items).toStrictEqual([adjustedItem1, item2, item3]);
        } else {
          expect(paginator.items).toStrictEqual([item2, item3, adjustedItem1]);
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
            items: [item1], // age: 100
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            age: { $gt: 100 },
          });

          const adjustedItem = {
            ...item1,
            id: 'id2',
            name: 'test2',
          };

          expect(paginator.ingestItem(adjustedItem)).toBeFalsy(); // no action
          expect(paginator.items).toStrictEqual([item1]);
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
            items: [item3, item1],
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });

          expect(paginator.ingestItem(item2)).toBeTruthy();
          expect(paginator.items).toStrictEqual([item3, item1, item2]);
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
            items: [item3, item1],
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
          expect(paginator.items).toStrictEqual([item3, item2, item1]);
        },
      );

      it('reflects the boost priority on lockItemOrder: false for newly ingested items', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item1],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item2, item3, item1]);
      });

      it('reflects the boost priority on lockItemOrder: false for existing items recently boosted', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item1, item2, item3],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        const adjustedItem2 = {
          ...item2,
          age: 103,
        };
        paginator.boost(item2.id);
        expect(paginator.ingestItem(adjustedItem2)).toBeTruthy(); // item updated
        expect(paginator.items).toStrictEqual([adjustedItem2, item1, item3]);
      });

      it('does not reflect the boost priority on lockItemOrder: true', () => {
        const paginator = new Paginator({ lockItemOrder: true });
        paginator.state.partialNext({
          items: [item1, item2, item3],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy(); // item updated
        expect(paginator.items).toStrictEqual([item1, item2, item3]);
      });

      it('reflects the boost priority on lockItemOrder: true when ingesting a new item', () => {
        const paginator = new Paginator({ lockItemOrder: true });
        paginator.state.partialNext({
          items: [item3, item1],
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item2, item3, item1]);
      });
    });

    describe('ingestItem with itemIndex', () => {
      beforeEach(() => {
        itemIndex.clear();
      });

      it('updates an item that lives only in the logical head interval re-inserts the item back to logical interval', () => {
        const paginator = new Paginator({ itemIndex });

        // Sort by age desc so we can create "head" and "tail" logically
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        // First ingestion: item2 (age 101) → logical head
        expect(paginator.ingestItem(item2)).toBe(true);

        // Second ingestion: item1 (age 100, younger than item2) → logical tail
        expect(paginator.ingestItem(item1)).toBe(true);

        // We should now have only logical intervals: head + tail
        // @ts-expect-error accessing protected property
        let intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: [item2.id],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: [item1.id],
          },
        ]);

        // Update the tail item snapshot (change sort-relevant field)
        const updatedHead: TestItem = {
          ...item2,
          age: 150, // arbitrary change
        };

        expect(paginator.ingestItem(updatedHead)).toBe(true);

        // ItemIndex snapshot for id1 is updated
        // @ts-expect-error accessing protected property
        expect(paginator._itemIndex!.get(item2.id)).toStrictEqual(updatedHead);

        // We still have exactly the same logical head + tail intervals by ID and membership
        // (the "still belongs to previous logical interval when only logical intervals exist" rule)
        // @ts-expect-error accessing protected property
        intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: [item2.id],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: [item1.id],
          },
        ]);
      });

      it('keeps updated existing item in logical tail when only logical intervals exist', () => {
        const paginator = new Paginator({ itemIndex });

        // Sort by age desc so we can create "head" and "tail" logically
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        // First ingestion: item2 (age 101) → logical head
        expect(paginator.ingestItem(item2)).toBe(true);

        // Second ingestion: item1 (age 100, younger than item2) → logical tail
        expect(paginator.ingestItem(item1)).toBe(true);

        // We should now have only logical intervals: head + tail
        // @ts-expect-error accessing protected property
        let intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: [item2.id],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: [item1.id],
          },
        ]);

        // Update the tail item snapshot (change sort-relevant field)
        const updatedTail: TestItem = {
          ...item1,
          age: 50, // arbitrary change
        };

        expect(paginator.ingestItem(updatedTail)).toBe(true);

        // ItemIndex snapshot for id1 is updated
        // @ts-expect-error accessing protected property
        expect(paginator._itemIndex!.get(item1.id)).toStrictEqual(updatedTail);

        // We still have exactly the same logical head + tail intervals by ID and membership
        // (the "still belongs to previous logical interval when only logical intervals exist" rule)
        // @ts-expect-error accessing protected property
        intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toStrictEqual([
          {
            id: LOGICAL_HEAD_INTERVAL_ID,
            itemIds: [item2.id],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: [item1.id],
          },
        ]);
      });

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'item exists but does not match the filter anymore removes the item %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ itemIndex, lockItemOrder });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $eq: ['abc', 'efg'] }, // required membership in these two teams
          });

          paginator.ingestPage({
            page: [item3, item2, item1],
            setActive: true,
          });

          // @ts-expect-error accessing protected property _itemIndex
          expect(Array.from(paginator._itemIndex!.values())).toStrictEqual([
            item3,
            item2,
            item1,
          ]);

          const adjustedItem1 = {
            ...item1,
            teams: ['efg'], // removed from the team abc
          };

          expect(paginator.ingestItem(adjustedItem1)).toBeTruthy(); // item removed
          expect(paginator.items).toStrictEqual([item3, item2]);

          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id2'],
            },
          ]);

          // item index keeps the reference
          // @ts-expect-error accessing protected property _itemIndex
          expect(Array.from(paginator._itemIndex!.values())).toStrictEqual([
            item3,
            item2,
            adjustedItem1,
          ]);
        },
      );

      it.each([
        [' does not adjust the order on lockItemOrder: true', true],
        [' adjusts the order on lockItemOrder: false', false],
      ])('exists and matches the filter updates the item and %s', (_, lockItemOrder) => {
        const paginator = new Paginator({ lockItemOrder, itemIndex });
        paginator.ingestPage({
          page: [item1, item2, item3],
          setActive: true,
        });
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: 1 } });

        const adjustedItem1 = {
          ...item1,
          age: 103,
        };

        expect(paginator.ingestItem(adjustedItem1)).toBeTruthy(); // item updated

        if (lockItemOrder) {
          expect(paginator.items).toStrictEqual([adjustedItem1, item2, item3]);
        } else {
          // moved to next page that may be disjoint and would be retrieved by pagination
          expect(paginator.items).toStrictEqual([item2, item3]);
        }

        // intervals are independent of the UI layer in state.items
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id2', 'id3'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['id1'],
          },
        ]);

        // item index keeps the reference
        // @ts-expect-error accessing protected property _itemIndex
        expect(Array.from(paginator._itemIndex!.values())).toStrictEqual([
          adjustedItem1,
          item2,
          item3,
        ]);
      });

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist and does not match the filter results in no action %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder, itemIndex });
          paginator.ingestPage({
            page: [item1], // age: 100
            setActive: true,
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            age: { $gt: 100 },
          });

          const adjustedItem = {
            ...item1,
            id: 'id2',
            name: 'test2',
          };

          expect(paginator.ingestItem(adjustedItem)).toBeFalsy(); // no action
          expect(paginator.items).toStrictEqual([item1]);
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id1'],
            },
          ]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist and matches the filter inserts according to default sort order (append) %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder, itemIndex });
          paginator.ingestPage({
            page: [item3, item1],
            setActive: true,
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });

          expect(paginator.ingestItem(item2)).toBeTruthy();
          expect(paginator.items).toStrictEqual([item3, item1, item2]);
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1', 'id2'],
            },
          ]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist and matches the filter inserts according to sort order %s',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder, itemIndex });
          paginator.ingestPage({
            page: [item3, item1],
            setActive: true,
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
          expect(paginator.items).toStrictEqual([item3, item2, item1]);
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id2', 'id1'],
            },
          ]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'does not exist, matches the filter, is out of the current interval bounds, inserts according to sort order %s to a new interval',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ lockItemOrder, itemIndex });
          paginator.ingestPage({
            page: [item3, item1],
            setActive: true,
          });

          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });
          paginator.sortComparator = makeComparator<
            TestItem,
            Partial<Record<keyof TestItem, AscDesc>>
          >({ sort: { age: -1 } });

          const item4 = {
            id: 'id4',
            name: 'test',
            age: 99,
            teams: ['abc'],
          };
          expect(paginator.ingestItem(item4)).toBeTruthy();
          expect(paginator.items).toStrictEqual([item3, item1]);
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: expect.any(String),
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: LOGICAL_TAIL_INTERVAL_ID,
              itemIds: ['id4'],
            },
          ]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        '%s is not reflected in a previously non-active interval we jump to',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ itemIndex, lockItemOrder });
          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });
          paginator.sortComparator = makeComparator<
            TestItem,
            Partial<Record<keyof TestItem, AscDesc>>
          >({ sort: { age: -1 } });

          const firstPage = paginator.ingestPage({
            page: [item3, item1],
            setActive: true,
          });

          const item4 = {
            id: 'id4',
            name: 'test',
            age: 96,
            teams: ['abc'],
          };
          const item5 = {
            id: 'id5',
            name: 'test',
            age: 97,
            teams: ['abc'],
          };
          const item6 = {
            id: 'id6',
            name: 'test',
            age: 98,
            teams: ['abc'],
          };
          const secondPage = paginator.ingestPage({
            page: [item6, item5, item4],
            setActive: true,
          });
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: firstPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: secondPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id6', 'id5', 'id4'],
            },
          ]);

          const adjustedItem4 = {
            ...item4,
            age: 98,
          };
          expect(paginator.ingestItem(adjustedItem4)).toBeTruthy();

          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: firstPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: secondPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id6', 'id4', 'id5'],
            },
          ]);
          expect(
            // @ts-expect-error accessing protected property _itemIntervals
            paginator.intervalToItems(paginator._itemIntervals.get(secondPage!.id)!),
          ).toStrictEqual([item6, adjustedItem4, item5]);
        },
      );

      it.each([
        ['on lockItemOrder: false', false],
        ['on lockItemOrder: true', true],
      ])(
        'existing item with changed sort-relevant properties is removed altogether if falls between existing intervals',
        (_, lockItemOrder) => {
          const paginator = new Paginator({ itemIndex, lockItemOrder });
          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });
          paginator.sortComparator = makeComparator<
            TestItem,
            Partial<Record<keyof TestItem, AscDesc>>
          >({ sort: { age: -1 } });

          const firstPage = paginator.ingestPage({
            page: [item3, item1],
            setActive: true,
          });

          const item4 = {
            id: 'id4',
            name: 'test',
            age: 96,
            teams: ['abc'],
          };
          const item5 = {
            id: 'id5',
            name: 'test',
            age: 97,
            teams: ['abc'],
          };
          const item6 = {
            id: 'id6',
            name: 'test',
            age: 98,
            teams: ['abc'],
          };
          const secondPage = paginator.ingestPage({
            page: [item6, item5, item4],
            setActive: true,
          });
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: firstPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: secondPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id6', 'id5', 'id4'],
            },
          ]);

          const adjustedItem5 = {
            ...item5,
            age: 99,
          };
          expect(paginator.ingestItem(adjustedItem5)).toBeTruthy();

          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: firstPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: secondPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id6', 'id4'],
            },
          ]);
          expect(
            // @ts-expect-error accessing protected property _itemIntervals
            paginator.intervalToItems(paginator._itemIntervals.get(secondPage!.id)!),
          ).toStrictEqual([item6, item4]);
        },
      );

      it.each([
        ['on lockItemOrder: false', 'is', false],
        ['on lockItemOrder: true', 'is not', true],
      ])(
        '%s boost %s reflected in a previously non-active interval we jump to',
        (_, __, lockItemOrder) => {
          const paginator = new Paginator({ itemIndex, lockItemOrder });
          // @ts-expect-error accessing protected property
          paginator.buildFilters = () => ({
            teams: { $contains: 'abc' },
          });
          paginator.sortComparator = makeComparator<
            TestItem,
            Partial<Record<keyof TestItem, AscDesc>>
          >({ sort: { age: -1 } });

          const firstPage = paginator.ingestPage({
            page: [item3, item1],
            setActive: true,
          });

          const item4 = {
            id: 'id4',
            name: 'test',
            age: 97,
            teams: ['abc'],
          };
          const item5 = {
            id: 'id5',
            name: 'test',
            age: 98,
            teams: ['abc'],
          };
          const item6 = {
            id: 'id6',
            name: 'test',
            age: 99,
            teams: ['abc'],
          };
          const secondPage = paginator.ingestPage({
            page: [item6, item5, item4],
            setActive: true,
          });
          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: firstPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: secondPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id6', 'id5', 'id4'],
            },
          ]);

          paginator.boost(item5.id, { until: 9999999999999999 });
          expect(paginator.ingestItem(item5)).toBeTruthy();

          // @ts-expect-error accessing protected property _itemIntervals
          expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
            {
              id: firstPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id3', 'id1'],
            },
            {
              id: secondPage!.id,
              hasMoreHead: true,
              hasMoreTail: true,
              isHead: false,
              isTail: false,
              itemIds: ['id6', 'id5', 'id4'],
            },
          ]);
          if (lockItemOrder) {
            expect(
              // @ts-expect-error accessing protected property _itemIntervals
              paginator.intervalToItems(paginator._itemIntervals.get(secondPage!.id)!),
            ).toStrictEqual([item6, item5, item4]);
          } else {
            expect(
              // @ts-expect-error accessing protected property _itemIntervals
              paginator.intervalToItems(paginator._itemIntervals.get(secondPage!.id)!),
            ).toStrictEqual([item5, item6, item4]);
          }
        },
      );

      it('reflects the boost priority on lockItemOrder: false for newly ingested items in state.items only', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({
          page: [item3, item1],
          setActive: true,
        });
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item2, item3, item1]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id3', 'id2', 'id1'],
          },
        ]);
      });

      it('reflects the boost priority on lockItemOrder: false for newly ingested items ingested outside the existing interval only in state.items', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({
          page: [item3, item1],
          setActive: true,
        });
        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        const item4 = {
          id: 'id4',
          name: 'test',
          age: 99,
          teams: ['abc'],
        };
        paginator.boost(item4.id, { until: 9999999999999999 });
        expect(paginator.ingestItem(item4)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item3, item1]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id3', 'id1'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['id4'],
          },
        ]);

        const item5 = {
          id: 'id5',
          name: 'test',
          age: 98,
          teams: ['abc'],
        };
        paginator.boost(item5.id, { until: 9999999999999999, seq: 1 });
        expect(paginator.ingestItem(item5)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item3, item1]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id3', 'id1'],
          },
          {
            id: LOGICAL_TAIL_INTERVAL_ID,
            itemIds: ['id4', 'id5'],
          },
        ]);
        expect(
          paginator.intervalToItems(
            // @ts-expect-error accessing protected property _itemIntervals
            paginator._itemIntervals.get(LOGICAL_TAIL_INTERVAL_ID)!,
          ),
        ).toStrictEqual([item5, item4]);
      });

      it('boosted existing item in an anchored interval moves ahead of non-boosted items (lockItemOrder: false) only in state.items', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({
          page: [item1, item2, item3],
          setActive: true,
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: 1 },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy(); // item updated
        expect(paginator.items).toStrictEqual([item2, item1, item3]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id1', 'id2', 'id3'],
          },
        ]);
      });

      it('does not reflect the boost priority of existing on lockItemOrder: true', () => {
        const paginator = new Paginator({ itemIndex, lockItemOrder: true });
        paginator.ingestPage({
          page: [item1, item2, item3],
          setActive: true,
        });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          age: { $gt: 100 },
        });

        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: 1 },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy(); // item updated
        expect(paginator.items).toStrictEqual([item1, item2, item3]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id1', 'id2', 'id3'],
          },
        ]);
      });

      it('does not reflect the boost priority on lockItemOrder: true when ingesting a new item only in state.items', () => {
        const paginator = new Paginator({ itemIndex, lockItemOrder: true });
        paginator.ingestPage({ page: [item3, item1], setActive: true });

        // @ts-expect-error accessing protected property
        paginator.buildFilters = () => ({
          teams: { $contains: 'abc' },
        });

        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });

        paginator.boost(item2.id);
        expect(paginator.ingestItem(item2)).toBeTruthy();
        expect(paginator.items).toStrictEqual([item3, item2, item1]);
        // @ts-expect-error accessing protected property _itemIntervals
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: true,
            hasMoreTail: true,
            isHead: false,
            isTail: false,
            itemIds: ['id3', 'id2', 'id1'],
          },
        ]);
      });
    });

    describe('removeItem', () => {
      it('removes existing item', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item3, item2, item1],
        });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        expect(paginator.removeItem({ item: item3 })).toStrictEqual({
          state: { currentIndex: 0, insertionIndex: 0 },
        });
        expect(paginator.items).toHaveLength(2);
        expect(paginator.items![0]).toStrictEqual(item2);
        expect(paginator.items![1]).toStrictEqual(item1);
      });

      it('results in no action for non-existent item', () => {
        const paginator = new Paginator();
        paginator.state.partialNext({
          items: [item2, item1],
        });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({
          sort: { age: -1 },
        });
        expect(paginator.removeItem({ item: item3 })).toStrictEqual({
          state: { currentIndex: -1, insertionIndex: -1 },
        });
        expect(paginator.items).toHaveLength(2);
        expect(paginator.items![0]).toStrictEqual(item2);
        expect(paginator.items![1]).toStrictEqual(item1);
      });

      it('removes item from both state and anchored intervals when itemIndex is present', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        paginator.ingestPage({ page: [item3, item2, item1], setActive: true });

        const result = paginator.removeItem({ id: item2.id });

        expect(result.state?.currentIndex).toBe(1);
        // Interval no longer contains id2
        // @ts-expect-error accessing protected property
        const intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toHaveLength(1);
        expect(intervals[0].itemIds).toEqual(['id3', 'id1']);

        expect(paginator.items!.map((i) => i.id)).toEqual(['id3', 'id1']);
      });

      it('falls back to linear scan by id when no itemIndex is provided', () => {
        const paginator = new Paginator(); // no itemIndex
        paginator.state.partialNext({ items: [item3, item2, item1] });

        const res = paginator.removeItem({ id: item2.id });

        expect(res).toEqual({ state: { currentIndex: 1, insertionIndex: -1 } });
        expect(paginator.items!.map((i) => i.id)).toEqual(['id3', 'id1']);
      });

      it('removeItem is a no-op when itemIndex exists but does not have the interval for the given id', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.state.partialNext({ items: [item1] });

        const res = paginator.removeItem({ id: 'missing' });

        expect(res).toEqual({ state: { currentIndex: -1, insertionIndex: -1 } });
        expect(paginator.items).toEqual([item1]);
        // @ts-expect-error accessing protected property
        expect(paginator._itemIntervals.size).toBe(0);
      });

      it('removeItem is a no-op when itemIndex exists and has the interval but id is unknown', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({ page: [item1], setActive: true });

        const res = paginator.removeItem({ id: 'missing' });

        expect(res).toEqual({ state: { currentIndex: -1, insertionIndex: -1 } });
        expect(paginator.items).toEqual([item1]);
        // @ts-expect-error accessing protected property
        expect(paginator._itemIntervals.size).toBe(1);
      });

      it('removes last item and removes the parent interval', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({ page: [item1], setActive: true });

        const res = paginator.removeItem({ id: item1.id });

        expect(res).toEqual({
          state: { currentIndex: 0, insertionIndex: 0 },
          interval: {
            interval: res.interval!.interval,
            currentIndex: 0,
            insertionIndex: 0,
          },
        });
        // we are not returning to undefined as a sign that we have not reset the pagination
        expect(paginator.items).toStrictEqual([]);
        // @ts-expect-error accessing protected property
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([]);
      });

      it('removes last item and removes the parent interval from a non-active page', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({ page: [item1] });

        const res = paginator.removeItem({ id: item1.id });

        expect(res).toEqual({
          // the state has no data so we get -1 for indices
          state: { currentIndex: -1, insertionIndex: -1 },
          interval: {
            interval: res.interval!.interval,
            currentIndex: 0,
            insertionIndex: 0,
          },
        });
        expect(paginator.items).toBeUndefined();
        // @ts-expect-error accessing protected property
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([]);
      });
    });

    describe('setItems', () => {
      it('overrides all the items in the state with provided value', () => {
        const paginator = new Paginator();
        const items1 = [{ id: 'test-item1' }];
        const items2 = [{ id: 'test-item2' }];
        paginator.setItems({ valueOrFactory: items1 });
        expect(paginator.items).toStrictEqual(items1);
        paginator.setItems({ valueOrFactory: items2 });
        expect(paginator.items).toStrictEqual(items2);
      });

      const items = [{ id: 'test-item1' }];
      const expectedStateEmissions = [
        {
          cursor: undefined,
          hasMoreTail: true,
          hasMoreHead: true,
          isLoading: false,
          items: undefined,
          lastQueryError: undefined,
          offset: 0,
        },
        {
          cursor: undefined,
          hasMoreTail: true,
          hasMoreHead: true,
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

        paginator.setItems({ valueOrFactory: items });
        expect(paginator.items).toStrictEqual(items);
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[1],
          expectedStateEmissions[0],
        );

        // setting an object with the same reference
        paginator.setItems({ valueOrFactory: items });
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

        paginator.setItems({ valueOrFactory: () => items });
        expect(paginator.items).toStrictEqual(items);
        // first call is on subscribe
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          expectedStateEmissions[1],
          expectedStateEmissions[0],
        );

        // setting an object with the same reference
        paginator.setItems({ valueOrFactory: () => items });
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
          { tailward: 'next1', headward: 'prev1' },
          { tailward: 'next2', headward: 'prev1' },
        ];
        const subscriptionHandler = vi.fn();
        const unsubscribe = paginator.state.subscribe(subscriptionHandler);

        paginator.setItems({ valueOrFactory: items, cursor: cursors[0] });
        expect(subscriptionHandler).toHaveBeenCalledTimes(2);
        expect(subscriptionHandler).toHaveBeenCalledWith(
          { ...expectedStateEmissions[1], cursor: cursors[0], offset: 0 },
          { ...expectedStateEmissions[0], cursor: undefined, offset: 0 },
        );

        unsubscribe();
      });

      it('prioritizes isFirstPage: true and isLastPage: true', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        const page = [item2, item1];

        paginator.setItems({
          valueOrFactory: page,
          isFirstPage: true,
          isLastPage: true,
        });

        // @ts-expect-error accessing protected property
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: false,
            hasMoreTail: false,
            isHead: true,
            isTail: true,
            itemIds: ['id2', 'id1'],
          },
        ]);

        paginator.setItems({
          valueOrFactory: [item3],
          isFirstPage: false,
          isLastPage: false,
        });

        // @ts-expect-error accessing protected property
        expect(Array.from(paginator._itemIntervals.values())).toStrictEqual([
          {
            id: expect.any(String),
            hasMoreHead: false,
            hasMoreTail: false,
            isHead: true,
            isTail: true,
            itemIds: ['id3', 'id2', 'id1'],
          },
        ]);
      });

      it('does not reflect on isFirstPage and isLastPage when item interval storage is disabled', () => {
        const paginator = new Paginator();
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        const page = [item2, item1];

        paginator.setItems({
          valueOrFactory: page,
          isFirstPage: true,
          isLastPage: true,
        });

        // @ts-expect-error accessing protected property
        expect(paginator._itemIntervals.size).toBe(0);
        expect(paginator.items).toStrictEqual([item2, item1]);

        paginator.setItems({
          valueOrFactory: [item3],
          isFirstPage: false,
          isLastPage: false,
        });

        // @ts-expect-error accessing protected property
        expect(paginator._itemIntervals.size).toBe(0);
        expect(paginator.items).toStrictEqual([item3]);
      });

      it('with itemIndex creates an anchored interval and sets it active', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.sortComparator = makeComparator<
          TestItem,
          Partial<Record<keyof TestItem, AscDesc>>
        >({ sort: { age: -1 } });

        const page = [item3, item1];

        paginator.setItems({
          valueOrFactory: page,
          isFirstPage: true,
          isLastPage: false,
        });

        expect(paginator.items).toEqual(page);
        expect(paginator.offset).toBe(page.length);

        // @ts-expect-error accessing protected property
        const intervals = Array.from(paginator._itemIntervals.values());
        expect(intervals).toHaveLength(1);
        expect(intervals[0]).toMatchObject({
          isHead: true,
          isTail: false,
          itemIds: ['id3', 'id1'],
        });

        // @ts-expect-error accessing protected property
        expect(paginator._activeIntervalId).toBe(intervals[0].id);
      });
    });

    describe('reload', () => {
      it('starts the ended pagination from the beginning [offset pagination]', async () => {
        const paginator = new Paginator({ pageSize: 2 });
        paginator.state.next({
          hasMoreTail: false,
          hasMoreHead: false,
          isLoading: false,
          items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
          offset: 4,
        });
        let reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.hasMoreHead).toBe(true);

        paginator.queryResolve({ items: [{ id: 'id1' }] });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
        expect(paginator.items).toEqual([{ id: 'id1' }]);
        expect(paginator.cursor).toBeUndefined();
        expect(paginator.offset).toBe(1);
        expect(paginator.mockClientQuery).toHaveBeenCalledWith({
          direction: 'tailward',
          queryShape: defaultNextQueryShape,
          reset: 'yes',
          retryCount: 0,
        });

        reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.hasMoreHead).toBe(true);

        paginator.queryResolve({ items: [{ id: 'id2' }], tailward: 'next2' });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
        expect(paginator.items).toEqual([{ id: 'id2' }]);
        expect(paginator.cursor).toBeUndefined();
        expect(paginator.offset).toBe(1);
        expect(paginator.mockClientQuery).toHaveBeenCalledWith({
          direction: 'tailward',
          queryShape: defaultNextQueryShape,
          reset: 'yes',
          retryCount: 0,
        });
      });
      it('starts the ended pagination from the beginning [cursor pagination]', async () => {
        const paginator = new Paginator({ initialCursor: ZERO_PAGE_CURSOR, pageSize: 2 });
        paginator.state.next({
          hasMoreTail: false,
          hasMoreHead: false,
          isLoading: false,
          items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
          cursor: { tailward: 'tailward1', headward: 'headward1' },
        });
        let reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.hasMoreHead).toBe(true);

        paginator.queryResolve({ items: [{ id: 'id1' }] });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.items).toEqual([{ id: 'id1' }]);
        expect(paginator.cursor).toStrictEqual({ tailward: null, headward: null });
        expect(paginator.offset).toBe(0);
        expect(paginator.mockClientQuery).toHaveBeenCalledWith({
          direction: 'tailward',
          queryShape: defaultNextQueryShape,
          reset: 'yes',
          retryCount: 0,
        });

        reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.hasMoreHead).toBe(true);

        paginator.queryResolve({ items: [{ id: 'id2' }], tailward: 'tailward2' });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.items).toEqual([{ id: 'id2' }]);
        expect(paginator.cursor).toStrictEqual({ tailward: 'tailward2', headward: null });
        expect(paginator.offset).toBe(0);
        expect(paginator.mockClientQuery).toHaveBeenCalledWith({
          direction: 'tailward',
          queryShape: defaultNextQueryShape,
          reset: 'yes',
          retryCount: 0,
        });

        // reset in another direction
        reloadPromise = paginator.reload();
        // wait for the DB data first page load
        await sleep(0);
        expect(paginator.isLoading).toBe(true);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.hasMoreHead).toBe(true);
        expect(paginator.items).toBe(undefined);

        paginator.queryResolve({ items: [{ id: 'id2' }], headward: 'headward2' });
        await reloadPromise;
        expect(paginator.isLoading).toBe(false);
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
        expect(paginator.items).toEqual([{ id: 'id2' }]);
        expect(paginator.cursor).toStrictEqual({ headward: 'headward2', tailward: null });
        expect(paginator.offset).toBe(0);
      });
    });

    describe('resetState', () => {
      it('restores initial state and clears intervals', () => {
        const paginator = new Paginator({ itemIndex });
        paginator.ingestPage({ page: [item3, item2], setActive: true });

        // Sanity: mutated state + intervals
        expect(paginator.items).toEqual([item3, item2]);
        // @ts-expect-error
        expect(paginator._itemIntervals.size).toBe(1);

        paginator.resetState();

        expect(paginator.state.getLatestValue()).toEqual(paginator.initialState);
        // @ts-expect-error
        expect(paginator._itemIntervals.size).toBe(0);
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
