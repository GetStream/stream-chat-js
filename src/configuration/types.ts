import type { StreamChat } from '../client';
import type {
  LiveLocationManager,
  LiveLocationManagerConfig,
} from '../LiveLocationManager';
import type {
  SearchController,
  SearchControllerConfig,
} from '../search/SearchController';
import type { MessageComposer } from '../messageComposer';
import type { MessageComposerConfig } from '../messageComposer/configuration/types';
import type { Channel, ChannelConfig } from '../channel';
import type { Thread, ThreadConfig } from '../thread';
import type { ReminderManagerConfig } from '../reminders/ReminderManager';
import type { NotificationManagerConfig } from '../notifications/types';
import type { MessageDeliveryReporterConfig } from '../messageDelivery/MessageDeliveryReporter';
import type { ThreadManagerConfig } from '../thread_manager';
import type { ConnectionRecoveryManagerConfig } from '../ConnectionRecoveryManager';
import type { MessageOperationsConfig } from '../messageOperations/MessageOperations';
import type { DeclarativePaginatorConfig as ImportedDeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import type { DeepPartial } from '../types.utility';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/**
 * Maps a configuration key to the argument its setup function receives.
 *
 * A closed set, and deliberately not an `interface`: a type alias cannot be reached by module
 * augmentation, so the key space cannot be extended from outside this package. Configuration for a class
 * this package does not own belongs to whoever owns that class — a registry of its own, not a key in this
 * one, which the SDK could neither type nor apply.
 */
export type InstanceSetupFunctionArgs = {
  channel: { channel: Channel };
  client: { client: StreamChat };
  liveLocationManager: { liveLocationManager: LiveLocationManager };
  messageComposer: { composer: MessageComposer };
  searchController: { searchController: SearchController };
  thread: { thread: Thread };
};

/**
 * The keys that take a **setup function** — every one names a class the setup function receives an
 * instance of.
 *
 * Closed, and not extensible: an undeclared string is a compile error, and {@link
 * InstanceSetupFunctionArgs} is a type alias rather than an interface, so a key cannot be added by module
 * augmentation either. This key space describes what *this package* configures.
 *
 * A strict subset of {@link InstanceConfigKey}: `messagePaginator` and `messageOperations` take
 * configuration but have no setup function, because they are not built one-per-key — a channel and every
 * one of its threads each own one.
 */
export type InstanceSetupKey = keyof InstanceSetupFunctionArgs;

// ---------------------------------------------------------------------------
// Tier 2 — setup functions
// ---------------------------------------------------------------------------

export type InstanceSetupFunctionArgsOf<K extends InstanceSetupKey> =
  InstanceSetupFunctionArgs[K];

export type InstanceSetupTearDownFunction = () => void;

/**
 * Runs against every instance of its class — those that already exist when it is registered, and
 * every one created afterwards. Return a function that undoes whatever you changed: it is invoked
 * before the setup function is re-applied, and when the instance is disposed of.
 */
export type InstanceSetupFunction<K extends InstanceSetupKey = InstanceSetupKey> = (
  args: InstanceSetupFunctionArgsOf<K>,
) => void | InstanceSetupTearDownFunction;

export type InstanceSetupState<K extends InstanceSetupKey = InstanceSetupKey> = {
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
  requestHandlers?: ChannelConfig['requestHandlers'];
  /** Typing indicators, ANDed with the channel type's `typing_events`. */
  typingEvents?: Partial<ChannelConfig['typingEvents']>;
  /** Read receipts, ANDed with the channel type's `read_events`. */
  readEvents?: Partial<ChannelConfig['readEvents']>;
  /** Threaded replies, ANDed with the channel type's `replies`. */
  replies?: Partial<ChannelConfig['replies']>;
  /** Message reminders, ANDed with the channel type's `user_message_reminders`. */
  userMessageReminders?: Partial<ChannelConfig['userMessageReminders']>;
  /** Delivery receipts, ANDed with the channel type's `delivery_events`. */
  deliveryEvents?: Partial<ChannelConfig['deliveryEvents']>;
  // `commands` is deliberately absent: the server owns the list outright, so there is nothing to set.
};

export type ThreadDeclarativeConfig = {
  /** Overrides the shared top-level `messageOperations` key for thread replies only. */
  messageOperations?: Partial<MessageOperationsConfig>;
  messagePaginator?: DeclarativeMessagePaginatorConfig;
  requestHandlers?: ThreadConfig['requestHandlers'];
};

export type ClientDeclarativeConfig = {
  /**
   * Nested rather than top-level keys: each of these managers has exactly one parent — the client — so
   * there is nothing to say once and reuse, which is what a top-level key buys (**DEC-25**).
   */
  connectionRecovery?: Partial<ConnectionRecoveryManagerConfig>;
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
export type InstanceConfigTree = {
  channel: ChannelDeclarativeConfig;
  client: ClientDeclarativeConfig;
  /**
   * Constructed by whoever needs it — the React SDK's `useLiveLocationSharingManager`, or an app
   * directly — never by this package. It reaches its configuration the way a `MessageComposer` does, by
   * registering itself against this key, so its owner does not have to thread a slice through.
   */
  liveLocationManager: Partial<LiveLocationManagerConfig>;
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
  /**
   * Same story as {@link InstanceConfigTree.liveLocationManager}, with one caveat: a `SearchController`
   * only reaches this key when it was constructed with a `client` — it is the one configurable class the
   * SDK does not hand a client to. See `SearchControllerOptions.client`.
   */
  searchController: Partial<SearchControllerConfig>;
  thread: ThreadDeclarativeConfig;
};

/**
 * Every key that takes **declarative configuration** — {@link InstanceSetupKey} plus the two that are
 * configuration-only.
 *
 * Closed for the same reason, and {@link InstanceConfigTree} is likewise a type alias, so this set is
 * fixed by the package.
 */
export type InstanceConfigKey = keyof InstanceConfigTree;

export type InstanceConfigOf<K extends InstanceConfigKey> = InstanceConfigTree[K];

export type InstanceConfigState<K extends InstanceConfigKey = InstanceConfigKey> = {
  config: DeepPartial<InstanceConfigOf<K>> | null;
};
