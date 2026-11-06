import { isWalkableRecord } from '../../utils/objectPath';

/** `copies` maps each source object to its copy, so cycles and shared references survive. */
const copyInto = <T>(value: T, copies: WeakMap<object, unknown>): T => {
  if (Array.isArray(value)) {
    if (copies.has(value)) return copies.get(value) as T;

    const copy: unknown[] = [];
    // Registered before walking the entries, so a cycle finds the copy.
    copies.set(value, copy);
    for (const entry of value) copy.push(copyInto(entry, copies));
    return copy as unknown as T;
  }

  // Plain objects only: class instances, Dates and RegExps are opaque (see `isWalkableRecord`).
  if (typeof value === 'object' && value !== null) {
    if (!isWalkableRecord(value)) return value;
    if (copies.has(value)) return copies.get(value) as T;

    const copy: Record<string | symbol, unknown> = {};
    copies.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
      if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
      copy[key] = copyInto((value as Record<string | symbol, unknown>)[key], copies);
    }
    return copy as T;
  }

  return value;
};

/**
 * Copies a caller-supplied configuration patch so the stored value shares no mutable object with the
 * caller (`mergeWith` reuses source subtrees verbatim). Plain objects and arrays are copied; everything
 * else (functions, `Date`s, class instances) passes through by reference. Not `structuredClone`, which
 * throws on the functions configuration holds. Cycles terminate and shared references stay shared.
 *
 * @internal
 */
export const copyConfigPatch = <T>(value: T): T => copyInto(value, new WeakMap());
