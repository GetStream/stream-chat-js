/**
 * Recursively freezes a package-level default configuration. Resolved config shares untouched subtrees
 * with these defaults, so an unfrozen nested write through `config` would change them for every instance
 * in the process (`Readonly<T>` is shallow and cannot catch it). Functions are left as they are.
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
