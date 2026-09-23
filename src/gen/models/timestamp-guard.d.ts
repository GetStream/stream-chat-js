import type { TimestampNS } from './index';

/**
 * Makes `new Date(ns)` a deprecated constructor, and a compile error for a server-sent nanosecond timestamp.
 *
 * Any tsconfig whose `include` covers this directory picks this file up; `exclude` it to defer.
 *
 * The `0 extends 1 & T` guard excludes `any`. Without it this overload would capture
 * every `new Date(<any>)` in the program -- `any` is assignable to the brand, and a
 * merged declaration is tried before lib.es5.d.ts -- breaking each `JSON.parse` path
 * and index-signature read on the next regeneration.
 */
declare global {
  interface DateConstructor {
    /**
     * @deprecated Unix nanoseconds, not milliseconds. Use SDK's provided nsToDate(t), or nsToMs(t) for arithmetic.
     */
    new <T extends TimestampNS>(
      t: 0 extends 1 & T ? never : T,
    ): {
      readonly ERROR_use_SDKs_nsToDate_helper_instead: never;
    };
  }
}
