import type { AxiosRequestConfig } from 'axios';
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
import type { NotificationManager } from '../notifications/NotificationManager';
import type { NotificationManagerConfig } from '../notifications/types';
import type { MessageDeliveryReporterConfig } from '../messageDelivery/MessageDeliveryReporter';
import type { ThreadManagerConfig } from '../thread_manager';
import type {
  ConnectionRecoveryManagerConfig,
  NetworkConnectionObserverConfig,
  WSConnectionConfig,
} from '../connection';
import type { MessageOperationsConfig } from '../messageOperations/MessageOperations';
import type { DeclarativePaginatorConfig as ImportedDeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import type { DeepPartial } from '../types.utility';

/**
 * Maps a configuration key to the argument its setup function receives. A type alias, so the key space
 * is closed to module augmentation.
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
 * The keys that take a setup function. A strict subset of {@link InstanceConfigKey}: `messagePaginator`
 * and `messageOperations` take configuration but no setup function, since a channel and each of its
 * threads own one.
 */
export type InstanceSetupKey = keyof InstanceSetupFunctionArgs;

export type InstanceSetupFunctionArgsOf<K extends InstanceSetupKey> =
  InstanceSetupFunctionArgs[K];

export type InstanceSetupTearDownFunction = () => void;

/**
 * Runs against every instance of its class, existing and future. Return a function that undoes what you
 * changed: it runs before the setup function is re-applied and when the instance is disposed of.
 */
export type InstanceSetupFunction<K extends InstanceSetupKey = InstanceSetupKey> = (
  args: InstanceSetupFunctionArgsOf<K>,
) => void | InstanceSetupTearDownFunction;

export type InstanceSetupState<K extends InstanceSetupKey = InstanceSetupKey> = {
  setupFunction: InstanceSetupFunction<K> | null;
};

/** Whether `jumpToTheFirstUnreadMessage` prefers the paginator's snapshot or the channel read state. */
export type UnreadReferencePolicy = 'snapshot' | 'read-state-only';

/**
 * Paginator fields settable through the declarative tree. Defined in `BasePaginator`, which excludes
 * what is not plain configuration: `itemIndex` / `createItemIndex`, and the per-subclass `doRequest`,
 * `itemOrderComparator` and `deriveCursor` (replace those through a setup function).
 * `initialCursor` and `initialOffset` are read only during construction, see
 * {@link CONSTRUCTION_ONLY_CONFIG_PATHS}.
 */
export type { DeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';

/** Adds the message-list-only `unreadReferencePolicy`. */
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
  // `commands` is absent: the server owns the list.
};

export type ThreadDeclarativeConfig = {
  /** Overrides the shared top-level `messageOperations` key for thread replies only. */
  messageOperations?: Partial<MessageOperationsConfig>;
  messagePaginator?: DeclarativeMessagePaginatorConfig;
  requestHandlers?: ThreadConfig['requestHandlers'];
};

export type ClientDeclarativeConfig = {
  /**
   * Silences the warning `connectUser` / `connectAnonymousUser` log when called server-side, where a
   * connection counts towards MAU and concurrent-connection billing. Read on every connect.
   */
  allowServerSideConnect?: boolean;
  /**
   * Axios request configuration (`timeout`, `headers`, `httpsAgent`, ...). Built into the client's axios
   * instance once, at construction; `headers` and `params` are also read on every request. Copied when
   * registered, so mutating the object afterwards has no effect.
   */
  axiosRequestConfig?: AxiosRequestConfig;
  /** Base URL of the API, such as `https://chat-proxy-dublin.stream-io-api.com`. Read once. */
  baseURL?: string;
  /**
   * Forces browser (`true`) or Node (`false`) mode; detected from the global `window` when absent. Read
   * live, through `client.browser` and `client.node`.
   */
  browser?: boolean;
  /**
   * A pre-built {@link NotificationManager} to use instead of constructing one, to share it between
   * clients or hand over one that already holds notifications. Read once, at construction. The
   * `notifications` slice is still applied to it.
   */
  notificationManager?: NotificationManager;
  /**
   * When true, `client.user` is kept if `connectUser` fails, so an offline-capable app does not have to
   * call `connectUser` again to retry. Read when a connect fails.
   */
  persistUserOnConnectionFailure?: boolean;
  connectionRecovery?: Partial<ConnectionRecoveryManagerConfig>;
  messageDelivery?: Partial<MessageDeliveryReporterConfig>;
  /**
   * The platform listener that reports the device's network, which React Native and other hosts supply
   * here (default: browser events, else a reporter that mirrors the WebSocket). `Partial`, not
   * `DeepPartial`: the only field holds a function, which `DeepPartial` would descend into.
   */
  networkConnection?: Partial<NetworkConnectionObserverConfig>;
  threads?: Partial<ThreadManagerConfig>;
  /** `Partial`, not `DeepPartial`: fields are flat or class instances, which it would descend into. */
  wsConnection?: Partial<WSConnectionConfig>;
  notifications?: DeepPartial<NotificationManagerConfig>;
  /**
   * `Partial`, not `DeepPartial`: `scheduledOffsetsMs` is a `number[]`, and `DeepPartial` would widen
   * its elements to `number | undefined`, which `ReminderManager.updateConfig` rejects.
   */
  reminders?: Partial<ReminderManagerConfig>;
};

/**
 * Maps a configuration key to its declarative configuration subtree. A class with one parent type is
 * nested under that parent. A class held by several parents (`MessageComposer`, `MessagePaginator`,
 * `MessageOperations`) gets its own shared key, and where parents need to differ they override it per
 * field (see {@link mergeDeclarativeMessageOperationsConfig}).
 */
export type InstanceConfigTree = {
  channel: ChannelDeclarativeConfig;
  client: ClientDeclarativeConfig;
  /**
   * Constructed by the integrator or a UI SDK, never by this package. It reaches its configuration by
   * registering itself against this key.
   */
  liveLocationManager: Partial<LiveLocationManagerConfig>;
  messageComposer: DeepPartial<MessageComposerConfig>;
  /**
   * Applies to every `MessageOperations`, the channel's and each thread's.
   * `channel.messageOperations` and `thread.messageOperations` override it per parent.
   */
  messageOperations: Partial<MessageOperationsConfig>;
  /**
   * Applies to every `MessagePaginator`, the channel message list and thread replies alike.
   * `channel.messagePaginator` and `thread.messagePaginator` override it per parent.
   * `channel.pinnedMessagesPaginator` is not included: it is a different class with a single parent.
   */
  messagePaginator: DeclarativeMessagePaginatorConfig;
  /**
   * Like {@link InstanceConfigTree.liveLocationManager}, but a `SearchController` reaches this key only
   * when constructed with a `client` (see `SearchControllerOptions.client`).
   */
  searchController: Partial<SearchControllerConfig>;
  thread: ThreadDeclarativeConfig;
};

/** Every key that takes declarative configuration: {@link InstanceSetupKey} plus the config-only ones. */
export type InstanceConfigKey = keyof InstanceConfigTree;

export type InstanceConfigOf<K extends InstanceConfigKey> = InstanceConfigTree[K];

export type InstanceConfigState<K extends InstanceConfigKey = InstanceConfigKey> = {
  config: DeepPartial<InstanceConfigOf<K>> | null;
};
