/**
 * Dot-path access over plain-object trees. `hasPath` tells an explicit `undefined` from an absent
 * key, which `getPath` cannot.
 *
 * Descends into plain objects only: arrays, class instances and functions are leaf values.
 *
 * @internal
 */

/** An object literal or `Object.create(null)`. Arrays, Dates and class instances are leaves. */
export const isWalkableRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Whether a dot-path is present. A key set to `undefined` counts as present. */
export const hasPath = (source: Record<string, unknown>, path: string): boolean => {
  const [head, ...rest] = path.split('.');
  if (!(head in source)) return false;
  if (rest.length === 0) return true;
  const next = source[head];
  return isWalkableRecord(next) ? hasPath(next, rest.join('.')) : false;
};

/** The value at a dot-path, or `undefined` when absent. Use {@link hasPath} to tell them apart. */
export const getPath = (source: Record<string, unknown>, path: string): unknown => {
  const [head, ...rest] = path.split('.');
  const next = source[head];
  if (rest.length === 0) return next;
  return isWalkableRecord(next) ? getPath(next, rest.join('.')) : undefined;
};
