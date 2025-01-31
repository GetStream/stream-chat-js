export type Patch<T> = (value: T) => T;
export type ValueOrPatch<T> = T | Patch<T>;
export type Handler<T> = (nextValue: T, previousValue: T | undefined) => void;
export type Unsubscribe = () => void;
export type Unregister = Unsubscribe;
export type Modifier<T> = (nextValue: T, previousValue: T | undefined) => void;

export const isPatch = <T>(value: ValueOrPatch<T>): value is Patch<T> =>
  typeof value === 'function';

export class StateStore<T extends Record<string, unknown>> {
  protected handlers = new Set<Handler<T>>();
  protected modifiers = new Set<Handler<T>>();

  constructor(private value: T) {}

  /**
   * Allows merging two stores only if their keys differ otherwise there's no way to ensure the data type stability.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public merge<Q extends StateStore<any>>(
    stateStore: Q extends StateStore<infer L> ? (Extract<keyof T, keyof L> extends never ? Q : never) : never,
  ) {
    return new MergedStateStore<T, Q extends StateStore<infer L> ? L : never>({
      parentStore: this,
      mergedStore: stateStore,
    });
  }

  public next = (newValueOrPatch: ValueOrPatch<T>): void => {
    // newValue (or patch output) should never be mutated previous value
    const newValue = isPatch(newValueOrPatch)
      ? newValueOrPatch(this.value)
      : newValueOrPatch;

    // do not notify subscribers if the value hasn't changed
    if (newValue === this.value) return;

    this.modifiers.forEach((modifier) => modifier(newValue, this.value));

    const oldValue = this.value;
    this.value = newValue;

    this.handlers.forEach((handler) => handler(this.value, oldValue));
  };

  public partialNext = (partial: Partial<T>): void =>
    this.next((current) => ({ ...current, ...partial }));

  public getLatestValue = (): T => this.value;
  public subscribe(handler: Handler<T>): Unsubscribe {
    handler(this.value, undefined);
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public subscribeWithSelector = <
    O extends Readonly<Record<string, unknown>> | Readonly<unknown[]>,
  >(
    selector: (nextValue: T) => O,
    handler: Handler<O>,
  ) => {
    // begin with undefined to reduce amount of selector calls
    let previouslySelectedValues: O | undefined;

    const wrappedHandler: Handler<T> = (nextValue) => {
      const newlySelectedValues = selector(nextValue);

      let hasUpdatedValues = typeof previouslySelectedValues === 'undefined';

      for (const key in previouslySelectedValues) {
        if (previouslySelectedValues[key] === newlySelectedValues[key]) continue;
        hasUpdatedValues = true;
        break;
      }

      if (!hasUpdatedValues) return;

      // save a copy of previouslySelectedValues before running
      // handler - if previouslySelectedValues are set to
      // newlySelectedValues after the handler call, there's a chance
      // that it'll never get set as handler can throw and flow might
      // go out of sync
      const previouslySelectedValuesCopy = previouslySelectedValues;
      previouslySelectedValues = newlySelectedValues;

      handler(newlySelectedValues, previouslySelectedValuesCopy);
    };

    return this.subscribe(wrappedHandler);
  };

  public registerModifier(modifier: Modifier<T>): Unregister {
    this.modifiers.add(modifier);

    return () => {
      this.modifiers.delete(modifier);
    };
  }
}

class MergedStateStore<T extends Record<string, unknown>, L extends Record<string, unknown>> extends StateStore<T & L> {
  private readonly parentStore: StateStore<T>;
  private readonly mergedStore: StateStore<L>;

  constructor({ parentStore, mergedStore }: { mergedStore: StateStore<L>; parentStore: StateStore<T> }) {
    super({
      ...parentStore.getLatestValue(),
      ...mergedStore.getLatestValue(),
    });

    this.parentStore = parentStore;
    this.mergedStore = mergedStore;
  }

  public subscribe(handler: Handler<T & L>) {
    const unsubscribeFunctions: Unsubscribe[] = [];

    if (!this.handlers.size) {
      // FIXME: should we subscribe to the changes of the parent store or should we let it die
      // and make MergedStateStore the next "parent"?
      for (const store of [this.parentStore, this.mergedStore]) {
        // TODO: maybe allow "resolver" (how the two states should be merged)
        const unsubscribe = store.subscribe((nv) => {
          this.next((cv) => ({
            ...cv,
            ...nv,
          }));
        });

        unsubscribeFunctions.push(unsubscribe);
      }
    }

    unsubscribeFunctions.push(super.subscribe(handler));

    return () => {
      unsubscribeFunctions.forEach((f) => f());
    };
  }

  // TODO: getLatestValue should remain the same unless either of the source values changed (cached)

  // TODO: make `next` support only T type (maybe?) (only if we go with subscribing only to mergedStore)
}

// const a = new StateStore<{ a: string }>({ a: 'yooo' });
// const b = new StateStore<{ a: number, q: string; }>({ q: 'yooo', a: 2 });
// const c = new StateStore<{ q: string }>({ q: 'yooo' });

// const d = a.merge(b); // error
// const e = a.merge(c); // no error (keys differ)

// TODO: decide
// const d = a.merge(b); // state/type of `a` gets copied to the new merged state and gets garbage collected, `d` becomes new `a`

// l.subscribe(console.info);

// t.next({ a: 'poof' });
// b.next({ q: 'nah' });

const Uninitialized = Symbol('uninitialized');

const a = new StateStore<{ hasNext: boolean | typeof Uninitialized, next: string | null | typeof Uninitialized; }>({
  next: Uninitialized,
  hasNext: Uninitialized,
});

a.registerModifier((nextValue) => {
  if (typeof nextValue.next === 'string') {
    nextValue.hasNext = true;
  } else if (nextValue.next === Uninitialized) {
    nextValue.hasNext = Uninitialized;
  } else {
    nextValue.hasNext = false;
  }
});

a.subscribe((ns) => console.log(ns));

a.partialNext({ next: 'sss' });
a.partialNext({ next: null });
a.partialNext({ next: Uninitialized });
