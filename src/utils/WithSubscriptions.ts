import type { Unsubscribe } from '../store';

/**
 * @private
 * Class to use as a template for subscribable entities.
 */
export abstract class WithSubscriptions {
  private unsubscribeFunctions: Set<Unsubscribe> = new Set();

  public abstract registerSubscriptions(): void;

  /**
   * Returns a boolean, provides information of whether `registerSubscriptions`
   * method has already been called for this instance.
   */
  public get hasSubscriptions() {
    return this.unsubscribeFunctions.size > 0;
  }

  public addUnsubscribeFunction(unsubscribeFunction: Unsubscribe) {
    this.unsubscribeFunctions.add(unsubscribeFunction);
  }

  /**
   * If you re-declare `unregisterSubscriptions` method within your class
   * make sure to run the original too.
   *
   * @example 
   * ```ts
   * class T {
   *  public unregisterSubscriptions = () => {
   *    super.unregisterSubscriptions();
   *    this.customThing();
   *  }
   * }
   * ```
   */
  public unregisterSubscriptions() {
    this.unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFunctions.clear();
  }
}
