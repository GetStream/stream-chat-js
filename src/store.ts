export type Patch<T> = (value: T) => T;
export type ValueOrPatch<T> = T | Patch<T>;
export type Handler<T> = (nextValue: T, previousValue: T | undefined) => void;
export type Unsubscribe = () => void;

export const isPatch = <T>(value: ValueOrPatch<T>): value is Patch<T> =>
  typeof value === 'function';

export class StateStore<T extends Record<string, unknown>> {
  private handlerSet = new Set<Handler<T>>();

  constructor(private value: T) {}

  public next = (newValueOrPatch: ValueOrPatch<T>): void => {
    // newValue (or patch output) should never be mutated previous value
    const newValue = isPatch(newValueOrPatch)
      ? newValueOrPatch(this.value)
      : newValueOrPatch;

    // do not notify subscribers if the value hasn't changed
    if (newValue === this.value) return;

    const oldValue = this.value;
    this.value = newValue;

    this.handlerSet.forEach((handler) => handler(this.value, oldValue));
  };

  public partialNext = (partial: Partial<T>): void =>
    this.next((current) => ({ ...current, ...partial }));

  public getLatestValue = (): T => this.value;

  public subscribe = (handler: Handler<T>): Unsubscribe => {
    handler(this.value, undefined);
    this.handlerSet.add(handler);
    return () => {
      this.handlerSet.delete(handler);
    };
  };

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
}
