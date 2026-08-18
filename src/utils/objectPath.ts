/**
 * Dot-path access over **plain-object trees**, with presence and value as separate questions.
 *
 * The pair exists because {@link getPath} alone cannot answer "was this path registered?". A configuration
 * patch may carry an explicit `undefined` — `{ messagePaginator: { initialCursor: undefined } }` — and a
 * caller that has to tell that apart from an absent key needs {@link hasPath}, since both read back as
 * `undefined`. That distinction is the whole reason the construction-only diagnostic in
 * `InstanceConfigurationRegistry` can report a late registration at all.
 *
 * **Descends into plain objects only**, deliberately. A configuration tree holds class instances
 * (`itemIndex`), functions and arrays as leaf *values*, and walking into their internals would be both
 * meaningless and slow — `hasPath(config, 'messagePaginator.initialCursor')` must not start indexing an
 * `ItemIndex`.
 *
 * **Three other dot-path walkers exist in this package and none is a drop-in replacement**, which is worth
 * knowing before adding a fourth:
 *
 * - `get` in `src/utils.ts` (module-private, backs `uniqBy`) returns `undefined` for a missing path *and* for
 *   a present-but-undefined one, so it cannot express `hasPath`. It also descends on
 *   `typeof acc === 'object'`, which includes arrays and class instances.
 * - `resolveDotPathValue` in `src/pagination/utility.normalization.ts` (backs the filter compiler)
 *   short-circuits on any falsy intermediate value, so `''.length` resolves to `undefined` rather than `0`.
 *   Its declared return type is `unknown[]` while it returns `unknown`.
 * - `examples/vite`'s Configuration tab carries a segment-array variant identical in behaviour to this one.
 *
 * Consolidating those is a separate change: two of them are load-bearing for unrelated subsystems, and the
 * filter compiler's falsy short-circuit is a behaviour difference rather than a refactor.
 *
 * @internal
 */

/**
 * A record this module is willing to walk into: an object literal or `Object.create(null)`, and nothing
 * else. Arrays, `Date`s, `RegExp`s and class instances are configuration *values*, not interiors.
 *
 * The prototype check is what makes that true. A `typeof value === 'object' && !Array.isArray(value)` test —
 * which is what this and the three sibling walkers all used — happily descends into a class instance, so
 * `hasPath(config, 'itemIndex.length')` answered `true` for a path that is not configuration at all.
 */
export const isWalkableRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Whether a dot-path is present. A key explicitly set to `undefined` counts as present — that is the point
 * of having this alongside {@link getPath}.
 */
export const hasPath = (source: Record<string, unknown>, path: string): boolean => {
  const [head, ...rest] = path.split('.');
  if (!(head in source)) return false;
  if (rest.length === 0) return true;
  const next = source[head];
  return isWalkableRecord(next) ? hasPath(next, rest.join('.')) : false;
};

/**
 * The value at a dot-path, or `undefined` when the path is absent. Pair with {@link hasPath} when the two
 * cases have to be told apart.
 */
export const getPath = (source: Record<string, unknown>, path: string): unknown => {
  const [head, ...rest] = path.split('.');
  const next = source[head];
  if (rest.length === 0) return next;
  return isWalkableRecord(next) ? getPath(next, rest.join('.')) : undefined;
};
