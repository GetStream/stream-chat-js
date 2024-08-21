export type Patch<T> = (value: T) => T;
export type Handler<T> = (nextValue: T, previousValue: T | undefined) => void;
export type Unsubscribe = () => void;

function isPatch<T>(value: T | Patch<T>): value is Patch<T> {
  return typeof value === 'function';
}

export class StateStore<T extends Record<string, unknown>> {
  private handlerSet = new Set<Handler<T>>();

  constructor(private value: T) {}

  public next = (newValueOrPatch: T | Patch<T>): void => {
    // newValue (or patch output) should never be mutated previous value
    const newValue = isPatch(newValueOrPatch) ? newValueOrPatch(this.value) : newValueOrPatch;

    // do not notify subscribers if the value hasn't changed
    if (newValue === this.value) return;

    const oldValue = this.value;
    this.value = newValue;

    this.handlerSet.forEach((handler) => handler(this.value, oldValue));
  };

  public partialNext = (partial: Partial<T>): void => this.next((current) => ({ ...current, ...partial }));

  public getLatestValue = (): T => this.value;

  public subscribe = (handler: Handler<T>): Unsubscribe => {
    handler(this.value, undefined);
    this.handlerSet.add(handler);
    return () => {
      this.handlerSet.delete(handler);
    };
  };

  public subscribeWithSelector = <O extends readonly unknown[]>(selector: (nextValue: T) => O, handler: Handler<O>) => {
    // begin with undefined to reduce amount of selector calls
    let selectedValues: O | undefined;

    const wrappedHandler: Handler<T> = (nextValue) => {
      const newlySelectedValues = selector(nextValue);
      const hasUpdatedValues = selectedValues?.some((value, index) => value !== newlySelectedValues[index]) ?? true;

      if (!hasUpdatedValues) return;

      const oldSelectedValues = selectedValues;
      selectedValues = newlySelectedValues;

      handler(newlySelectedValues, oldSelectedValues);
    };

    return this.subscribe(wrappedHandler);
  };
}
