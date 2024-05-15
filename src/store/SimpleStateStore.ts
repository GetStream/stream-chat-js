type Patch<T> = (value: T) => T;
type Handler<T> = (nextValue: T) => any;
type Initiator<T> = (get: SimpleStateStore<T>['getLatestValue'], set: SimpleStateStore<T>['next']) => T;

function isPatch<T>(value: T | Patch<T>): value is Patch<T> {
  return typeof value === 'function';
}
function isInitiator<T>(value: T | Initiator<T>): value is Initiator<T> {
  return typeof value === 'function';
}

export class SimpleStateStore<
  T
  // O extends {
  // 	[K in keyof T]: T[K] extends Function ? K : never;
  // }[keyof T] = never
> {
  private value: T;
  private handlerSet = new Set<Handler<T>>();

  constructor(initialValueOrInitiator: T | Initiator<T>) {
    this.value = isInitiator<T>(initialValueOrInitiator)
      ? initialValueOrInitiator(this.getLatestValue, this.next)
      : initialValueOrInitiator;
  }

  public next = (newValueOrPatch: T | Patch<T>) => {
    // newValue (or patch output) should never be mutated previous value
    const newValue = isPatch(newValueOrPatch) ? newValueOrPatch(this.value) : newValueOrPatch;

    // do not notify subscribers if the value hasn't changed (or mutation has been returned)
    if (newValue === this.value) return;
    this.value = newValue;

    this.handlerSet.forEach((handler) => handler(this.value));
  };

  public getLatestValue = () => this.value;

  // TODO: filter and return actions (functions) only in a type-safe manner (only allows state T to be a dict)
  // public get actions(): { [K in O]: T[K] } {
  // 	return {};
  // }
  public get actions() {
    return this.value;
  }

  public subscribe = (handler: Handler<T>) => {
    handler(this.value);
    this.handlerSet.add(handler);
    return () => {
      this.handlerSet.delete(handler);
    };
  };

  public subscribeWithSelector = <O extends readonly unknown[]>(selector: (nextValue: T) => O, handler: Handler<O>) => {
    let selectedValues = selector(this.value);

    const wrappedHandler: Handler<T> = (nextValue) => {
      const newlySelectedValues = selector(nextValue);

      const hasUnequalMembers = selectedValues.some((value, index) => value !== newlySelectedValues[index]);

      if (hasUnequalMembers) {
        selectedValues = newlySelectedValues;
        handler(newlySelectedValues);
      }
    };

    return this.subscribe(wrappedHandler);
  };
}

// const a = new SimpleStateStore({ string: 'aaa', b: 123 });

// a.subscribeWithSelector(
//   (nv) => [nv.b, nv.string] as const,
//   ([a, b]) => console.log(),
// );
