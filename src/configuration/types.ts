import type { StreamChat } from '../client';
import type { MessageComposer } from '../messageComposer';
import type { MessageComposerConfig } from '../messageComposer/configuration/types';
import type { Channel, ChannelInstanceConfig } from '../channel';
import type { Thread, ThreadInstanceConfig } from '../thread';
import type { ReminderManagerConfig } from '../reminders/ReminderManager';
import type { NotificationManagerConfig } from '../notifications/types';
import type { MessageDeliveryReporterConfig } from '../messageDelivery/MessageDeliveryReporter';
import type { ThreadManagerConfig } from '../thread_manager';
import type { MessageOperationsConfig } from '../messageOperations/MessageOperations';
import type { DeclarativePaginatorConfig as ImportedDeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import type { DeepPartial } from '../types.utility';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/**
 * Maps a configuration key to the argument its setup function receives.
 *
 * Augment this interface to register a key for a class this package does not know about — the same
 * module-augmentation pattern used by the `Custom*Data` interfaces in `custom_types.ts`:
 *
 * ```ts
 * declare module 'stream-chat' {
 *   interface InstanceSetupFunctionArgs {
 *     myWidget: { widget: MyWidget };
 *   }
 * }
 * ```
 */
export interface InstanceSetupFunctionArgs {
  channel: { channel: Channel };
  client: { client: StreamChat };
  messageComposer: { composer: MessageComposer };
  thread: { thread: Thread };
}

/** The four built-in keys, plus any key an integrator or a downstream SDK registers. */
export type InstanceSetupKey = keyof InstanceSetupFunctionArgs | (string & {});

/**
 * The keys this package wires itself. Used to scope diagnostics — never to reject a caller's key,
 * which would defeat the point of an open key space.
 */
export const BUILT_IN_INSTANCE_KEYS: readonly (keyof InstanceSetupFunctionArgs)[] = [
  'channel',
  'client',
  'messageComposer',
  'thread',
];

/**
 * Every key of the declarative configuration tree.
 *
 * Distinct from {@link BUILT_IN_INSTANCE_KEYS}, which lists keys that take a *setup function* — that set
 * omits `messagePaginator`, which is configuration-only. Typed as an exhaustive `Record` rather than a
 * bare array so adding a key to {@link InstanceConfigTree} fails the build until it is listed here, which
 * is what keeps the two from drifting.
 */
const INSTANCE_CONFIG_TREE_KEY_PRESENCE: Record<keyof InstanceConfigTree, true> = {
  channel: true,
  client: true,
  messageComposer: true,
  messageOperations: true,
  messagePaginator: true,
  thread: true,
};

export const INSTANCE_CONFIG_TREE_KEYS = Object.keys(
  INSTANCE_CONFIG_TREE_KEY_PRESENCE,
).sort() as readonly (keyof InstanceConfigTree)[];

// ---------------------------------------------------------------------------
// Tier 2 — setup functions
// ---------------------------------------------------------------------------

export type InstanceSetupFunctionArgsOf<K extends string> =
  K extends keyof InstanceSetupFunctionArgs
    ? InstanceSetupFunctionArgs[K]
    : Record<string, unknown>;

export type InstanceSetupTearDownFunction = () => void;

/**
 * Runs against every instance of its class — those that already exist when it is registered, and
 * every one created afterwards. Return a function that undoes whatever you changed: it is invoked
 * before the setup function is re-applied, and when the instance is disposed of.
 */
export type InstanceSetupFunction<K extends string = InstanceSetupKey> = (
  args: InstanceSetupFunctionArgsOf<K>,
) => void | InstanceSetupTearDownFunction;

export type InstanceSetupState<K extends string = InstanceSetupKey> = {
  setupFunction: InstanceSetupFunction<K> | null;
};

// ---------------------------------------------------------------------------
// Tier 1 — declarative configuration
// ---------------------------------------------------------------------------

/** Whether `jumpToTheFirstUnreadMessage` prefers the paginator's snapshot or the channel read state. */
export type UnreadReferencePolicy = 'snapshot' | 'read-state-only';

/**
 * Paginator fields settable through the declarative tree. Single source of truth lives with the
 * paginator itself (`DeclarativePaginatorConfig` in `BasePaginator`), so the tree and the paginator's
 * own `initializeConfig` can never accept different sets of fields.
 *
 * Deliberately excluded there:
 * - `itemIndex` / `createItemIndex` — an index instance and a factory, not configuration. Deep-merging
 *   a class instance is unsound, and swapping an index would drop already-loaded items.
 * - `doRequest`, `itemOrderComparator`, `deriveCursor` — installed per paginator subclass
 *   (`PinnedMessagePaginator` supplies all three). Replace them through a setup function, where the
 *   existing value is visible and restorable.
 *
 * `initialCursor` and `initialOffset` are included but read only during construction — see
 * {@link CONSTRUCTION_ONLY_CONFIG_PATHS}.
 */
export type { DeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';

/** Adds the message-list-only unread reference policy, which is a constructor argument. */
export type DeclarativeMessagePaginatorConfig = ImportedDeclarativePaginatorConfig & {
  unreadReferencePolicy?: UnreadReferencePolicy;
};

export type ChannelDeclarativeConfig = {
  /** Overrides the shared top-level `messageOperations` key for channels only. */
  messageOperations?: Partial<MessageOperationsConfig>;
  messagePaginator?: DeclarativeMessagePaginatorConfig;
  pinnedMessagesPaginator?: ImportedDeclarativePaginatorConfig;
  requestHandlers?: ChannelInstanceConfig['requestHandlers'];
};

export type ThreadDeclarativeConfig = {
  /** Overrides the shared top-level `messageOperations` key for thread replies only. */
  messageOperations?: Partial<MessageOperationsConfig>;
  messagePaginator?: DeclarativeMessagePaginatorConfig;
  requestHandlers?: ThreadInstanceConfig['requestHandlers'];
};

export type ClientDeclarativeConfig = {
  /**
   * Nested rather than top-level keys: each of these managers has exactly one parent — the client — so
   * there is nothing to say once and reuse, which is what a top-level key buys (**DEC-25**).
   */
  messageDelivery?: Partial<MessageDeliveryReporterConfig>;
  threads?: Partial<ThreadManagerConfig>;
  notifications?: DeepPartial<NotificationManagerConfig>;
  /**
   * `Partial`, not `DeepPartial`: `scheduledOffsetsMs` is a `number[]`, and `DeepPartial` would widen
   * its elements to `number | undefined`, which `ReminderManager.updateConfig` rightly rejects.
   */
  reminders?: Partial<ReminderManagerConfig>;
};

/**
 * Maps a configuration key to its declarative configuration subtree. Augmentable alongside
 * {@link InstanceSetupFunctionArgs}, so a custom key gets declarative configuration on the same terms
 * as a built-in one.
 *
 * **When something gets its own key rather than being nested under a parent** — the rule that decides
 * the shape of this interface:
 *
 * - **One parent type ⇒ nest it.** `channel.pinnedMessagesPaginator`, `channel.cooldownTimer`, the
 *   composer's own sub-managers. There is only one place it can be reached from.
 * - **Several parent types, and the configuration means the same thing under each ⇒ own key.**
 *   `MessageComposer` hangs off a `Channel`, a `Thread`, *and* a message (the React SDK builds
 *   message-scoped composers for editing). `drafts.enabled` means the same in all three, so nesting it
 *   under `channel` would silently miss two thirds of the composers.
 * - **Several parent types, but the configuration is inherently parent-specific ⇒ nest it anyway.**
 *   No built-in falls here today. It is kept as a case because it is the one that decides against a shared
 *   key, and the next entity to arrive may need it.
 * - **Several parent types, mixed ⇒ both.** A shared top-level key for what means the same thing, plus
 *   per-parent paths that override it field by field (see {@link mergeDeclarativeMessageOperationsConfig}).
 *   Both shared keys are here: `MessagePaginator` backs the channel message list *and* thread replies
 *   (`stateThrottleMs` / `retryCount` have no reason to differ, `pageSize` legitimately does), and
 *   `MessageOperations` backs channel *and* thread sends. `messageOperations` was briefly nested under
 *   `channel` on the reasoning that a channel send and a thread reply are different operations — which made
 *   `thread.messageOperations` unconfigurable entirely (**DV-15**). Counting parents is the check.
 */
export interface InstanceConfigTree {
  channel: ChannelDeclarativeConfig;
  client: ClientDeclarativeConfig;
  messageComposer: DeepPartial<MessageComposerConfig>;
  /**
   * Applies to **every** `MessageOperations` — the channel's and every thread's, since messages are sent
   * from both. `channel.messageOperations` and `thread.messageOperations` override it per parent.
   */
  messageOperations: Partial<MessageOperationsConfig>;
  /**
   * Applies to **every** `MessagePaginator` — the channel message list and thread replies alike.
   * `channel.messagePaginator` and `thread.messagePaginator` override it per parent.
   *
   * `channel.pinnedMessagesPaginator` is deliberately **not** included: it has a single parent, so by
   * the rule above it stays nested. It is also a different class (`PinnedMessagePaginator`, with its own
   * ordering and endpoint) rather than a `MessagePaginator`.
   */
  messagePaginator: DeclarativeMessagePaginatorConfig;
  thread: ThreadDeclarativeConfig;
}

export type InstanceConfigOf<K extends string> = K extends keyof InstanceConfigTree
  ? InstanceConfigTree[K]
  : Record<string, unknown>;

export type InstanceConfigState<K extends string = InstanceSetupKey> = {
  config: DeepPartial<InstanceConfigOf<K>> | null;
};

/**
 * Layers a per-parent slice of a **shared** configuration key over the shared one, field by field.
 *
 * Two keys are shared between `Channel` and `Thread` — `messagePaginator` and `messageOperations`
 * (**DEC-25**, **DV-15**) — because both entities own one of each and most of the settings mean the same
 * thing under either parent. The shared key carries what is common; the per-parent slice overrides only the
 * fields it names.
 *
 * Fields the specific slice does not mention — including ones it sets to `undefined` explicitly — fall
 * through to the shared slice, so `{ messagePaginator: { pageSize: 50 } }` is not undone by a
 * `channel.messagePaginator` slice that only names `stateThrottleMs`. That `undefined` skip is the whole
 * reason this is not a plain object spread.
 *
 * One level deep on purpose: every field on both config types is a scalar or a function, so there is no
 * nested object for a deep merge to reach. Use `mergeWith` if that stops being true.
 */
const mergeDeclarativeSlice = <TConfig extends object>(
  general?: TConfig,
  specific?: TConfig,
): TConfig | undefined => {
  if (!general) return specific;
  if (!specific) return general;

  const merged: TConfig = { ...general };
  for (const [key, value] of Object.entries(specific)) {
    if (typeof value === 'undefined') continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
};

/** Layers `channel.messageOperations` / `thread.messageOperations` over the shared `messageOperations` key. */
export const mergeDeclarativeMessageOperationsConfig = (
  general?: Partial<MessageOperationsConfig>,
  specific?: Partial<MessageOperationsConfig>,
): Partial<MessageOperationsConfig> | undefined =>
  mergeDeclarativeSlice(general, specific);

/** Layers `channel.messagePaginator` / `thread.messagePaginator` over the shared `messagePaginator` key. */
export const mergeDeclarativePaginatorConfig = (
  general?: DeclarativeMessagePaginatorConfig,
  specific?: DeclarativeMessagePaginatorConfig,
): DeclarativeMessagePaginatorConfig | undefined =>
  mergeDeclarativeSlice(general, specific);

/**
 * Dot-paths, per key, that are read once during construction. Configuration registered *before* an
 * instance is built reaches these through constructor options; registered afterwards it cannot, so the
 * appliers warn rather than fail silently.
 *
 * `stateThrottleMs` and `debounceMs` are read once too but are **not** listed, because the paginators
 * expose rebuild methods (`setStateThrottleOptions`, `setDebounceOptions`) that make a late change
 * take effect.
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

// ---------------------------------------------------------------------------
// Compatibility surface
// ---------------------------------------------------------------------------

// Only the `MessageComposer` key ever functioned: the `StreamChat`, `Channel` and `Thread` setup
// functions were stored and never invoked, so no working code can have depended on their types. Aliases
// for those were removed rather than deprecated — a type error is the signal that tells someone their
// setup function was dead. v10 is a major, so this is the moment for that.

/** @deprecated Use {@link InstanceSetupTearDownFunction}. */
export type MessageComposerTearDownFunction = InstanceSetupTearDownFunction;
/** @deprecated Use `InstanceSetupFunction<'messageComposer'>`. */
export type MessageComposerSetupFunction = InstanceSetupFunction<'messageComposer'>;
/** @deprecated Use `InstanceSetupState<'messageComposer'>`. */
export type MessageComposerSetupState = InstanceSetupState<'messageComposer'>;
