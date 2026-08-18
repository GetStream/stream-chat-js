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
 * @internal
 */
export const copyConfigPatch = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => copyConfigPatch(entry)) as unknown as T;
  }

  // Plain objects only. A class instance, a Date or a RegExp is an opaque value here — see
  // `isWalkableRecord`, which draws the same line for dot-path access.
  if (typeof value === 'object' && value !== null) {
    if (!isWalkableRecord(value)) return value;

    const copy: Record<string | symbol, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
      copy[key] = copyConfigPatch((value as Record<string | symbol, unknown>)[key]);
    }
    return copy as T;
  }

  return value;
};
