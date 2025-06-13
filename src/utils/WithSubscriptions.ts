import type { Unsubscribe } from '../store';

/**
 * @private
 * Class to use as a template for subscribable entities.
 */
export abstract class WithSubscriptions {
  private unsubscribeFunctions: Set<Unsubscribe> = new Set();
  /**
   * Workaround for the missing TS keyword - ensures that inheritants
   * overriding `unregisterSubscriptions` call the base method and return
   * its unique symbol value.
   */
  protected static symbol = Symbol(WithSubscriptions.name);
  private refCount = 0;

  public abstract registerSubscriptions(): void;

  /**
   * Returns a boolean, provides information of whether `registerSubscriptions`
   * method has already been called for this instance.
   */
  public get hasSubscriptions() {
    return this.unsubscribeFunctions.size > 0;
  }

  protected addUnsubscribeFunction(unsubscribeFunction: Unsubscribe) {
    this.unsubscribeFunctions.add(unsubscribeFunction);
  }

  /**
   * Increments `refCount` by one and returns new value.
   */
  protected incrementRefCount() {
    return ++this.refCount;
  }

  /**
   * If you re-declare `unregisterSubscriptions` method within your class
   * make sure to run the original too.
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
