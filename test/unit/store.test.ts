import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MergedStateStore, StateStore } from '../../src/store';

describe('StateStore', () => {
  type State = { count: number; flag: boolean };

  let store: StateStore<State>;
  const initialState = { count: 0, flag: false };

  beforeEach(() => {
    store = new StateStore<State>(initialState);
  });

  it('should initialize with given value', () => {
    expect(store.getLatestValue()).toEqual(initialState);
  });

  it('should update state with next (object)', () => {
    const newState = { count: 5, flag: true };
    store.next(newState);
    expect(store.getLatestValue()).toStrictEqual(newState);
  });

  it('should update state with next (patch function)', () => {
    store.next((prev) => ({ ...prev, count: prev.count + 1 }));
    expect(store.getLatestValue()).toEqual({ count: 1, flag: false });
  });

  it('should not notify subscribers if value does not change', () => {
    const handler = vi.fn();
    store.subscribe(handler);
    handler.mockClear();
    store.next(store.getLatestValue());
    expect(handler).not.toHaveBeenCalled();
  });

  it('should notify subscribers on value change', () => {
    const handler = vi.fn();
    store.subscribe(handler);
    handler.mockClear();
    store.next({ count: 2, flag: true });
    expect(handler).toHaveBeenCalledWith({ count: 2, flag: true }, initialState);
  });

  it('should support partialNext', () => {
    store.partialNext({ count: 10 });
    expect(store.getLatestValue()).toEqual({ count: 10, flag: false });
  });

  it('should unsubscribe handlers', () => {
    const handler = vi.fn();
    const unsub = store.subscribe(handler);
    unsub();
    store.next({ count: 1, flag: true });
    expect(handler).toHaveBeenCalledTimes(1); // only initial call
  });

  it('should support subscribeWithSelector', () => {
    const handler = vi.fn();
    store.subscribeWithSelector((s) => ({ count: s.count }), handler);
    handler.mockClear();
    store.partialNext({ flag: true });
    expect(handler).not.toHaveBeenCalled();
    store.partialNext({ count: 42 });
    expect(handler).toHaveBeenCalledWith({ count: 42 }, { count: 0 });
  });

  it('should support addPreprocessor', () => {
    const handler = vi.fn();
    store.subscribe(handler);

    store.addPreprocessor((next) => {
      if (next.count > 5) next.count = 5;
    });

    store.partialNext({ count: 10 });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(store.getLatestValue().count).toBe(5);
  });

  it('should not call preprocessors if value does not change', () => {
    const mod = vi.fn();

    store.addPreprocessor(mod);
    store.next(store.getLatestValue());

    expect(mod).not.toHaveBeenCalled();
  });

  it('should allow unregistering preprocessors', () => {
    const mod = vi.fn();
    const unregister = store.addPreprocessor(mod);
    unregister();
    store.partialNext({ count: 2 });
    expect(mod).not.toHaveBeenCalled();
  });
});

describe('MergedStateStore', () => {
  type StateA = { a: number };
  type StateB = { b: string };

  let storeA: StateStore<StateA>;
  let storeB: StateStore<StateB>;
  let merged: MergedStateStore<StateA, StateB>;

  beforeEach(() => {
    storeA = new StateStore<StateA>({ a: 1 });
    storeB = new StateStore<StateB>({ b: 'x' });
    merged = storeA.merge(storeB);
  });

  it('should combine values from both stores', () => {
    expect(merged.getLatestValue()).toEqual({ a: 1, b: 'x' });
  });

  it('should update merged value when original changes', () => {
    storeA.partialNext({ a: 2 });
    expect(merged.getLatestValue()).toEqual({ a: 2, b: 'x' });
  });

  it('should update merged value when merged store changes', () => {
    storeB.partialNext({ b: 'y' });
    expect(merged.getLatestValue()).toEqual({ a: 1, b: 'y' });
  });

  it('should notify subscribers on changes from either store', () => {
    const handler = vi.fn();
    merged.subscribe(handler);
    handler.mockClear();
    storeA.partialNext({ a: 3 });
    expect(handler).toHaveBeenCalledWith({ a: 3, b: 'x' }, { a: 1, b: 'x' });
    handler.mockClear();
    storeB.partialNext({ b: 'z' });
    expect(handler).toHaveBeenCalledWith({ a: 3, b: 'z' }, { a: 3, b: 'x' });
  });

  it('should not allow direct mutation via next/partialNext/addPreprocessor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // @ts-expect-error testing purposes
    merged.next({ a: 5, b: 'q' });
    // @ts-expect-error testing purposes
    merged.partialNext({ a: 5 });
    // @ts-expect-error testing purposes
    merged.addPreprocessor(() => {});
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('should keep merged value in sync even without subscribers', () => {
    storeA.partialNext({ a: 10 });
    storeB.partialNext({ b: 'sync' });
    expect(merged.getLatestValue()).toEqual({ a: 10, b: 'sync' });
  });

  it('should unsubscribe all handlers (helpers too)', () => {
    const handler = vi.fn();
    const unsub = merged.subscribe(handler);
    unsub();
    storeA.partialNext({ a: 99 });
    expect(handler).toHaveBeenCalledTimes(1); // only initial call
    // @ts-expect-error testing internals
    expect(merged.handlers.size).to.equal(0);
  });
});
