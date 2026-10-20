import type { InstanceConfigTree, InstanceSetupFunctionArgs } from './types';

/**
 * The keys that take a setup function. Exported for settings UIs that enumerate the tree; the contents
 * track what this package wires, so they can change in a minor.
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
 * Every key of the declarative tree, including configuration-only ones such as `messagePaginator`
 * (unlike {@link BUILT_IN_INSTANCE_KEYS}). An exhaustive `Record`, so adding a key to
 * {@link InstanceConfigTree} fails the build until it is listed here.
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
 * Dot-paths, per key, read once during construction. Registered after an instance exists they cannot
 * take effect, so the registry warns. `stateThrottleMs` and `debounceMs` are not listed: a late change
 * is re-applied by the config controller's change hook. Exported for settings UIs that flag these paths.
 *
 * @internal
 */
export const CONSTRUCTION_ONLY_CONFIG_PATHS: Readonly<Record<string, readonly string[]>> =
  {
    // The shared key needs its own entry: paths are relative to the key's subtree, and the warning is
    // looked up by top-level key.
    messagePaginator: ['initialCursor', 'initialOffset', 'unreadReferencePolicy'],
    // Consumed while the client is constructed (axios instance, base URL, notification manager).
    // `browser` and `persistUserOnConnectionFailure` are read when needed, so they are not listed.
    client: ['axiosRequestConfig', 'baseURL', 'notificationManager'],
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
