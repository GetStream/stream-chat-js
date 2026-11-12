import { StateStore } from '@stream-io/state-store';
import { describe, expect, it, vi } from 'vitest';

import { PaginatorView } from '../../../src';
import type { BasePaginator, PaginatorState } from '../../../src';

type Item = { id: string; read: boolean };

const a: Item = { id: 'a', read: true };
const b: Item = { id: 'b', read: false };
const c: Item = { id: 'c', read: false };

/** The view reads the paginator's `state` and delegates its loaders. */
const createPaginator = (items?: Item[]) => {
  const state = new StateStore<Pick<PaginatorState<Item>, 'items'>>({ items });
  const paginator = {
    state,
    toHead: vi.fn(),
    toHeadDebounced: vi.fn(),
    toTail: vi.fn(),
    toTailDebounced: vi.fn(),
  } as unknown as BasePaginator<Item, unknown>;
  const setItems = (next?: Item[]) => state.partialNext({ items: next });
  return { paginator, setItems };
};

const unread = ({ read }: Item) => !read;

const itemsOf = (view: PaginatorView<Item>) => view.state.getLatestValue().items;

describe('PaginatorView', () => {
  it('shows the paginator items the predicate accepts, in their order', () => {
    const { paginator } = createPaginator([a, b, c]);

    const view = new PaginatorView({ paginator, predicate: unread });

    expect(itemsOf(view)).toEqual([b, c]);
    expect(view.accepts(a)).toBe(false);
  });

  it('passes the items array through without a predicate', () => {
    const items = [a, b];
    const { paginator } = createPaginator(items);

    const view = new PaginatorView({ paginator });

    expect(itemsOf(view)).toBe(items);
    expect(view.accepts(a)).toBe(true);
  });

  it('is undefined while the paginator has no items', () => {
    const { paginator } = createPaginator();

    expect(itemsOf(new PaginatorView({ paginator, predicate: unread }))).toBe(undefined);
  });

  it('follows the paginator only while registered, catching up on registering', () => {
    const { paginator, setItems } = createPaginator([a]);
    const view = new PaginatorView({ paginator, predicate: unread });

    setItems([a, b]);
    expect(itemsOf(view)).toEqual([]);

    view.registerSubscriptions();
    expect(itemsOf(view)).toEqual([b]);

    setItems([a, b, c]);
    expect(itemsOf(view)).toEqual([b, c]);

    view.unregisterSubscriptions();
    setItems([a]);
    expect(itemsOf(view)).toEqual([b, c]);
  });

  it('stops following only when the last holder unregisters', () => {
    const { paginator, setItems } = createPaginator([]);
    const view = new PaginatorView({ paginator, predicate: unread });
    view.registerSubscriptions();
    view.registerSubscriptions();

    view.unregisterSubscriptions();
    setItems([b]);

    expect(itemsOf(view)).toEqual([b]);
  });

  it('keeps the same array, and notifies no one, when no accepted item changed', () => {
    const { paginator, setItems } = createPaginator([a, b]);
    const view = new PaginatorView({ paginator, predicate: unread });
    view.registerSubscriptions();
    const before = itemsOf(view);
    const listener = vi.fn();
    view.state.subscribe(listener);
    listener.mockClear();

    setItems([{ ...a }, b]);

    expect(itemsOf(view)).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('recomputes the items when the predicate is replaced', () => {
    const { paginator } = createPaginator([a, b]);
    const view = new PaginatorView({ paginator, predicate: unread });

    view.setPredicate(({ read }) => read);
    expect(itemsOf(view)).toEqual([a]);

    view.setPredicate();
    expect(itemsOf(view)).toEqual([a, b]);
  });

  it("loads through the paginator's own head and tail loaders", () => {
    const { paginator } = createPaginator([a]);
    const view = new PaginatorView({ paginator });
    const params = { reset: 'yes' } as const;

    view.toHead(params);
    view.toTail(params);
    view.toHeadDebounced(params);
    view.toTailDebounced(params);

    expect(paginator.toHead).toHaveBeenCalledWith(params);
    expect(paginator.toTail).toHaveBeenCalledWith(params);
    expect(paginator.toHeadDebounced).toHaveBeenCalledWith(params);
    expect(paginator.toTailDebounced).toHaveBeenCalledWith(params);
  });
});
