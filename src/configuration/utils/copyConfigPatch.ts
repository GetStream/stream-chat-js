import { isWalkableRecord } from '../../utils/objectPath';

/**
 * Copies a caller-supplied configuration patch, so the value the SDK stores shares no mutable object with
 * the caller.
 *
 * **Why this exists.** `mergeWith` reuses a source subtree verbatim when the target has nothing at that key
 * (`createNewTarget` returns `srcValue`), and the declarative registry's target starts empty — so the first
 * `client.config.set({ messageComposer: patch })` left `getConfig('messageComposer').text === patch.text`.
 * Two consequences, both silent: mutating `patch.text` afterwards changed resolved configuration behind
 * every live instance's back with no notification, and the registry held the caller's objects for the
 * client's lifetime.
 *
 * **Why not `structuredClone`.** Configuration is not JSON — `commands.sendValidator`,
 * `attachments.fileUploadFilter`, `linkPreviews.findURLFn`, `location.getDeviceId`,
 * `messagePaginator.hasPaginationQueryShapeChanged` and every `requestHandlers` entry are functions, and
 * `structuredClone` throws on them.
 *
 * So: plain objects and arrays are copied, and everything else is passed through by reference —
 * functions, `Date`s, `RegExp`s, class instances. Those are values a caller *hands over* rather than a
 * structure the SDK merges into, and copying them would be wrong as well as impossible: a cloned
 * `ItemIndex` would not be the index the paginator loaded items into.
 *
 * **Repeated objects are copied once.** Every object copied is remembered, so a graph that points back at
 * itself terminates instead of overflowing the stack — reachable from `client.config.set()` and
 * `updateConfig`, both of which take an object an integrator built. The same bookkeeping keeps two
 * references to one object as two references to one copy, rather than duplicating it.
 *
 * @internal
 */
const copyInto = <T>(value: T, copies: WeakMap<object, unknown>): T => {
  if (Array.isArray(value)) {
    if (copies.has(value)) return copies.get(value) as T;

    const copy: unknown[] = [];
    // Registered before the entries are walked, so an entry pointing back at this array finds the copy
    // instead of recursing forever.
    copies.set(value, copy);
    for (const entry of value) copy.push(copyInto(entry, copies));
    return copy as unknown as T;
  }

  // Plain objects only. A class instance, a Date or a RegExp is an opaque value here — see
  // `isWalkableRecord`, which draws the same line for dot-path access.
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

export const copyConfigPatch = <T>(value: T): T => copyInto(value, new WeakMap());
