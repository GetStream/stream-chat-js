import type { InstanceConfigTree, InstanceSetupFunctionArgs } from './types';

/**
 * The configuration key space, as values rather than types — which is why these live here and not in
 * `types.ts`: that module is types only, and a constant in it is invisible to anyone scanning for
 * runtime behaviour.
 */

/**
 * The keys this package wires itself, i.e. the ones that take a setup function. Used to scope
 * diagnostics only; the key space is closed by the types, so there is nothing here to reject.
 *
 * Exported for the settings UI in `examples/vite`, which enumerates the tree. Diagnostics rather than
 * API: the contents track whatever this package happens to wire, so they can change in a minor.
 *
 * @internal
 */
export const BUILT_IN_INSTANCE_KEYS: readonly (keyof InstanceSetupFunctionArgs)[] = [
  'channel',
  'client',
  'liveLocationManager',
  'messageComposer',
  'searchController',
  'thread',
];

/**
 * Every key of the declarative configuration tree.
 *
 * Distinct from {@link BUILT_IN_INSTANCE_KEYS}, which lists keys that take a *setup function* — that set
 * omits `messagePaginator`, which is configuration-only. Typed as an exhaustive `Record` rather than a
 * bare array so adding a key to {@link InstanceConfigTree} fails the build until it is listed here, which
 * is what keeps the two from drifting.
 *
 * The exported array is diagnostics, not API — a new key is a minor, and this list grows with it.
 *
 * @internal
 */
const INSTANCE_CONFIG_TREE_KEY_PRESENCE: Record<keyof InstanceConfigTree, true> = {
  channel: true,
  client: true,
  liveLocationManager: true,
  messageComposer: true,
  messageOperations: true,
  messagePaginator: true,
  searchController: true,
  thread: true,
};

export const INSTANCE_CONFIG_TREE_KEYS = Object.keys(
  INSTANCE_CONFIG_TREE_KEY_PRESENCE,
).sort() as readonly (keyof InstanceConfigTree)[];

/**
 * Dot-paths, per key, that are read once during construction. Configuration registered *before* an
 * instance is built reaches these through constructor options; registered afterwards it cannot, so the
 * appliers warn rather than fail silently.
 *
 * `stateThrottleMs` and `debounceMs` are read once too but are **not** listed, because a late change to
 * either is re-applied by the config controller's change hook.
 *
 * Exported for the settings UI, which flags these paths. Diagnostics rather than API: the set tracks
 * which fields happen to be read once, so it can change in a minor.
 *
 * @internal
 */
export const CONSTRUCTION_ONLY_CONFIG_PATHS: Readonly<Record<string, readonly string[]>> =
  {
    // The shared key needs its own entry: paths here are relative to the key's own subtree, and the
    // warning is looked up by top-level key. Without this, setting `unreadReferencePolicy` through
    // `messagePaginator` was silent while the identical field under `channel`/`thread` warned — the same
    // read-once field, warned through one route and not the other.
    messagePaginator: ['initialCursor', 'initialOffset', 'unreadReferencePolicy'],
    channel: [
      'messagePaginator.initialCursor',
      'messagePaginator.initialOffset',
      'messagePaginator.unreadReferencePolicy',
      'pinnedMessagesPaginator.initialCursor',
      'pinnedMessagesPaginator.initialOffset',
    ],
    thread: [
      'messagePaginator.initialCursor',
      'messagePaginator.initialOffset',
      'messagePaginator.unreadReferencePolicy',
    ],
  };
