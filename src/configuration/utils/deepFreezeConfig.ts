/**
 * Recursively freezes a package-level default configuration object.
 *
 * **Why a runtime guard rather than a type.** Resolved configuration is built by deep-merging over these
 * constants, and the merge only *copies* a subtree that some layer actually touches — so a subtree nobody
 * configured stays identical by reference to the module-level default, and is reachable through the
 * instance's public `config` getter. A write through it therefore changed the default for every instance
 * of every client in the process, including ones created afterwards. `Readonly<T>` cannot catch that: it
 * is shallow, so it rejects `config.pageSize = 5` but accepts `config.drafts.enabled = true` — and the
 * nested form is the one that reaches shared state. In ESM, which is always strict, a write to a frozen
 * object throws a `TypeError` at the offending line instead of silently succeeding somewhere else.
 *
 * Deliberately lives in its own module rather than `src/utils.ts`: that barrel is `vi.mock`ed wholesale by
 * some suites, and a default-config constant must not depend on which of its exports a test happens to
 * stub.
 *
 * Functions are frozen as values but not walked — a function's `prototype` is not configuration. Freezing
 * is idempotent and stops at anything already frozen, so shared sub-configs cost one visit.
 *
 * @internal
 */
export const deepFreezeConfig = <T>(value: T): Readonly<T> => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreezeConfig(nested);
  }

  return value as Readonly<T>;
};
