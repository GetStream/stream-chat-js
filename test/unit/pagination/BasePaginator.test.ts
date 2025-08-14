import { describe, expect, it, vi } from 'vitest';
import {
  BasePaginator,
  DEFAULT_PAGINATION_OPTIONS,
  PaginationQueryParams,
  PaginationQueryReturnValue,
  type PaginatorOptions,
} from '../../../src/pagination';
import { sleep } from '../../../src/utils';

const toNextTick = async () => {
  const sleepPromise = sleep(0);
  vi.advanceTimersByTime(0);
  await sleepPromise;
};
type TestItem = {
  id: string;
};

class Paginator extends BasePaginator<TestItem> {
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
});
