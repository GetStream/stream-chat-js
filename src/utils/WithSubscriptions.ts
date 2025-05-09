import type { Unsubscribe } from '../store';

/**
 * @private
 * Class to use as a template for subscribable entities.
 */
export abstract class WithSubscriptions {
  private unsubscribeFunctions: Set<Unsubscribe> = new Set();
  private unSubscribeFunctionsMap: Map<string, Unsubscribe> = new Map();
  /**
   * Workaround for the missing TS keyword - ensures that inheritants
   * overriding `unregisterSubscriptions` call the base method and return
   * its unique symbol value.
   */
  private static symbol = Symbol(WithSubscriptions.name);

  public abstract registerSubscriptions(): void;

  /**
   * Returns a boolean, provides information of whether `registerSubscriptions`
   * method has already been called for this instance.
   */
  public get hasSubscriptions() {
    return this.unsubscribeFunctions.size > 0 || this.unSubscribeFunctionsMap.size > 0;
  }

  public addUnsubscribeFunction(unsubscribeFunction: Unsubscribe, key?: string) {
    if (key) {
      this.unSubscribeFunctionsMap.set(key, unsubscribeFunction);
    } else {
      this.unsubscribeFunctions.add(unsubscribeFunction);
    }
  }

  /**
   * Unregisters a subscription by key. Only subscriptions registered with a key will be unregistered.
   * @param key - The key of the subscription to unregister.
   */
  public unregisterSubscriptionsByKey(key: string) {
    const unsubscribeFunction = this.unSubscribeFunctionsMap.get(key);
    if (unsubscribeFunction) {
      unsubscribeFunction();
      this.unSubscribeFunctionsMap.delete(key);
    }
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
    this.unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFunctions.clear();
    this.unSubscribeFunctionsMap.forEach((unsubscribe) => unsubscribe());
    this.unSubscribeFunctionsMap.clear();

    return WithSubscriptions.symbol;
  }
}
