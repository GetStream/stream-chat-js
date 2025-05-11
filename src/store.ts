export type Patch<T> = (value: T) => T;
export type ValueOrPatch<T> = T | Patch<T>;
export type Handler<T> = (nextValue: T, previousValue: T | undefined) => void;
export type Unsubscribe = () => void;

export type Unregister = Unsubscribe;
export type Modifier<T> = Handler<T>;

export const isPatch = <T>(value: ValueOrPatch<T>): value is Patch<T> =>
  typeof value === 'function';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export class StateStore<T extends Record<string, unknown>> {
  protected handlers = new Set<Handler<T>>();
  protected modifiers = new Set<Handler<T>>();

  constructor(protected value: T) {}

  /**
   * Allows merging two stores only if their keys differ otherwise there's no way to ensure the data type stability.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public merge<Q extends StateStore<any>>(
    stateStore: Q extends StateStore<infer L>
      ? Extract<keyof T, keyof L> extends never
        ? Q
        : never
      : never,
  ) {
    return new MergedStateStore<T, Q extends StateStore<infer L> ? L : never>({
      original: this,
      merged: stateStore,
    });
  }

  public next(newValueOrPatch: ValueOrPatch<T>): void {
    // newValue (or patch output) should never be a mutated previous value
    const newValue = isPatch(newValueOrPatch)
      ? newValueOrPatch(this.value)
      : newValueOrPatch;

    // do not notify subscribers if the value hasn't changed
    if (newValue === this.value) return;

    this.modifiers.forEach((modifier) => modifier(newValue, this.value));

    const oldValue = this.value;
    this.value = newValue;

    this.handlers.forEach((handler) => handler(this.value, oldValue));
  }

  public partialNext = (partial: Partial<T>): void =>
    this.next((current) => ({ ...current, ...partial }));

  public getLatestValue(): T {
    return this.value;
  }
  
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

class MergedStateStore<
  O extends Record<string, unknown>,
  M extends Record<string, unknown>,
> extends StateStore<O & M> {
  public readonly original: StateStore<O>;
  public readonly merged: StateStore<M>;
  private cachedOriginalValue: O;
  private cachedMergedValue: M;

  constructor({ original, merged }: { original: StateStore<O>; merged: StateStore<M> }) {
    const originalValue = original.getLatestValue();
    const mergedValue = merged.getLatestValue();

    super({
      ...originalValue,
      ...mergedValue,
    });

    this.cachedOriginalValue = originalValue;
    this.cachedMergedValue = mergedValue;

    this.original = original;
    this.merged = merged;
  }

  public subscribe(handler: Handler<O & M>) {
    const unsubscribeFunctions: Unsubscribe[] = [];

    // first subscriber will also register helpers which listen to changes of the
    // "original" and "merged" stores, combined outputs will be emitted through super.next
    // whenever cached values do not equal (always apart from the initial subscription)
    // since the actual handler subscription is registered after helpers, the actual
    // handler will run only once
    if (!this.handlers.size) {
      const base = (nextValue: O | M) => {
        super.next((currentValue) => ({
          ...currentValue,
          ...nextValue,
        }));
      };

      unsubscribeFunctions.push(
        this.original.subscribe((nextValue) => {
          if (nextValue === this.cachedOriginalValue) return;
          this.cachedOriginalValue = nextValue;
          base(nextValue);
        }),
        this.merged.subscribe((nextValue) => {
          if (nextValue === this.cachedMergedValue) return;
          this.cachedMergedValue = nextValue;
          base(nextValue);
        }),
      );
    }

    unsubscribeFunctions.push(super.subscribe(handler));

    return () => {
      unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
    };
  }

  public getLatestValue() {
    // if there are no handlers registered to MergedStore then the local value might be out-of-sync
    // pull latest and compare against cached - if they differ, cache latest and produce new combined
    if (!this.handlers.size) {
      const originalValue = this.original.getLatestValue();
      const mergedValue = this.merged.getLatestValue();

      if (
        originalValue !== this.cachedOriginalValue ||
        mergedValue !== this.cachedMergedValue
      ) {
        this.value = {
          ...originalValue,
          ...mergedValue,
        };
        this.cachedMergedValue = mergedValue;
        this.cachedOriginalValue = originalValue;
      }
    }

    return super.getLatestValue();
  }

  // override original methods and "disable" them
  public next = () => {
    console.warn(
      `${MergedStateStore.name}.next is disabled, call original.next or merged.next instead`,
    );
  };
  public partialNext = () => {
    console.warn(
      `${MergedStateStore.name}.partialNext is disabled, call original.partialNext or merged.partialNext instead`,
    );
  };
  public registerModifier() {
    console.warn(
      `${MergedStateStore.name}.registerModifier is disabled, call original.registerModifier or merged.registerModifier instead`,
    );
    return noop;
  }
}

// EXAMPLE:

const Uninitialized = Symbol('uninitialized');

const b = new StateStore<{
  previous: string | null | symbol;
  hasPrevious: boolean | symbol;
}>({
  previous: Uninitialized,
  hasPrevious: Uninitialized,
});

const a = new StateStore<{
  hasNext: boolean | symbol;
  next: string | null | symbol;
}>({
  next: Uninitialized,
  hasNext: Uninitialized,
}).merge(b);

a.original.registerModifier((nextValue) => {
  if (typeof nextValue.next === 'string') {
    nextValue.hasNext = true;
  } else if (nextValue.next === Uninitialized) {
    nextValue.hasNext = Uninitialized;
  } else {
    nextValue.hasNext = false;
  }
});

a.subscribe((ns) => console.log(ns));

a.original.partialNext({ next: 'next' });
a.original.partialNext({ next: null });
a.original.partialNext({ next: Uninitialized });
