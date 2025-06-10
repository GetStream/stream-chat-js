export type Patch<T> = (value: T) => T;
export type ValueOrPatch<T> = T | Patch<T>;
export type Handler<T> = (nextValue: T, previousValue: T | undefined) => void;
export type Unsubscribe = () => void;
// aliases
export type RemovePreprocessor = Unsubscribe;
export type Preprocessor<T> = Handler<T>;

export const isPatch = <T>(value: ValueOrPatch<T>): value is Patch<T> =>
  typeof value === 'function';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export class StateStore<T extends Record<string, unknown>> {
  protected handlers = new Set<Handler<T>>();
  protected preprocessors = new Set<Preprocessor<T>>();

  constructor(protected value: T) {}

  /**
   * Allows merging two stores only if their keys differ otherwise there's no way to ensure the data type stability.
   * @experimental
   * This method is experimental and may change in future versions.
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

    this.preprocessors.forEach((preprocessor) => preprocessor(newValue, this.value));

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

  /**
   * Registers a preprocessor function that will be called before the state is updated.
   *
   * Preprocessors are invoked with the new and previous values whenever `next` or `partialNext` methods
   * are called, allowing you to mutate or react to the new value before it is set. Preprocessors run in the
   * order they were registered.
   *
   * @example
   * ```ts
   * const store = new StateStore<{ count: number; isMaxValue: bool; }>({ count: 0, isMaxValue: false });
   *
   * store.addPreprocessor((nextValue, prevValue) => {
   *   if (nextValue.count > 10) {
   *     nextValue.count = 10; // Clamp the value to a maximum of 10
   *   }
   *
   *   if (nextValue.count === 10) {
   *     nextValue.isMaxValue = true; // Set isMaxValue to true if count is 10
   *   } else {
   *     nextValue.isMaxValue = false; // Reset isMaxValue otherwise
   *   }
   * });
   *
   * store.partialNext({ count: 15 });
   *
   * store.getLatestValue(); // { count: 10, isMaxValue: true }
   *
   * store.partialNext({ count: 5 });
   *
   * store.getLatestValue(); // { count: 5, isMaxValue: false }
   * ```
   *
   * @param preprocessor - The function to be called with the next and previous values before the state is updated.
   * @returns A `RemovePreprocessor` function that removes the preprocessor when called.
   */
  public addPreprocessor(preprocessor: Preprocessor<T>): RemovePreprocessor {
    this.preprocessors.add(preprocessor);

    return () => {
      this.preprocessors.delete(preprocessor);
    };
  }
}

/**
 * Represents a merged state store that combines two separate state stores into one.
 *
 * The MergedStateStore allows combining two stores with non-overlapping keys.
 * It extends StateStore with the combined type of both source stores.
 * Changes to either the original or merged store will propagate to the combined store.
 *
 * Note: Direct mutations (next, partialNext, addPreprocessor) are disabled on the merged store.
 * You should instead call these methods on the original or merged stores.
 *
 * @template O The type of the original state store
 * @template M The type of the merged state store
 *
 * @experimental
 * This class is experimental and may change in future versions.
 */
export class MergedStateStore<
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

  /**
   * Subscribes to changes in the merged state store.
   *
   * This method extends the base subscribe functionality to handle the merged nature of this store:
   * 1. The first subscriber triggers registration of helper subscribers that listen to both source stores
   * 2. Changes from either source store are propagated to this merged store
   * 3. Source store values are cached to prevent unnecessary updates
   *
   * When the first subscriber is added, the method sets up listeners on both original and merged stores.
   * These listeners update the combined store value whenever either source store changes.
   * All subscriptions (helpers and the actual handler) are tracked so they can be properly cleaned up.
   *
   * @param handler - The callback function that will be executed when the state changes
   * @returns An unsubscribe function that, when called, removes the subscription and any helper subscriptions
   */
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

  /**
   * Retrieves the latest combined state from both original and merged stores.
   *
   * This method extends the base getLatestValue functionality to ensure the merged store
   * remains in sync with its source stores even when there are no active subscribers.
   *
   * When there are no handlers registered, the method:
   * 1. Fetches the latest values from both source stores
   * 2. Compares them with the cached values to detect changes
   * 3. If changes are detected, updates the internal value and caches
   *    the new source values to maintain consistency
   *
   * This approach ensures that calling getLatestValue() always returns the most
   * up-to-date combined state, even if the merged store hasn't been actively
   * receiving updates through subscriptions.
   *
   * @returns The latest combined state from both original and merged stores
   */
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
  public addPreprocessor() {
    console.warn(
      `${MergedStateStore.name}.addPreprocessor is disabled, call original.addPreprocessor or merged.addPreprocessor instead`,
    );
    return noop;
  }
}
