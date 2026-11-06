import type { Unsubscribe } from '@stream-io/state-store';

/**
 * Base class for entities that own event subscriptions. `unregisterSubscriptions` is ref-counted:
 * only the last consumer's call tears the subscriptions down.
 *
 * @internal
 */
export abstract class WithSubscriptions {
  private unsubscribeFunctions: Set<Unsubscribe> = new Set();
  /** Return brand that makes overrides of `unregisterSubscriptions` return the base result. */
  protected static symbol = Symbol(WithSubscriptions.name);
  private refCount = 0;

  public abstract registerSubscriptions(): void;

  /** Whether subscriptions are registered. Guards `registerSubscriptions` against running twice. */
  public get hasSubscriptions() {
    return this.unsubscribeFunctions.size > 0;
  }

  protected addUnsubscribeFunction(unsubscribeFunction: Unsubscribe) {
    this.unsubscribeFunctions.add(unsubscribeFunction);
  }

  protected incrementRefCount() {
    return ++this.refCount;
  }

  /**
   * Overrides must call `super.unregisterSubscriptions()` and return its result.
   *
   * @example
   * ```ts
   * class T extends WithSubscriptions {
   *  ...
   *  public unregisterSubscriptions = () => {
   *    this.customThing();
   *    return super.unregisterSubscriptions();
   *  }
   * }
   * ```
   */
  public unregisterSubscriptions(): typeof WithSubscriptions.symbol {
    if (this.refCount > 1) {
      this.refCount--;
      return WithSubscriptions.symbol;
    }

    this.unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFunctions.clear();
    this.refCount = 0;

    return WithSubscriptions.symbol;
  }
}
