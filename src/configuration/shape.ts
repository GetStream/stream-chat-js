import type {
  ChannelDeclarativeConfig,
  ClientDeclarativeConfig,
  DeclarativeMessagePaginatorConfig,
  InstanceConfigTree,
  ThreadDeclarativeConfig,
} from './types';
import type { DeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import type { MessageOperationsConfig } from '../messageOperations/MessageOperations';
import type { MessageDeliveryReporterConfig } from '../messageDelivery/MessageDeliveryReporter';
import type { ThreadManagerConfig } from '../thread_manager';
import type { ConnectionRecoveryManagerConfig } from '../ConnectionRecoveryManager';
import type { LiveLocationManagerConfig } from '../LiveLocationManager';
import type { SearchControllerConfig } from '../search/SearchController';
import type { NotificationManagerConfig } from '../notifications/types';
import type { ReminderManagerConfig } from '../reminders/ReminderManager';
import type {
  AttachmentManagerConfig,
  CommandsConfig,
  DraftsConfiguration,
  LinkPreviewsManagerConfig,
  LocationComposerConfig,
  MessageComposerConfig,
  PollComposerConfig,
  TextComposerConfig,
} from '../messageComposer/configuration/types';

/**
 * What a configuration value holds. `'object'` covers anything whose interior is not described further
 * — a map of handler functions, a cursor — and tells a caller not to expect editable leaves inside.
 */
export type ConfigValueType =
  | 'boolean'
  | 'enum'
  | 'function'
  | 'number'
  | 'number[]'
  | 'object'
  | 'string'
  | 'string[]';

export type ConfigValueNode = {
  /** One line on what the value does. This is the payload a settings UI or a JS caller reads. */
  description: string;
  /** The permitted values, for `type: 'enum'` only. */
  enumValues?: readonly string[];
  kind: 'value';
  /**
   * `'function'` marks a path the declarative tree cannot carry: JSON has no functions, so these are
   * reachable only through a setup function or a direct `updateConfig` call.
   */
  type: ConfigValueType;
};

export type ConfigGroupNode = {
  description: string;
  fields: ConfigShape;
  kind: 'group';
};

export type ConfigNode = ConfigGroupNode | ConfigValueNode;

export type ConfigShape = { readonly [field: string]: ConfigNode };

/**
 * The declarative paginator knobs, shared by every paginator path in the tree.
 *
 * Annotated as `Record<keyof …>` rather than left to inference, which is the whole point: adding a field
 * to `DeclarativePaginatorConfig` fails the build here until it is described. Same guard as
 * `INSTANCE_CONFIG_TREE_KEY_PRESENCE` uses for the top-level keys.
 */
const PAGINATOR_FIELDS: Record<keyof DeclarativePaginatorConfig, ConfigNode> = {
  debounceMs: {
    description:
      'Delay before a queued page request fires, collapsing rapid scrolling into one query.',
    kind: 'value',
    type: 'number',
  },
  hasPaginationQueryShapeChanged: {
    description:
      'Decides whether a new query is different enough to discard loaded pages rather than append to them.',
    kind: 'value',
    type: 'function',
  },
  initialCursor: {
    description:
      'Cursor the first page is fetched from. Read once, when the paginator is built.',
    kind: 'value',
    type: 'object',
  },
  initialOffset: {
    description: 'Offset the first page is fetched from, for offset-based sources.',
    kind: 'value',
    type: 'number',
  },
  lockItemOrder: {
    description:
      'Keeps loaded items in their current order instead of re-sorting when an item is updated.',
    kind: 'value',
    type: 'boolean',
  },
  pageSize: {
    description:
      'Items requested per page. The effective default differs per paginator — the channel message list asks for more than the base default.',
    kind: 'value',
    type: 'number',
  },
  retryCount: {
    description: 'Retries attempted for a failed page request before the error surfaces.',
    kind: 'value',
    type: 'number',
  },
  stateThrottleMs: {
    description:
      'Shortest gap between state publications, so a burst of events becomes a couple of renders rather than one per event.',
    kind: 'value',
    type: 'number',
  },
  throwErrors: {
    description:
      'Rethrows a failed page request instead of only recording it in the paginator state.',
    kind: 'value',
    type: 'boolean',
  },
};

const MESSAGE_PAGINATOR_FIELDS: Record<
  keyof DeclarativeMessagePaginatorConfig,
  ConfigNode
> = {
  ...PAGINATOR_FIELDS,
  unreadReferencePolicy: {
    description:
      "'snapshot' freezes the unread divider where the user opened the channel until it is explicitly cleared; 'read-state-only' follows the server read state, so the divider moves as messages are marked read.",
    enumValues: ['snapshot', 'read-state-only'],
    kind: 'value',
    type: 'enum',
  },
};

const MESSAGE_OPERATIONS_FIELDS: Record<keyof MessageOperationsConfig, ConfigNode> = {
  failedSendCacheMaxSize: {
    description: 'Failed sends kept for retry; the oldest is evicted past this.',
    kind: 'value',
    type: 'number',
  },
  failedSendCacheTtlMs: {
    description: 'How long a failed send stays retryable.',
    kind: 'value',
    type: 'number',
  },
};

const REQUEST_HANDLERS_NODE: ConfigValueNode = {
  description:
    'Overrides for the API calls this entity makes. Functions, so they travel through a setup function rather than the declarative tree.',
  kind: 'value',
  type: 'function',
};

const paginatorGroup = (description: string): ConfigGroupNode => ({
  description,
  fields: PAGINATOR_FIELDS,
  kind: 'group',
});

const messagePaginatorGroup = (description: string): ConfigGroupNode => ({
  description,
  fields: MESSAGE_PAGINATOR_FIELDS,
  kind: 'group',
});

const messageOperationsGroup = (description: string): ConfigGroupNode => ({
  description,
  fields: MESSAGE_OPERATIONS_FIELDS,
  kind: 'group',
});

// ---------------------------------------------------------------------------
// messageComposer
// ---------------------------------------------------------------------------

const ATTACHMENTS_FIELDS: Record<keyof AttachmentManagerConfig, ConfigNode> = {
  enabled: {
    description:
      'Offers file attachments in the composer. The server must also allow them per channel type (`uploads`), and a server "no" wins.',
    kind: 'value',
    type: 'boolean',
  },
  acceptedFiles: {
    description:
      'File types offered in the file picker, as extensions or MIME patterns. Empty means no restriction.',
    kind: 'value',
    type: 'string[]',
  },
  customCdn: {
    description:
      "Whether a custom upload request stores files somewhere Stream does not host. Left false — the default — files are treated as reaching Stream, so Stream's `uploads` flag and `upload-file` capability apply.",
    kind: 'value',
    type: 'boolean',
  },
  doUploadRequest: {
    description: 'Replaces the built-in upload request with your own.',
    kind: 'value',
    type: 'function',
  },
  fileUploadFilter: {
    description: 'Rejects selected files before they are uploaded.',
    kind: 'value',
    type: 'function',
  },
  maxNumberOfFilesPerMessage: {
    description: 'Attachments allowed on a single message.',
    kind: 'value',
    type: 'number',
  },
  trackUploadProgress: {
    description:
      'Reports upload progress on each attachment. Turning it off skips the progress bookkeeping.',
    kind: 'value',
    type: 'boolean',
  },
};

const COMMANDS_FIELDS: Record<keyof CommandsConfig, ConfigNode> = {
  sendValidator: {
    description: 'Decides whether a message carrying a slash command may be sent.',
    kind: 'value',
    type: 'function',
  },
};

const DRAFTS_FIELDS: Record<keyof DraftsConfiguration, ConfigNode> = {
  enabled: {
    description: 'Stores unsent composer content as a draft on the server.',
    kind: 'value',
    type: 'boolean',
  },
};

const LINK_PREVIEWS_FIELDS: Record<keyof LinkPreviewsManagerConfig, ConfigNode> = {
  debounceURLEnrichmentMs: {
    description: 'Delay after typing stops before URLs in the message are enriched.',
    kind: 'value',
    type: 'number',
  },
  enabled: {
    description: 'Turns URL enrichment and link previews in the composer on.',
    kind: 'value',
    type: 'boolean',
  },
  findURLFn: {
    description: 'Finds the URLs in the composed text that should be enriched.',
    kind: 'value',
    type: 'function',
  },
  onLinkPreviewDismissed: {
    description: 'Runs when a link preview is dismissed.',
    kind: 'value',
    type: 'function',
  },
};

const LOCATION_FIELDS: Record<keyof LocationComposerConfig, ConfigNode> = {
  enabled: {
    description:
      'Offers location sharing in the composer. The server must also allow it per channel type (`shared_locations`), and a server "no" wins.',
    kind: 'value',
    type: 'boolean',
  },
  getDeviceId: {
    description: 'Supplies a stable identifier for the device sharing the location.',
    kind: 'value',
    type: 'function',
  },
  minShareDurationMs: {
    description:
      'Shortest live-location duration treated as valid. A shorter one makes the composed location invalid rather than being clamped.',
    kind: 'value',
    type: 'number',
  },
};

const TEXT_FIELDS: Record<keyof TextComposerConfig, ConfigNode> = {
  defaultValue: {
    description: 'Text the composer starts with.',
    kind: 'value',
    type: 'string',
  },
  enabled: {
    description:
      'Accepts text input. Turning it off disables input, change and selection events.',
    kind: 'value',
    type: 'boolean',
  },
  maxLengthOnEdit: {
    description:
      "Longest text accepted while editing an existing message. Capped by the channel type's `max_message_length`: a smaller value here wins, a larger one is lowered to the server's.",
    kind: 'value',
    type: 'number',
  },
  maxLengthOnSend: {
    description:
      "Longest text accepted when sending a new message. Capped by the channel type's `max_message_length`: a smaller value here wins, a larger one is lowered to the server's. Unset means the server's maximum applies.",
    kind: 'value',
    type: 'number',
  },
  publishTypingEvents: {
    description:
      'Emits typing events as the user types. Off by default for threads and message editing.',
    kind: 'value',
    type: 'boolean',
  },
};

const POLLS_FIELDS: Record<keyof PollComposerConfig, ConfigNode> = {
  enabled: {
    description:
      'Offers poll creation in the composer. The server must also allow it per channel type (`polls`), and a server "no" wins.',
    kind: 'value',
    type: 'boolean',
  },
};

const MESSAGE_COMPOSER_FIELDS: Record<keyof MessageComposerConfig, ConfigNode> = {
  attachments: {
    description: 'Uploads and the file picker.',
    fields: ATTACHMENTS_FIELDS,
    kind: 'group',
  },
  commands: {
    description: 'Slash-command validation.',
    fields: COMMANDS_FIELDS,
    kind: 'group',
  },
  drafts: { description: 'Server-side drafts.', fields: DRAFTS_FIELDS, kind: 'group' },
  linkPreviews: {
    description: 'URL enrichment and link previews.',
    fields: LINK_PREVIEWS_FIELDS,
    kind: 'group',
  },
  location: {
    description: 'Static and live location sharing.',
    fields: LOCATION_FIELDS,
    kind: 'group',
  },
  polls: {
    description: 'Poll creation.',
    fields: POLLS_FIELDS,
    kind: 'group',
  },
  text: { description: 'The text input itself.', fields: TEXT_FIELDS, kind: 'group' },
};

// ---------------------------------------------------------------------------
// client
// ---------------------------------------------------------------------------

const MESSAGE_DELIVERY_FIELDS: Record<keyof MessageDeliveryReporterConfig, ConfigNode> = {
  markAsDeliveredBufferTimeoutMs: {
    description: 'How long delivery reports are buffered before being sent as one batch.',
    kind: 'value',
    type: 'number',
  },
  markAsReadThrottleTimeoutMs: {
    description:
      'Shortest gap between automatic markRead calls. Read once, when the throttle is built.',
    kind: 'value',
    type: 'number',
  },
  maxDeliveredMessageCountInPayload: {
    description:
      'Delivery receipts sent in a single request; the remainder is carried to the next one.',
    kind: 'value',
    type: 'number',
  },
  retryCountLimitForTimeoutIncrease: {
    description: 'Consecutive timeouts before the buffer window is widened.',
    kind: 'value',
    type: 'number',
  },
};

const THREAD_MANAGER_FIELDS: Record<keyof ThreadManagerConfig, ConfigNode> = {
  connectionRecoveryThrottleMs: {
    description:
      'Shortest gap between thread-list reloads triggered by connection recovery. Applies from the next registerSubscriptions().',
    kind: 'value',
    type: 'number',
  },
};

const LIVE_LOCATION_MANAGER_FIELDS: Record<keyof LiveLocationManagerConfig, ConfigNode> =
  {
    minUpdateThrottleMs: {
      description:
        'Shortest gap between live-location update requests, in milliseconds. A rate-limit failsafe — raising it is always safe, lowering it risks 429s.',
      kind: 'value',
      type: 'number',
    },
  };

const SEARCH_CONTROLLER_FIELDS: Record<keyof SearchControllerConfig, ConfigNode> = {
  keepSingleActiveSource: {
    description:
      'Keeps exactly one search source active at a time, rather than letting several run together.',
    kind: 'value',
    type: 'boolean',
  },
};

const NOTIFICATION_FIELDS: Record<keyof NotificationManagerConfig, ConfigNode> = {
  durations: {
    description:
      'How long a notification stays up, in milliseconds, per severity: error, warning, info, success.',
    kind: 'value',
    type: 'object',
  },
  sortComparator: {
    description: 'Orders the notifications shown at once.',
    kind: 'value',
    type: 'function',
  },
};

const REMINDER_FIELDS: Record<keyof ReminderManagerConfig, ConfigNode> = {
  scheduledOffsetsMs: {
    description:
      'Offsets from now offered when scheduling a reminder, in milliseconds — the "in 30 minutes / tomorrow" choices.',
    kind: 'value',
    type: 'number[]',
  },
  stopTimerRefreshBoundaryMs: {
    description:
      'How far ahead a reminder must be before its refresh timer stops running; beyond this it is refreshed on demand instead.',
    kind: 'value',
    type: 'number',
  },
};

const CONNECTION_RECOVERY_FIELDS: Record<
  keyof ConnectionRecoveryManagerConfig,
  ConfigNode
> = {
  enabled: {
    description:
      'Whether the client recovers its own state on reconnect. Turn it off only if the application re-queries and re-watches everything on screen itself.',
    kind: 'value',
    type: 'boolean',
  },
};

const CLIENT_FIELDS: Record<keyof ClientDeclarativeConfig, ConfigNode> = {
  connectionRecovery: {
    description:
      'Bringing the channels, lists and threads you are reading back in line after a reconnect.',
    fields: CONNECTION_RECOVERY_FIELDS,
    kind: 'group',
  },
  messageDelivery: {
    description: 'Delivery and read receipt reporting.',
    fields: MESSAGE_DELIVERY_FIELDS,
    kind: 'group',
  },
  notifications: {
    description: 'The client-wide notification (toast) manager.',
    fields: NOTIFICATION_FIELDS,
    kind: 'group',
  },
  reminders: {
    description: 'Message reminders and their scheduling offsets.',
    fields: REMINDER_FIELDS,
    kind: 'group',
  },
  threads: {
    description: 'The thread list manager.',
    fields: THREAD_MANAGER_FIELDS,
    kind: 'group',
  },
};

// ---------------------------------------------------------------------------
// channel / thread
// ---------------------------------------------------------------------------

const CHANNEL_FIELDS: Record<keyof ChannelDeclarativeConfig, ConfigNode> = {
  messageOperations: messageOperationsGroup(
    'Sending and retrying messages in the channel. Overrides the shared `messageOperations` key for channels only.',
  ),
  messagePaginator: messagePaginatorGroup(
    'The channel message list. Overrides the shared `messagePaginator` key for channels only.',
  ),
  pinnedMessagesPaginator: paginatorGroup(
    "The channel's pinned message list. Nested rather than top-level: a channel is its only parent.",
  ),
  requestHandlers: REQUEST_HANDLERS_NODE,
  typingEvents: {
    description: 'Typing indicators for the channel.',
    fields: {
      enabled: {
        description:
          'Publishes typing events from this channel. The server must also allow them per channel type (`typing_events`), and a server "no" wins. `messageComposer.text.publishTypingEvents` refines this per composer.',
        kind: 'value',
        type: 'boolean',
      },
    },
    kind: 'group',
  },
  replies: {
    description: 'Threaded replies for the channel.',
    fields: {
      enabled: {
        description:
          'Offers threaded replies. The server must also allow them per channel type (`replies`), and a server "no" wins.',
        kind: 'value',
        type: 'boolean',
      },
    },
    kind: 'group',
  },
  userMessageReminders: {
    description: 'Message reminders — "remind me" and "save for later".',
    fields: {
      enabled: {
        description:
          'Offers message reminders. The server must also allow them per channel type (`user_message_reminders`), and a server "no" wins.',
        kind: 'value',
        type: 'boolean',
      },
    },
    kind: 'group',
  },
  deliveryEvents: {
    description: 'Delivery receipts for the channel.',
    fields: {
      enabled: {
        description:
          'Reports message delivery. The server must also allow it per channel type (`delivery_events`), and a server "no" wins.',
        kind: 'value',
        type: 'boolean',
      },
    },
    kind: 'group',
  },
  readEvents: {
    description: 'Read receipts for the channel.',
    fields: {
      enabled: {
        description:
          'Allows marking the channel read or unread. The server must also allow it per channel type (`read_events`), and a server "no" wins.',
        kind: 'value',
        type: 'boolean',
      },
    },
    kind: 'group',
  },
};

const THREAD_FIELDS: Record<keyof ThreadDeclarativeConfig, ConfigNode> = {
  messageOperations: messageOperationsGroup(
    'Sending and retrying thread replies. Overrides the shared `messageOperations` key for threads only.',
  ),
  messagePaginator: messagePaginatorGroup(
    'The thread reply list. Overrides the shared `messagePaginator` key for threads only.',
  ),
  requestHandlers: REQUEST_HANDLERS_NODE,
};

/**
 * A runtime description of the whole declarative configuration tree: every path, what it holds, and what
 * it does.
 *
 * The tree's types already describe all of this, and a TypeScript caller gets it as autocomplete on
 * `client.config.set()`. This is the same knowledge for everyone who cannot read the types at the moment
 * they need it — a settings UI listing what can be changed, a JavaScript caller, a documentation
 * generator. Without it, the only way to learn that `thread` accepts `messagePaginator` is to open the
 * SDK source.
 *
 * **Completeness is enforced by the compiler, not by discipline.** Every level is annotated
 * `Record<keyof SomeConfigType, ConfigNode>`, so a field added to any configuration type fails the build
 * until it is described here. That is what separates this from a hand-maintained list, which drifts
 * behind the tree silently and is exactly the failure this replaces.
 *
 * **What is deliberately absent.** No default values: an effective default depends on the construction
 * site — `pageSize` is 10 for a bare paginator and larger for the channel message list — so a table of
 * them here would be a second source of truth that disagrees with the instances. Read current values from
 * the instance (`channel.messagePaginator.config`) and registered values from
 * {@link InstanceConfigurationRegistry.getTree}. Construction-only paths are absent for the same reason:
 * `CONSTRUCTION_ONLY_CONFIG_PATHS` already lists them.
 *
 * **Built-in keys only.** The key space is open, so a key registered through module augmentation has no
 * entry here. Merge {@link InstanceConfigurationRegistry.getTree} in to see those.
 */
export const INSTANCE_CONFIG_TREE_SHAPE: Record<
  keyof InstanceConfigTree,
  ConfigGroupNode
> = {
  channel: {
    description:
      'Everything a Channel builds, and the channel-specific slice of shared keys.',
    fields: CHANNEL_FIELDS,
    kind: 'group',
  },
  client: {
    description:
      'Managers the client owns outright. Nested rather than top-level keys, since each has exactly one parent.',
    fields: CLIENT_FIELDS,
    kind: 'group',
  },
  liveLocationManager: {
    description:
      'Live-location sharing. Constructed by the integrator or a downstream SDK rather than by this package, and reaches this key by registering itself.',
    fields: LIVE_LOCATION_MANAGER_FIELDS,
    kind: 'group',
  },
  messageComposer: {
    description:
      "Every MessageComposer — a channel's, a thread's, and the message-scoped ones built for editing. Its own key because the same settings mean the same thing under all three.",
    fields: MESSAGE_COMPOSER_FIELDS,
    kind: 'group',
  },
  messageOperations: {
    description:
      'Every MessageOperations at once. `channel.messageOperations` and `thread.messageOperations` override it per parent.',
    fields: MESSAGE_OPERATIONS_FIELDS,
    kind: 'group',
  },
  messagePaginator: {
    description:
      'Every MessagePaginator at once — the channel message list and thread replies alike. `channel.messagePaginator` and `thread.messagePaginator` override it per parent.',
    fields: MESSAGE_PAGINATOR_FIELDS,
    kind: 'group',
  },
  searchController: {
    description:
      'Message/channel/user search. Reaches this key only when constructed with a `client` — see SearchControllerOptions.',
    fields: SEARCH_CONTROLLER_FIELDS,
    kind: 'group',
  },
  thread: {
    description:
      'Everything a Thread builds, and the thread-specific slice of shared keys.',
    fields: THREAD_FIELDS,
    kind: 'group',
  },
};

/** Every path in the shape as `a.b.c`, with the node it points at. Sorted, so output is stable. */
export const flattenConfigShape = (
  shape: ConfigShape = INSTANCE_CONFIG_TREE_SHAPE,
  prefix = '',
): { node: ConfigNode; path: string }[] => {
  const out: { node: ConfigNode; path: string }[] = [];

  for (const field of Object.keys(shape).sort()) {
    const node = shape[field];
    const path = prefix ? `${prefix}.${field}` : field;
    out.push({ node, path });
    if (node.kind === 'group') out.push(...flattenConfigShape(node.fields, path));
  }

  return out;
};
