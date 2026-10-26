import { ChannelState, ChannelWatchStatus } from './channel_state';
import { isEqual } from './utils/mergeWith/mergeWithCore';
import { CooldownTimer } from './CooldownTimer';
import { queueOrRun } from './offline-support/queueableOperations';
import { MessageComposer } from './messageComposer';
import { MessageReceiptsTracker } from './messageDelivery';
import type { ReadStoreReconcileMeta } from './messageDelivery';
import { MessagePaginator, PinnedMessagePaginator } from './pagination/paginators';
import { createMessageOperations, reflectReactionEvent } from './messageOperations';
import type { MessageOperations } from './messageOperations';
import type { OperationRequestFn } from './messageOperations/types';
import {
  channelHasReadEvents,
  formatMessage,
  generateChannelTempCid,
  getMemberUserId,
  invokeEventListener,
  isThreadOnlyReply,
  logChatPromiseExecution,
  sanitizeOutgoingAttachments,
} from './utils';
import { asTimestampNS, msToNs, nowNs } from './utils/time';
import { abortError, waitUnlessAborted } from './utils/abort';
import { normalizeUploadFile } from './upload-utils';
import type { StreamChat } from './client';
import { chatLoggerSystem } from './logger';
import { applyInstanceConfiguration } from './configuration/utils/applyInstanceConfiguration';
import { ConfigController } from './configuration/ConfigController';
import { copyConfigPatch } from './configuration/utils/copyConfigPatch';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import { mergeServerRestrictions } from './configuration/utils/serverAuthority';
import type { ServerRestrictions } from './configuration/utils/serverAuthority';
import type { CustomEventData } from './custom_types';
import type { ChannelDeclarativeConfig } from './configuration/types';
import {
  mergeDeclarativeMessageOperationsConfig,
  mergeDeclarativePaginatorConfig,
  toDeclarativePaginatorConfig,
} from './configuration/utils/declarativeSlices';
import type {
  AddMembersRequest,
  AIState,
  BanUserOptions,
  ChannelGetOrCreateRequest,
  ChannelInput,
  ChannelMemberResponse,
  ChannelResponse,
  ChannelStateResponse,
  ChannelStateResponseFields,
  Command,
  Event,
  EventHandler,
  EventPayload,
  EventType,
  FileUploadInput,
  FilterTagsRequest,
  InviteMembersRequest,
  LocalMessage,
  MarkReadRequest,
  MarkReadResponse,
  MessageResponse,
  QueryMembersPayload,
  RemoveMembersRequest,
  SharedLocation,
  StreamRequestOptions,
  StreamResponse,
  TimestampNS,
  UnBanUserOptions,
  UpdateChannelPartialRequest,
  UpdateLiveLocationRequest,
  UserResponse,
} from './types';
import { AIStates } from './types';
import type { StateStore } from '@stream-io/state-store';
import type { Unsubscribe } from '@stream-io/state-store';
import type {
  ChannelPushPreferencesResponse as Gen_ChannelPushPreferencesResponse,
  MuteChannelRequest as Gen_MuteChannelRequest,
  UnmuteChannelRequest as Gen_UnmuteChannelRequest,
  UploadChannelFileRequest,
  UploadChannelRequest,
  WSEvent,
} from './gen/models';
import type { ChatApi } from './gen/chat/ChatApi';
import { ChannelApi } from './gen/chat/ChannelApi';

const logger = chatLoggerSystem.getLogger('channel');

const WATCH_WAIT_ABORTED = 'The wait for the channel watch was aborted.';

/** Whether a {@link Channel.watch} call passes options, which ask for more than the watch alone. */
const hasWatchOptions = (options: ChannelGetOrCreateRequest) =>
  Object.keys(options).length > 0;

/** A watch query {@link Channel.watch} sent; cancelled once none of its callers waits. */
type WatchQueryInFlight = {
  options: ChannelGetOrCreateRequest;
  promise: Promise<void>;
  abortController: AbortController;
  waitingCount: number;
};

/** Re-exported here because `src/messageOperations` is not in the root barrel. */
export type {
  DefaultOperationRequest,
  MessageOperationSpec,
  OperationKind,
  OperationParams,
  OperationRequestFn,
  OperationResponse,
} from './messageOperations/types';

export type CustomMarkReadRequestFn = (params: {
  channel: Channel;
  options?: MarkReadRequest;
}) => Promise<Partial<StreamResponse<MarkReadResponse>> | null>;

/**
 * A channel's resolved configuration, returned by {@link Channel.config}. The gates are the server's
 * flags (see {@link Channel.serverConfig}) ANDed with what the integrator registered.
 */
export type ChannelConfig = {
  requestHandlers?: {
    deleteMessageRequest?: OperationRequestFn<'delete'>;
    markReadRequest?: CustomMarkReadRequestFn;
    sendMessageRequest?: OperationRequestFn<'send'>;
    retrySendMessageRequest?: OperationRequestFn<'retry'>;
    updateMessageRequest?: OperationRequestFn<'update'>;
  };
  /**
   * Typing indicators. Defaults to enabled. ANDed with the channel type's `typing_events`. Read by
   * {@link Channel.keystroke} and {@link Channel.stopTyping}.
   * `messageComposer.text.publishTypingEvents` further switches them off per composer.
   */
  typingEvents: { enabled: boolean };
  /**
   * Read receipts. `enabled` is ANDed with the channel type's `read_events`. Read by
   * {@link Channel.markRead} and {@link Channel.markUnread}. Defaults to `true`.
   *
   * `localUnreadCountEnabled` applies only while `enabled` is false: the channel keeps counting
   * unread messages and {@link Channel.markReadLocally} resets the count, sending nothing to the
   * server. The server does not restrict it. Defaults to `false`.
   */
  readEvents: { enabled: boolean; localUnreadCountEnabled: boolean };
  /** Threaded replies. Defaults to enabled. ANDed with the channel type's `replies`. */
  replies: { enabled: boolean };
  /**
   * Message reminders. Defaults to enabled. ANDed with the channel type's `user_message_reminders`.
   */
  userMessageReminders: { enabled: boolean };
  /** Delivery receipts. Defaults to enabled. ANDed with the channel type's `delivery_events`. */
  deliveryEvents: { enabled: boolean };
  /**
   * The slash commands the channel type offers. Server-owned: the integrator cannot set it. Whether a
   * command can be used right now is `messageComposer.isCommandDisabled(command)`.
   */
  availableCommands: Command[];
};

/**
 * The fields of the declarative `channel` slice that the channel resolves for itself. The rest
 * (`messagePaginator`, `pinnedMessagesPaginator`, `messageOperations`) go to those objects, see
 * {@link Channel.initializeConfig}.
 */
const ownDeclarativeConfig = (
  slice?: ChannelDeclarativeConfig,
): Partial<ChannelConfig> | undefined => {
  if (!slice) return undefined;

  const {
    deliveryEvents,
    readEvents,
    replies,
    requestHandlers,
    typingEvents,
    userMessageReminders,
  } = slice;

  return {
    deliveryEvents,
    readEvents,
    replies,
    requestHandlers,
    typingEvents,
    userMessageReminders,
  } as Partial<ChannelConfig>;
};

export const DEFAULT_CHANNEL_CONFIG: ChannelConfig = deepFreezeConfig({
  availableCommands: [],
  deliveryEvents: { enabled: true },
  readEvents: { enabled: true, localUnreadCountEnabled: false },
  replies: { enabled: true },
  typingEvents: { enabled: true },
  userMessageReminders: { enabled: true },
});

export class Channel extends ChannelApi {
  _client: StreamChat;
  _data: ChannelInput;
  cid: string;
  listeners: Map<EventType, Set<EventHandler>>;
  state: ChannelState;
  lastKeyStroke?: Date;
  lastTypingEvent: Date | null;
  isTyping: boolean;
  /** Re-entrancy guard for {@link Channel.reload}. */
  private _reloading = false;
  /** Refcount behind the `active` flag: several consumers can hold one instance. */
  private _activeRefCount = 0;
  /** Stops releaseUnusedChannels() from removing a channel while a query for it is still running. */
  private _channelQueriesInFlight = 0;
  /** The watch queries {@link Channel.watch} callers wait for, joined by equal options. */
  private _watchQueriesInFlight: WatchQueryInFlight[] = [];
  /**
   * The options of the last {@link Channel.watch} query that succeeded during the current watch: a
   * `watch()` with these options has nothing to send. Cleared when the watch ends.
   */
  private _lastWatchOptions?: ChannelGetOrCreateRequest;
  /** Counts the watches that ended, so a query sent during an earlier watch is not remembered. */
  private _endedWatchCount = 0;
  push_preferences?: Gen_ChannelPushPreferencesResponse;
  private readonly configController: ConfigController<ChannelConfig>;
  public readonly messageComposer: MessageComposer;
  public readonly messageReceiptsTracker: MessageReceiptsTracker;
  public readonly messageOperations: MessageOperations;
  public readonly messagePaginator: MessagePaginator;
  public readonly pinnedMessagesPaginator: PinnedMessagePaginator;
  public readonly cooldownTimer: CooldownTimer;
  private unsubscribeConfiguration?: Unsubscribe;
  private unsubscribeServerConfig?: Unsubscribe;
  /** The declarative slice last derived from, so a late server config can re-derive from it. */
  private declarativeConfig?: Partial<ChannelConfig>;

  /**
   * Creates an uninitialized channel. Without an `id` its `cid` is a temporary one built from
   * `data.members`, until the server answers.
   *
   * @param client - The chat client.
   * @param type - The channel type.
   * @param id - The channel ID, or `undefined` for a channel created from members.
   * @param data - Data for the channel (members, custom fields).
   */
  constructor(
    client: StreamChat,
    type: string,
    id: string | undefined,
    data: ChannelInput,
  ) {
    const validTypeRe = /^[\w_-]+$/;
    const validIDRe = /^[\w!_-]+$/;

    if (!validTypeRe.test(type)) {
      throw new Error(`Invalid chat type ${type}, letters, numbers and "_-" are allowed`);
    }
    if (typeof id === 'string' && !validIDRe.test(id)) {
      throw new Error(`Invalid chat id ${id}, letters, numbers and "!-_" are allowed`);
    }

    super(client, type, id);

    this._client = client;
    this._data = { ...data };
    // Without an ID the cid is a temporary one: the key the channel is stored under
    // (`ensure({ members })`).
    this.cid =
      (!id && generateChannelTempCid(type, (data.members ?? []).map(getMemberUserId))) ||
      `${type}:${id}`;
    this.listeners = new Map();
    this.state = new ChannelState(this);
    // after the state exists: the `data` setter writes to it
    this.data = data as Partial<ChannelResponse>;
    this.lastTypingEvent = null;
    this.isTyping = false;

    // Read before the sub-objects are built: some of their fields are read once at construction
    // (`unreadReferencePolicy`, the initial cursor/offset).
    const declarativeConfig = client.config.getConfig('channel') ?? undefined;
    // The shared `messagePaginator` key applies to every MessagePaginator (channel and threads); the
    // channel's own slice overrides it.
    const messagePaginatorConfig = mergeDeclarativePaginatorConfig(
      client.config.getConfig('messagePaginator') ?? undefined,
      declarativeConfig?.messagePaginator,
    );

    this.messageComposer = new MessageComposer({
      client: this._client,
      compositionContext: this,
    });

    // Created before MessageReceiptsTracker and CooldownTimer, which read it.
    this.messagePaginator = new MessagePaginator({
      channel: this,
      // A constructor argument, not config (`toDeclarativePaginatorConfig` drops it).
      unreadReferencePolicy: messagePaginatorConfig?.unreadReferencePolicy,
      paginatorOptions: {
        declarativeConfig: toDeclarativePaginatorConfig(messagePaginatorConfig),
      },
    });
    this.pinnedMessagesPaginator = new PinnedMessagePaginator({
      channel: this,
      paginatorOptions: { declarativeConfig: declarativeConfig?.pinnedMessagesPaginator },
    });

    this.messageReceiptsTracker = new MessageReceiptsTracker({ channel: this });
    this.messageReceiptsTracker.registerSubscriptions();

    this.cooldownTimer = new CooldownTimer({ channel: this });
    this.cooldownTimer.registerSubscriptions();

    this.messageOperations = createMessageOperations(this);

    // A channel created after connect may already be muted.
    this._syncMuteStatus();

    this.configController = new ConfigController<ChannelConfig>({
      defaults: DEFAULT_CHANNEL_CONFIG,
      initialSlice: ownDeclarativeConfig(declarativeConfig),
      // Nested groups: naming `typingEvents.enabled` must not drop `readEvents`.
      mergeSlice: 'deep',
      // Frozen so a nested write throws. Copied first: a subtree of the resolved config can be the same
      // object as one in the slice stored in `client.config`, and freezing it would freeze that slice.
      applyAuthority: (requested) =>
        deepFreezeConfig(
          copyConfigPatch({
            ...(mergeServerRestrictions(
              requested,
              this.serverRestrictions,
            ) as ChannelConfig),
            // Assigned, not merged: the deep merge would concatenate the lists.
            availableCommands: this.serverConfig?.commands ?? [],
          }),
        ) as ChannelConfig,
    });

    // The server config usually arrives after construction: re-derive when it lands. `this.cid` is read
    // at selection time because `query()` swaps a temporary cid for the real one before
    // `_addChannelConfig`.
    this.unsubscribeServerConfig = client.channelServerConfigsStore.subscribeWithSelector(
      ({ configs }) => ({ channelConfig: configs[this.cid] }),
      () => this.configController.rederive(this.declarativeConfig),
    );

    // The same derivation `config.reset()` runs. The sub-objects were already configured by their
    // constructors; this re-applies the mutable half.
    this.initializeConfig(declarativeConfig);

    // Last in the constructor: setup functions may reach every sub-object. Their errors are contained.
    this.unsubscribeConfiguration = applyInstanceConfiguration({
      args: { channel: this },
      config: client.config,
      key: 'channel',
      applyConfig: (config) => this.initializeConfig(config),
      // Reads the slice fresh: reset clears the declarative store before calling this.
      reinitializeConfig: () =>
        this.initializeConfig(client.config.getConfig('channel') ?? undefined),
      // The message paginator and message operations also derive from these shared keys, so a change
      // re-runs the full cycle (declarative, then setup function) to keep the setup function's
      // overrides.
      alsoWatch: ['messagePaginator', 'messageOperations'],
    });
  }

  /** Flags the channel type decides server-side (ANDed with the requested ones). */
  private get serverRestrictions(): ServerRestrictions<ChannelConfig> {
    const channelConfig = this.serverConfig;

    return {
      deliveryEvents: { enabled: channelConfig?.delivery_events },
      readEvents: { enabled: channelConfig?.read_events },
      replies: { enabled: channelConfig?.replies },
      typingEvents: { enabled: channelConfig?.typing_events },
      userMessageReminders: { enabled: channelConfig?.user_message_reminders },
    };
  }

  /**
   * Re-derives the configuration of the channel, its paginators and its message operations from the
   * declarative slice. Runs at construction, on every change to the `channel`, `messagePaginator` or
   * `messageOperations` configuration, and on `client.config.reset()`.
   *
   * @param declarativeConfig - The channel's declarative slice (optional).
   */
  initializeConfig(declarativeConfig?: ChannelDeclarativeConfig): void {
    this.declarativeConfig = declarativeConfig as Partial<ChannelConfig> | undefined;

    // Replaces, so a handler dropped from the declarative tree disappears. Direct writes to
    // `configState.requestHandlers` must be re-applied afterwards.
    // The controller skips the publish when the resolved config is deep-equal to the last one.
    this.configController.initialize(ownDeclarativeConfig(declarativeConfig));

    // Shared key first, the channel's own slice overrides it.
    this.messagePaginator.initializeConfig(
      toDeclarativePaginatorConfig(
        mergeDeclarativePaginatorConfig(
          this.getClient().config.getConfig('messagePaginator') ?? undefined,
          declarativeConfig?.messagePaginator,
        ),
      ),
    );
    // No shared key: the pinned paginator has a single parent.
    this.pinnedMessagesPaginator.initializeConfig(
      declarativeConfig?.pinnedMessagesPaginator,
    );

    // Shared key with a per-parent override, as for `messagePaginator`.
    this.messageOperations.initializeConfig(
      mergeDeclarativeMessageOperationsConfig(
        this.getClient().config.getConfig('messageOperations') ?? undefined,
        declarativeConfig?.messageOperations,
      ),
    );
  }

  /**
   * Returns the chat client for this channel.
   *
   * @returns The chat client.
   * @throws If the channel is pending disposal ({@link Channel.pendingDisposal}).
   */
  getClient(): StreamChat {
    if (this.pendingDisposal) throw this.disposedError();
    return this._client;
  }

  private disposedError() {
    return new Error(
      `Channel ${this.cid} is pending disposal and cannot be used. Get a fresh instance via client.channelManager.ensure().`,
    );
  }

  get configState(): StateStore<ChannelConfig> {
    return this.configController.state;
  }

  get config(): Readonly<ChannelConfig> {
    return this.configController.value;
  }

  /**
   * The channel's configuration as the server reports it (`uploads`, `typing_events`, `commands`, ...),
   * including this channel's `config_overrides`. `undefined` until the channel is queried or watched.
   * Gate features on {@link config} instead: it also folds in what the integrator disabled.
   */
  get serverConfig() {
    return this.getClient().channelServerConfigs[this.cid];
  }

  /**
   * Sends a message to this channel. Strips `localMetadata` from attachments and drops those whose
   * upload never completed.
   *
   * @param ...args - `[request, requestOptions]`. `request` holds the message body and optional
   *   flags such as `skip_enrich_url`, `skip_push`, and `keep_channel_hidden`; `requestOptions`
   *   carries per-request options such as an abort `signal` and is never serialized into the request.
   * @returns The server response.
   */
  override async sendMessage(...args: Parameters<ChannelApi['sendMessage']>) {
    const [request, requestOptions] = args;

    return await super.sendMessage(
      { ...request, message: sanitizeOutgoingAttachments(request.message) },
      requestOptions,
    );
  }

  async sendReaction(...args: Parameters<ChatApi['sendReaction']>) {
    return await this.getClient().sendReaction(...args);
  }

  async deleteReaction(...args: Parameters<ChatApi['deleteReaction']>) {
    return await this.getClient().deleteReaction(...args);
  }

  /**
   * Uploads a file to this channel's file endpoint (multipart).
   *
   * @param request - Upload payload. `request.file` is the file to upload.
   * @param requestOptions - Per-request options, e.g. `onUploadProgress` or an abort `signal`
   *   (optional).
   * @returns The upload response, with the CDN URL in `file`.
   */
  override async uploadChannelFile(
    request?: Omit<UploadChannelFileRequest, 'file'> & { file?: FileUploadInput },
    requestOptions?: StreamRequestOptions,
  ) {
    return await super.uploadChannelFile(
      { ...request, file: normalizeUploadFile(request?.file) as unknown as string },
      requestOptions,
    );
  }

  /**
   * Uploads an image to this channel's image endpoint (multipart).
   *
   * @param request - Upload payload. `request.file` is the image to upload.
   * @param requestOptions - Per-request options, e.g. `onUploadProgress` or an abort `signal`
   *   (optional).
   * @returns The upload response, with the CDN URL in `file`.
   */
  override async uploadChannelImage(
    request?: Omit<UploadChannelRequest, 'file'> & { file?: FileUploadInput },
    requestOptions?: StreamRequestOptions,
  ) {
    return await super.uploadChannelImage(
      { ...request, file: normalizeUploadFile(request?.file) as unknown as string },
      requestOptions,
    );
  }

  /** Alias for {@link uploadChannelFile}. */
  uploadFile = (...args: Parameters<Channel['uploadChannelFile']>) =>
    this.uploadChannelFile(...args);

  /** Alias for {@link uploadChannelImage}. */
  uploadImage = (...args: Parameters<Channel['uploadChannelImage']>) =>
    this.uploadChannelImage(...args);

  /**
   * Deletes a file uploaded to this channel, the same request shape as `client.deleteFile`.
   *
   * @param request - The file to delete. `request.url` is its URL.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  deleteFile(request: { url: string }, requestOptions?: StreamRequestOptions) {
    return this.deleteChannelFile(request, requestOptions);
  }

  /**
   * Deletes an image uploaded to this channel, the same request shape as `client.deleteImage`.
   *
   * @param request - The image to delete. `request.url` is its URL.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  deleteImage(request: { url: string }, requestOptions?: StreamRequestOptions) {
    return this.deleteChannelImage(request, requestOptions);
  }

  /**
   * Queries members.
   *
   * @param request - The query members request payload (optional). The inner `payload` accepts
   *   MongoDB-style filters, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`),
   *   and pagination options (`limit`, `offset`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The query members response.
   */
  async queryMembers(
    request?: { payload?: Partial<QueryMembersPayload> },
    requestOptions?: StreamRequestOptions,
  ) {
    this._checkHasId();

    return await this.getClient().queryMembers(
      {
        payload: {
          // TODO: filter_conditions should probably be optional in the OAPI spec
          ...({ type: this.type, id: this.id } as QueryMembersPayload),
          ...request?.payload,
        },
      },
      requestOptions,
    );
  }

  /**
   * Updates the channel and stores the returned channel in `this.data`.
   *
   * @param ...args - `[request, requestOptions]`. `request` is the channel update payload, e.g.
   *   `{ data: { custom: { name: 'foo' } }, message }`; `requestOptions` carries per-request options
   *   such as an abort `signal` and is never serialized into the request.
   * @returns The server response.
   */
  override async update(...args: Parameters<ChannelApi['update']>) {
    const data = await super.update(...args);
    this.data = data.channel;
    return data;
  }

  /**
   * Partially updates the channel's properties and stores the returned channel in `this.data`.
   *
   * @param update - The partial update request.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async updatePartial(
    update: UpdateChannelPartialRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    const data = await this.updateChannelPartial(update, requestOptions);

    const channel = data.channel;
    const currentCapabilities = this.data?.own_capabilities ?? [];
    const newCapabilities = channel?.own_capabilities;

    const capabilitiesChanged =
      newCapabilities &&
      [...currentCapabilities].sort().join() !== [...newCapabilities].sort().join();

    this.data = channel;
    if (capabilitiesChanged) {
      this.getClient().dispatchEvent({
        type: 'capabilities.changed',
        cid: this.cid,
        own_capabilities: newCapabilities,
      });
    }

    return data;
  }

  /**
   * Enables slow mode.
   *
   * @param coolDownInterval - The cooldown interval in seconds.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async enableSlowMode(coolDownInterval: number, requestOptions?: StreamRequestOptions) {
    return await this.update({ cooldown: coolDownInterval }, requestOptions);
  }

  /**
   * Disables slow mode.
   *
   * @param   _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async disableSlowMode(
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ cooldown: 0 }, requestOptions);
  }

  public async sendSharedLocation(location: SharedLocation & { message_id?: string }) {
    this._checkHasId();

    const messageId = location.message_id;
    const result = await queueOrRun({
      channel: this,
      client: this.getClient(),
      // Nothing to key a queue entry on without a message ID, so it runs but is not queued.
      queue: !!messageId,
      task: {
        channelId: this.id,
        channelType: this.type,
        messageId,
        payload: [{ message: { id: messageId, shared_location: location } }],
        type: 'send-message',
      },
    });

    if (location.end_at) {
      this.getClient().dispatchEvent({
        message: result.message,
        type: 'live_location_sharing.started',
      });
    }

    return result;
  }

  public async stopLiveLocationSharing(
    payload: UpdateLiveLocationRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    // Picked, not spread: callers pass a whole shared location whose extra fields must not be sent.
    const { latitude, longitude, message_id } = payload;
    const location = await this.getClient().updateLiveLocation(
      { end_at: new Date(), latitude, longitude, message_id },
      requestOptions,
    );
    this.getClient().dispatchEvent({
      live_location: location,
      type: 'live_location_sharing.stopped',
    });
  }

  /**
   * Accepts an invitation to the channel.
   *
   * @param options - Other channel update options to send with it. Defaults to `{}`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async acceptInvite(
    options: NonNullable<Parameters<ChannelApi['update']>[0]> = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ accept_invite: true, ...options }, requestOptions);
  }

  /**
   * Rejects an invitation to the channel.
   *
   * @param options - Other channel update options to send with it. Defaults to `{}`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async rejectInvite(
    options: NonNullable<Parameters<ChannelApi['update']>[0]> = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ reject_invite: true, ...options }, requestOptions);
  }

  /**
   * Adds members to the channel.
   *
   * @param request - The members to add, and any other channel update option.
   * @param request.members - User IDs, or member requests (`{ user_id, channel_role?, custom? }`).
   * @param request.message - Message object for channel members notification (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async addMembers(
    { members, ...options }: AddMembersRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      {
        add_members: members.map((member) =>
          typeof member === 'string' ? { user_id: member } : member,
        ),
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Adds filter tags to the channel.
   *
   * @param request - The tags to add, and any other channel update option.
   * @param request.tags - The tags to add.
   * @param request.message - Message object for channel members notification (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async addFilterTags(
    { tags, ...options }: FilterTagsRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ add_filter_tags: tags, ...options }, requestOptions);
  }

  /**
   * Removes filter tags from the channel.
   *
   * @param request - The tags to remove, and any other channel update option.
   * @param request.tags - The tags to remove.
   * @param request.message - Message object for channel members notification (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async removeFilterTags(
    { tags, ...options }: FilterTagsRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ remove_filter_tags: tags, ...options }, requestOptions);
  }

  /**
   * Invite members to the channel.
   *
   * @param request - The members to invite, and any other channel update option.
   * @param request.members - User IDs, or member requests (`{ user_id, custom }`).
   * @param request.message - Message object for channel members notification (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async inviteMembers(
    { members, ...options }: InviteMembersRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      {
        invites: members.map((member) =>
          typeof member === 'string' ? { user_id: member } : member,
        ),
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Removes members from the channel.
   *
   * @param request - The members to remove, and any other channel update option.
   * @param request.members - The user IDs to remove.
   * @param request.message - Message object for channel members notification (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async removeMembers(
    { members, ...options }: RemoveMembersRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ remove_members: members, ...options }, requestOptions);
  }

  /**
   * Mutes the channel.
   *
   * @example
   * // with expiration (two weeks)
   * await channel.mute({ expiration: 14 * 24 * 60 * 60 * 1000 });
   *
   * @param options - Mute options (optional).
   * @param options.expiration - Mute duration in milliseconds (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async mute(options?: Gen_MuteChannelRequest, requestOptions?: StreamRequestOptions) {
    this._checkHasId();

    return await this.getClient().muteChannel(
      {
        channel_cids: [this.cid],
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Unmutes the channel.
   *
   * @example
   * await channel.unmute();
   *
   * @param options - Unmute options (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async unmute(
    options?: Gen_UnmuteChannelRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    this._checkHasId();

    return await this.getClient().unmuteChannel(
      {
        channel_cids: [this.cid],
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Archives the channel for the current user.
   *
   * @example
   * await channel.archive();
   *
   * @param _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async archive(_request?: Record<string, never>, requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { archived: true } }, requestOptions);
  }

  /**
   * Unarchives the channel for the current user.
   *
   * @example
   * await channel.unarchive();
   *
   * @param _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async unarchive(
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.updateMemberPartial({ set: { archived: false } }, requestOptions);
  }

  /**
   * Pins the channel for the current user.
   *
   * @example
   * await channel.pin();
   *
   * @param _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async pin(_request?: Record<string, never>, requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { pinned: true } }, requestOptions);
  }

  /**
   * Unpins the channel for the current user.
   *
   * @example
   * await channel.unpin();
   *
   * @param _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async unpin(_request?: Record<string, never>, requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { pinned: false } }, requestOptions);
  }

  /**
   * Returns the mute status of the channel.
   *
   * @returns `{ muted, createdAt, expiresAt }`, the timestamps in unix nanoseconds as the API sends
   *   them.
   */
  muteStatus() {
    this._checkHasId();
    return this.getClient()._muteStatus(this.cid);
  }

  /**
   * Recomputes `state.muteStatus` from `client.mutedChannels`, publishing only on change (the client
   * calls this on every `mutedChannels` update). Unlike `muteStatus()`, it needs no channel ID.
   */
  _syncMuteStatus() {
    if (this.pendingDisposal) return;

    const next = this.getClient()._muteStatus(this.cid);
    const previous = this.state.getLatestValue().muteStatus;
    const unchanged =
      previous.muted === next.muted &&
      (previous.createdAt ?? null) === (next.createdAt ?? null) &&
      (previous.expiresAt ?? null) === (next.expiresAt ?? null);

    if (unchanged) return;

    this.state.partialNext({ muteStatus: next });
  }

  async sendAction(
    messageId: string,
    formData: Record<string, string>,
    requestOptions?: StreamRequestOptions,
  ) {
    this._checkHasId();
    return await this.getClient().runMessageAction(
      { id: messageId },
      { form_data: formData },
      requestOptions,
    );
  }

  /**
   * Call on every keystroke: sends `typing.start` at most every 2 seconds.
   *
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   *
   * @param parentId - The parent message ID, for a typing event in a thread (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async keystroke(parentId?: string, requestOptions?: StreamRequestOptions) {
    if (!this._isTypingIndicatorsEnabled()) {
      return;
    }
    const now = new Date();
    const diff = this.lastTypingEvent && now.getTime() - this.lastTypingEvent.getTime();
    this.lastKeyStroke = now;
    this.isTyping = true;
    if (diff === null || diff > 2000) {
      this.lastTypingEvent = new Date();
      await this.sendEvent(
        {
          event: {
            type: 'typing.start',
            parent_id: parentId,
          },
        },
        requestOptions,
      );
    }
  }

  /**
   * Notifies watchers of a message's AI state. Meant for the server connected to the AI service.
   *
   * @param messageId - The ID of the message associated with the AI state.
   * @param state - The new state of the AI process, e.g. thinking, generating.
   * @param options - Additional details for the event. Defaults to `{}`.
   * @param options.ai_message - Additional message detail to include in the event (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async updateAIState(
    messageId: string,
    state: AIState,
    options: { ai_message?: string } = {},
    requestOptions?: StreamRequestOptions,
  ) {
    await this.sendEvent(
      {
        event: {
          type: 'ai_indicator.update',
          // The API reads these fields from `custom`. They aren't app custom data, hence the assertion.
          custom: {
            ...options,
            message_id: messageId,
            ai_state: state,
          } as CustomEventData,
        },
      },
      requestOptions,
    );
  }

  /**
   * Sends an event to notify watchers to clear the typing/thinking UI when the AI response starts streaming.
   * Typically used by the server connected to the AI service to inform clients that the AI response has started.
   *
   * @param _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async clearAIIndicator(
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ) {
    await this.sendEvent(
      {
        event: {
          type: 'ai_indicator.clear',
        },
      },
      requestOptions,
    );
  }

  /**
   * Sends an event to stop AI response generation, leaving the message in its current state.
   * Triggered by the user to halt the AI response process.
   *
   * @param _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async stopAIResponse(
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ) {
    await this.sendEvent(
      {
        event: {
          type: 'ai_indicator.stop',
        },
      },
      requestOptions,
    );
  }

  /**
   * Resets the typing state and sends `typing.stop`.
   *
   * @param parentId - The parent message ID, for a typing event in a thread (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async stopTyping(parentId?: string, requestOptions?: StreamRequestOptions) {
    if (!this._isTypingIndicatorsEnabled()) {
      return;
    }
    this.lastTypingEvent = null;
    this.isTyping = false;
    await this.sendEvent(
      {
        event: {
          type: 'typing.stop',
          parent_id: parentId,
        },
      },
      requestOptions,
    );
  }

  _isTypingIndicatorsEnabled(): boolean {
    // No ID yet: nobody to tell.
    if (this.isProvisional) return false;
    // The resolved value (server `typing_events` ANDed with the client's setting), not the raw flag.
    const { typingEvents } = this.configController.value;
    if (!typingEvents.enabled || !this.getClient().wsConnection?.isHealthy) {
      return false;
    }
    return this.getClient().user?.privacy_settings?.typing_indicators?.enabled ?? true;
  }

  /**
   * Marks read through `MessageDeliveryReporter`: uses the `markReadRequest` handler if set, marks
   * read locally when read events are off and `localUnreadCountEnabled` is set, and drops the
   * delivery candidate when a request went out. `markRead()` does none of this.
   *
   * @param data - Mark read options. Defaults to `{}`.
   * @returns The server response, or `null` when no request went out.
   */
  async markReadViaReporter(data: MarkReadRequest = {}) {
    return await this.getClient().messageDeliveryReporter.markRead(this, data);
  }

  /**
   * Marks the channel read.
   *
   * @param ...args - `[data, requestOptions]`. `data` holds the mark-read options;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The server response.
   * @throws If the channel is not initialized or read events are disabled.
   */
  override async markRead(...args: Parameters<ChannelApi['markRead']>) {
    this._checkInitialized();

    if (!this.configController.value.readEvents.enabled) {
      throw new Error(
        "Read events are disabled — either by the channel type's `read_events` setting or by `channel.readEvents.enabled` in your configuration",
      );
    }

    return await super.markRead(...args);
  }

  /** See {@link ChannelLifecycleState.initialized}. */
  get initialized() {
    return this.state.getLatestValue().initialized;
  }

  set initialized(initialized: boolean) {
    this.state.partialNext({ initialized });
  }

  /**
   * Whether the channel has no ID yet: it was built from members and the server assigns the ID when its
   * query is answered. Until then only that query can be sent and the cid is a temporary one.
   *
   * Not reactive: subscribe to {@link Channel.initialized}, which turns `true` with the response that
   * sets `id`.
   */
  get isProvisional() {
    return !this.id;
  }

  /**
   * See {@link ChannelLifecycleState.supersededBy}. A superseded instance receives no events and
   * reports `watchStatus: NotWatching`: use its successor (`watch()` resolves with it). The SDK
   * does not disconnect it before logout, so call {@link Channel.disconnect} once nothing uses it.
   */
  get supersededBy() {
    return this.state.getLatestValue().supersededBy;
  }

  /** See {@link ChannelLifecycleState.offlineMode}. */
  get offlineMode() {
    return this.state.getLatestValue().offlineMode;
  }

  set offlineMode(offlineMode: boolean) {
    this.state.partialNext({ offlineMode });
  }

  /**
   * Reads `state.data`. Assigning publishes `data`, `memberCount` and `ownCapabilities` in one update.
   * If the object omits `member_count` or `own_capabilities`, the last known values are carried onto
   * a copy (the assigned object is not changed). Editing `channel.data.x` in place does not reach
   * the state.
   */
  get data(): Partial<ChannelResponse> | undefined {
    return this.state.getLatestValue().data;
  }

  set data(next: Partial<ChannelResponse> | undefined) {
    const previous = this.state.getLatestValue().data;
    const carriedMemberCount =
      typeof next?.member_count !== 'number' && typeof previous?.member_count === 'number'
        ? previous.member_count
        : undefined;
    // `own_capabilities` stays undefined until known, so "not loaded" isn't read as "none"
    const carriedCapabilities =
      !Array.isArray(next?.own_capabilities) && Array.isArray(previous?.own_capabilities)
        ? [...previous.own_capabilities]
        : undefined;

    const data =
      next && (carriedMemberCount !== undefined || carriedCapabilities)
        ? {
            ...next,
            ...(carriedMemberCount !== undefined && { member_count: carriedMemberCount }),
            ...(carriedCapabilities && { own_capabilities: carriedCapabilities }),
          }
        : next;

    const memberCount = data?.member_count ?? carriedMemberCount;
    const ownCapabilities = data?.own_capabilities ?? carriedCapabilities;
    this.state.partialNext({
      data,
      memberCount: memberCount ?? this.state.getLatestValue().memberCount,
      ownCapabilities: ownCapabilities ? [...ownCapabilities] : [],
    });
  }

  /**
   * See {@link ChannelLifecycleState.pendingDisposal}. Set only by {@link Channel.disconnect} and never
   * reverted: `getClient()` throws, `client.channel()` returns a fresh instance for the
   * cid, and lists and recovery skip it.
   */
  get pendingDisposal() {
    return this.state.getLatestValue().pendingDisposal;
  }

  /** See {@link ChannelWatchStatus}. */
  get watchStatus() {
    return this.state.getLatestValue().watchStatus;
  }

  set watchStatus(watchStatus: ChannelWatchStatus) {
    if (watchStatus !== ChannelWatchStatus.Watching) this.endWatch();
    this.state.partialNext({ watchStatus });
  }

  /**
   * Whether a query for this channel (`watch()`, `query()`, `create()` or one of the message
   * paginator's own queries, see {@link runTrackedQuery}) awaits its response. The channel store
   * keeps the channel meanwhile.
   *
   * @internal
   */
  get isQueryingChannel() {
    return this._channelQueriesInFlight > 0;
  }

  /** See {@link Channel.activate}. */
  get active() {
    return this.state.getLatestValue().active;
  }

  /**
   * Declares that a consumer is consuming this channel's own state and returns its release function.
   * Refcounted: the channel stays active until the last consumer releases, and releasing twice is a
   * no-op.
   *
   * While active, channel-list hydration places no page in the message list (`channel.reload()`
   * owns it), the message list keeps its active interval (otherwise a fresh newest page from a
   * query the list did not run is shown), and the channel stays in the channel store. A disposed
   * channel is not activated: a warning is logged and the returned release does nothing.
   */
  activate = (): (() => void) => {
    if (this.pendingDisposal) {
      logger.withExtraTags('activate', this.cid).warn(this.disposedError().message);
      return () => undefined;
    }
    this._activeRefCount += 1;
    if (this._activeRefCount === 1) {
      this.state.partialNext({ active: true });
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._activeRefCount -= 1;
      if (this._activeRefCount === 0) {
        this.state.partialNext({ active: false });
      }
    };
  };

  /**
   * Marks the channel unread from a message.
   *
   * @param ...args - `[data, requestOptions]`. `data` holds the mark-unread options;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The server response.
   * @throws If the channel is not initialized or read events are disabled.
   */
  override async markUnread(...args: Parameters<ChannelApi['markUnread']>) {
    this._checkInitialized();

    if (!this.configController.value.readEvents.enabled) {
      throw new Error(
        "Read events are disabled — either by the channel type's `read_events` setting or by `channel.readEvents.enabled` in your configuration",
      );
    }

    return await super.markUnread(...args);
  }

  /**
   * Resets the unread count without a backend call, for channels with read events disabled (e.g.
   * livestreams) that set `readEvents.localUnreadCountEnabled`. Dispatches the client-only
   * `message.read_locally` event, handled like `message.read` minus the delivery-report sync. With
   * offline support the reset is persisted.
   *
   * The event's `last_read_message_id` is the newest server-confirmed message, whatever its type,
   * of the interval holding the channel's newest messages
   * (`messagePaginator.anchoredHeadServerConfirmedItem`). While that interval is not loaded (e.g.
   * only a jumped-to interval is), the event carries none and the read covers everything up to its
   * `created_at`.
   *
   * @returns The dispatched `message.read_locally` event, or `undefined` if there is no connected
   *   user.
   */
  markReadLocally() {
    const client = this.getClient();
    if (!client.userId) return;

    const event: EventPayload<'message.read_locally'> = {
      channel_id: this.id,
      channel_type: this.type,
      cid: this.cid,
      created_at: nowNs(),
      last_read_message_id: this.messagePaginator.anchoredHeadServerConfirmedItem?.id,
      team: this.data?.team,
      type: 'message.read_locally',
      user: client.user as UserResponse,
    };
    client.dispatchEvent(event);

    return event;
  }

  /**
   * Sends `typing.stop` after a second without a keystroke, drops stale typing users, and resets a
   * stuck AI indicator while the connection is unhealthy. Run by the client's cleaning interval.
   *
   * @internal
   */
  clean() {
    if (this.lastKeyStroke) {
      const now = new Date();
      const diff = now.getTime() - this.lastKeyStroke.getTime();
      if (diff > 1000 && this.isTyping) {
        logChatPromiseExecution(this.stopTyping(), 'stop typing event');
      }
    }

    this.state.clean();

    // Clears an AI indicator stuck because the ending clear/stop was missed while offline. Gated on
    // health, not staleness: a healthy connection must not cut off a long-running response.
    const client = this.getClient();
    if (!client.wsConnection?.isHealthy) {
      this.state.resetAIState();
    }
  }

  /**
   * Watches the channel and loads its state and messages. Sends nothing when that is done already
   * (`Watching`, `initialized` and `messagePaginator.hasResults`) and the call asks for nothing
   * new: it passes no options, or the same options as the last `watch()` that succeeded during the
   * current watch. Other options, e.g. `presence: true`, send a query. A `watch()` already in
   * flight with the same options is joined, not repeated.
   * Refresh a watched channel with {@link Channel.reload}. Rejects with the query's error.
   *
   * @param options - Options for the watch query (optional).
   * @param requestOptions - Per-request options (optional). Aborting `signal` ends this caller's
   *   wait (at once if aborted already); the query is cancelled once every waiting caller has
   *   aborted. The other options apply only when this call sends the query.
   * @returns The instance to use: this one, or the one that superseded it ({@link supersededBy}).
   */
  async watch(
    options?: ChannelGetOrCreateRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<Channel> {
    // The caller's signal ends only its own wait; the query it may share has its own.
    const { signal, ...queryRequestOptions } = requestOptions ?? {};
    if (signal?.aborted) throw abortError(signal, WATCH_WAIT_ABORTED);
    if (this.supersededBy) return this.supersededBy.watch(options, requestOptions);
    // a copy: later changes to the caller's object must not change what is remembered or joined
    const requested = structuredClone(options ?? {});
    if (this.hasNothingToSend(requested)) return this;
    const watchQuery =
      this.findJoinableWatchQuery(requested) ??
      this.sendWatchQuery(requested, queryRequestOptions);
    watchQuery.waitingCount += 1;
    await waitUnlessAborted({
      abortMessage: WATCH_WAIT_ABORTED,
      onAbort: () => this.leaveWatchQuery(watchQuery),
      promise: watchQuery.promise,
      signal,
    });
    // The query may have handed the channel to an instance stored under the server's cid, which
    // has taken in the response already.
    return this.state.getLatestValue().supersededBy ?? this;
  }

  /**
   * Whether {@link Channel.watch} has nothing to send. Each part holds without the others: a
   * thread query watches a channel and loads nothing, `query()` / `create()` load no messages, and
   * a custom `doRequest` loads messages but no channel state.
   */
  private get isWatchedAndLoaded() {
    return (
      this.watchStatus === ChannelWatchStatus.Watching &&
      this.initialized &&
      this.messagePaginator.hasResults
    );
  }

  /** Whether a {@link Channel.watch} with `options` has nothing to send. */
  private hasNothingToSend(options: ChannelGetOrCreateRequest) {
    return this.isWatchedAndLoaded && this.asksNothingNew(options);
  }

  /**
   * Whether a {@link Channel.watch} with `options` asks for nothing the current watch lacks: a call
   * without options asks for the watch alone; any other must repeat the last successful one.
   */
  private asksNothingNew(options: ChannelGetOrCreateRequest) {
    return !hasWatchOptions(options) || isEqual(this._lastWatchOptions, options);
  }

  /** The watch query in flight, sent with these options, that a {@link Channel.watch} can join. */
  private findJoinableWatchQuery(options: ChannelGetOrCreateRequest) {
    return this._watchQueriesInFlight.find((watchQuery) =>
      isEqual(watchQuery.options, options),
    );
  }

  /**
   * Sends the query {@link Channel.watch} callers wait for. It is cancelled through an abort
   * controller of its own, once no caller waits any more ({@link leaveWatchQuery}).
   */
  private sendWatchQuery(
    options: ChannelGetOrCreateRequest,
    requestOptions: Omit<StreamRequestOptions, 'signal'>,
  ): WatchQueryInFlight {
    const abortController = new AbortController();
    const promise = this.runWatchQuery(options, {
      ...requestOptions,
      signal: abortController.signal,
    });
    const watchQuery = { abortController, options, promise, waitingCount: 0 };
    this._watchQueriesInFlight.push(watchQuery);
    const endedWatchCountAtSend = this._endedWatchCount;
    const forget = () => this.forgetWatchQuery(watchQuery);
    // callers get the rejection through `promise`; this only clears the entry
    promise.then(() => {
      forget();
      const successor = this.state.getLatestValue().supersededBy;
      // the instance that took the channel over also took in this response
      if (successor) successor.rememberWatchOptions(options);
      else if (this._endedWatchCount === endedWatchCountAtSend) {
        this.rememberWatchOptions(options);
      }
    }, forget);
    return watchQuery;
  }

  /** A caller stops waiting; the last one cancels and forgets the query, so the next is new. */
  private leaveWatchQuery(watchQuery: WatchQueryInFlight) {
    watchQuery.waitingCount -= 1;
    if (watchQuery.waitingCount) return;
    this.forgetWatchQuery(watchQuery);
    watchQuery.abortController.abort();
  }

  /** Notes what a successful {@link Channel.watch} query asked for, if the channel is watched. */
  private rememberWatchOptions(options: ChannelGetOrCreateRequest) {
    if (this.watchStatus === ChannelWatchStatus.Watching)
      this._lastWatchOptions = options;
  }

  /** The watch ended: what it was asked for does not carry over to the next one. */
  private endWatch() {
    this._lastWatchOptions = undefined;
    this._endedWatchCount += 1;
  }

  /** Stops offering `watchQuery` to {@link Channel.watch} callers. */
  private forgetWatchQuery(watchQuery: WatchQueryInFlight) {
    this._watchQueriesInFlight = this._watchQueriesInFlight.filter(
      (inFlight) => inFlight !== watchQuery,
    );
  }

  /**
   * Sends a watch query, watched or not, and places the page it fetched (a page at a cursor or
   * around a message is only stored; `messagePaginator.jumpToMessage()` shows it).
   * `requestOptions.signal` also ends the wait for a live socket.
   */
  private async runWatchQuery(
    options?: ChannelGetOrCreateRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<void> {
    const defaultOptions = {
      state: true,
      watch: true,
      presence: false,
    };

    const combined = { ...defaultOptions, ...options };

    // `ApiClient` holds a request that watches or subscribes to presence until the handshake yields a
    // connection ID, so `watch: true` binds to a current one and `watchStatus = Watching` is truthful.
    const state = await this.runChannelQuery(combined, requestOptions, {
      placeMessages: true,
    });
    this.data = state.channel;

    logger.withExtraTags('watch', this.cid).info('Started watching the channel.');
  }

  /**
   * Re-watches the channel and refreshes its whole loaded message interval (the channel analogue of
   * {@link Thread.reload}). Used on reconnect. Hard deletes reach other clients through no event, so
   * the watch query reconciles the loaded newest messages with the re-queried page
   * (`messagePaginator.reconcileNewestMessages`, against the loaded IDs captured before its await).
   *
   * Failed (unsent) messages are kept: those loaded or in the offline DB (cold boot, eviction)
   * before the request that are no longer loaded after it are ingested again. The offline DB is
   * read on a best-effort basis.
   */
  async reload() {
    if (this._reloading || (!this.initialized && !this.offlineMode)) return;
    this._reloading = true;
    try {
      const paginator = this.messagePaginator;
      // The reload refreshes the interval that reaches the newest message, sized to what it holds.
      const requestedLimit =
        Math.max(paginator.anchoredHeadItems.length, paginator.pageSize ?? 0) ||
        undefined;
      const offlineDb = this.getClient().offlineDb;
      // best effort: a failing read must not fail the reload
      const failedInDb = offlineDb
        ? await offlineDb.getFailedMessages({ cid: this.cid }).catch(() => [])
        : [];
      // after the read: a message that fails meanwhile is loaded by then
      const failedBefore = paginator.getFailedMessagesToRestore(failedInDb);

      await this.runWatchQuery({ messages: { limit: requestedLimit } });
      this.offlineMode = false;

      paginator.restoreFailedMessages(failedBefore);
    } finally {
      this._reloading = false;
    }
  }

  /**
   * Stops watching the channel.
   *
   * @param ...args - `[request, requestOptions]`. `request` is the stop-watching payload;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The server response.
   */
  override async stopWatching(...args: Parameters<ChannelApi['stopWatching']>) {
    const response = await super.stopWatching(...args);

    // Unlike a connection loss, this is not restored on reconnect.
    this.watchStatus = ChannelWatchStatus.NotWatching;

    logger.withExtraTags('stopWatching', this.cid).info('Stopped watching the channel.');

    return response;
  }

  /**
   * Retrieves messages of this channel by ID.
   *
   * @param messageIds - The IDs of the messages to retrieve.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  getMessagesById(messageIds: string[], requestOptions?: StreamRequestOptions) {
    return this.getManyMessages({ ids: messageIds }, requestOptions);
  }

  /**
   * Returns when the current user last marked the channel read.
   *
   * @returns The last-read timestamp in unix nanoseconds, `null` if never read, or `undefined` if
   *   the user is unset.
   */
  lastRead() {
    const { userId } = this.getClient();
    if (userId) {
      return this.state.read[userId] ? this.state.read[userId].last_read : null;
    }
  }

  _countMessageAsUnread(message: LocalMessage | MessageResponse) {
    if (message.shadowed) return false;
    if (message.silent) return false;
    if (isThreadOnlyReply(message)) return false;
    if (message.user?.id === this.getClient().userId) return false;
    if (message.user?.id && this.getClient().userMuteStatus(message.user.id))
      return false;

    // Not counted when read events are disabled, unless `readEvents.localUnreadCountEnabled` is set.
    if (!this.config.readEvents.localUnreadCountEnabled && !channelHasReadEvents(this)) {
      return false;
    }

    // FIXME: see #1265, adjust and count new messages even when the channel is muted
    if (this.muteStatus().muted) return false;

    return true;
  }

  /**
   * Counts the unread messages.
   *
   * Counting from `lastRead` counts within the channel's newest messages that are loaded (see
   * {@link newestKnownMessages}).
   *
   * @param lastRead - The time the user read a message, in unix nanoseconds (optional). Defaults to
   *   the current user's read state.
   * @returns The unread count.
   */
  countUnread(lastRead?: TimestampNS | null) {
    // Nullish, not falsy: `0` is a valid timestamp.
    if (lastRead == null) return this.state.unreadCount;
    let count = 0;
    const latestMessages = this.newestKnownMessages();
    for (let i = 0; i < latestMessages.length; i += 1) {
      const message = latestMessages[i];
      if (message.created_at > lastRead && this._countMessageAsUnread(message)) {
        count++;
      }
    }
    return count;
  }

  /**
   * The channel's newest messages that are loaded: the interval that reaches the newest message (the
   * paginator's anchored head), or, while that interval is not loaded, the messages received live
   * since. An interval reached by a jump is never part of it, as the messages between it and the
   * newest are unknown.
   */
  private newestKnownMessages() {
    const paginator = this.messagePaginator;
    return paginator.anchoredHeadItem !== undefined
      ? paginator.anchoredHeadItems
      : paginator.logicalHeadItems;
  }

  /**
   * Counts the unread messages that mention the current user, within the channel's newest messages
   * that are loaded (see {@link newestKnownMessages}).
   *
   * @returns The unread mentions count.
   */
  countUnreadMentions() {
    const lastRead = this.lastRead();
    const userId = this.getClient().userId;

    let count = 0;
    const latestMessages = this.newestKnownMessages();
    for (let i = 0; i < latestMessages.length; i += 1) {
      const message = latestMessages[i];
      if (
        this._countMessageAsUnread(message) &&
        (lastRead == null || message.created_at > lastRead) &&
        message.mentioned_users?.some((user) => user.id === userId)
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Creates the channel without watching it.
   *
   * @param options - Channel query options (optional).
   * @returns The server response.
   */
  create = async (options?: ChannelGetOrCreateRequest) => {
    const defaultOptions = {
      ...options,
      watch: false,
      state: false,
      presence: false,
    };
    // It asks for no channel state (`state: false`), so it brings no page of messages to place.
    return await this.runChannelQuery(defaultOptions, undefined, {
      placeMessages: false,
    });
  };

  /**
   * Moves this channel, created without an ID, from its temporary cid to the one the server gave it.
   * If another instance already holds that cid, it stays stored and takes over from this one
   * ({@link ChannelManager.supersedeChannel}).
   */
  private storeUnderServerCid(
    response: ChannelStateResponseFields,
    { watch }: { watch?: boolean },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const serverCid = response.channel!.cid;
    const { channelManager } = this.getClient();
    const storedUnder = this.cid;
    this.cid = serverCid;
    const isStoredUnderOldCid =
      storedUnder !== serverCid && channelManager.get(storedUnder) === this;
    // A disconnected channel is replaced by this instance, not superseded by it.
    if (channelManager.get(serverCid)?.pendingDisposal) {
      channelManager.removeChannel(serverCid);
    }
    const stored = channelManager.get(serverCid);

    if (!stored) {
      if (
        !isStoredUnderOldCid ||
        !channelManager.changeChannelId(storedUnder, serverCid)
      ) {
        channelManager.getOrCreateChannel(serverCid, () => this);
      }
      return;
    }

    if (stored === this) return;
    logger
      .withExtraTags('query', serverCid)
      .warn(
        'Another instance of this channel is stored and takes over from this one (see channel.supersededBy).',
      );
    channelManager.supersedeChannel(this, stored, response, {
      storedUnder: isStoredUnderOldCid ? storedUnder : undefined,
      watch,
    });
  }

  /**
   * Queries the API for messages, members and other channel fields.
   *
   * The returned messages are not added to {@link Channel.messagePaginator}: the paginator loads its
   * own pages, and {@link Channel.watch} / {@link Channel.create} place the page they query.
   *
   * @param options - The query options (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The query response.
   */
  async query(
    options: ChannelGetOrCreateRequest = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.runChannelQuery(options, requestOptions, { placeMessages: false });
  }

  /**
   * The query behind `query()`, `watch()` and `create()`, in three steps: sends the request
   * ({@link requestChannelState}), has the message paginator place the returned page when
   * `placeMessages` is set (a watch query), then applies the rest of the response
   * ({@link applyChannelStateFromResponse}), all as a tracked query ({@link runTrackedQuery}).
   *
   * The page is placed before the rest is applied, because the rest reads the loaded messages: read
   * and delivery positions that come without a message id are looked up among them, and the latest
   * message is reported as delivered. A first page then takes the unread snapshot, from the read
   * state the rest brought. The message paginator's own queries keep the same order: they place
   * their page, then apply the rest with {@link applyChannelStateFromResponse}.
   */
  private async runChannelQuery(
    options: ChannelGetOrCreateRequest,
    requestOptions: StreamRequestOptions | undefined,
    { placeMessages }: { placeMessages: boolean },
  ) {
    return await this.runTrackedQuery(async () => {
      const externalQuery = placeMessages
        ? this.messagePaginator.prepareExternalQuery(options.messages)
        : undefined;
      const state = await this.requestChannelState(
        externalQuery
          ? { ...options, messages: externalQuery.messagePaginationParams }
          : options,
        requestOptions,
        { placesNewestPage: externalQuery?.isNewestPage ?? false },
      );
      let placedFirstPage = false;
      try {
        if (externalQuery && Array.isArray(state.messages)) {
          placedFirstPage = externalQuery.placePage(state.messages.map(formatMessage));
        }
      } finally {
        // The rest of a response that arrived is applied even when placing its page failed: a
        // watch the server registered is recorded, and the read state is taken in.
        // Only the newest page is the latest message set, for the offline database to store.
        this.applyChannelStateFromResponse(state, {
          isLatestMessageSet: externalQuery?.isNewestPage ?? false,
          watch: options.watch,
        });
      }
      if (placedFirstPage) this.messagePaginator.seedUnreadSnapshot();
      return state;
    });
  }

  /**
   * Runs `run`, a query of this channel, as a tracked query: refused for a disposed instance, and
   * the channel counts as being queried until `run` settles ({@link isQueryingChannel}), so the
   * channel store keeps it meanwhile. Used by {@link runChannelQuery} and by the message
   * paginator's own queries.
   *
   * `run` starts synchronously: a paginator query publishes its loading flag before anything is
   * awaited, which keeps a second query in the same tick from starting.
   *
   * @internal
   */
  async runTrackedQuery<T>(run: () => Promise<T>): Promise<T> {
    // A disposed instance is done for good: its query would load it again and, for a watch,
    // register a watch whose events go to the instance now stored for the cid. So it is refused.
    if (this.pendingDisposal) throw this.disposedError();
    // a count, not a flag: queries of one channel overlap (a watch while the paginator loads more)
    this._channelQueriesInFlight += 1;
    try {
      return await run();
    } finally {
      this._channelQueriesInFlight -= 1;
    }
  }

  /**
   * Sends the channel query and takes in what the response says about the channel itself: its id,
   * the cid it is stored under, its config, and its `last_message_at`, against which the message
   * paginator's head interval is checked before any page is placed (see
   * `MessagePaginator.unmarkStaleHead`). The request of {@link runChannelQuery} and of the message
   * paginator's own queries, which run it as a tracked query ({@link runTrackedQuery}); it does not
   * track the query itself. Refused for a disposed instance, before anything is sent.
   *
   * `placesNewestPage`: the caller places the newest page with this response, which brings the
   * newest messages up to date, so the head interval is not checked.
   *
   * @internal
   */
  async requestChannelState(
    options: ChannelGetOrCreateRequest,
    requestOptions: StreamRequestOptions | undefined,
    { placesNewestPage = false }: { placesNewestPage?: boolean } = {},
  ): Promise<StreamResponse<ChannelStateResponse>> {
    if (this.pendingDisposal) throw this.disposedError();
    const queryPayload: ChannelGetOrCreateRequest = {
      data: this._data,
      state: true,
      ...options,
    };

    const state = this.id
      ? await this.getOrCreate(queryPayload, requestOptions)
      : await this.getClient().getOrCreateDistinctChannel(
          { type: this.type },
          queryPayload,
          requestOptions,
        );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const channel = state.channel!;

    if (!this.id) {
      this.id = channel.id;
      this.storeUnderServerCid(state, { watch: queryPayload.watch });
    }

    this.getClient()._addChannelConfig(channel);

    // The composer's server config arrives here for a channel opened via `ensure({ type, id })`. A
    // composer with registered subscriptions hears it through the store, one without is told here.
    // Applied as restrictions: `updateConfig` would record a server permission as a client request and
    // re-enable a feature the integrator turned off.
    this.messageComposer.applyServerRestrictions();

    // This response's `last_message_at`, before any page is placed: the paginator tells from it whether
    // a page reaches the newest message (`_initializeState` sets it too, after).
    this.messagePaginator.setQueriedLatestMessageAt(channel.last_message_at);
    // Checked before any page is placed, as a page that reaches the newest message marks its own
    // interval as the head.
    if (!placesNewestPage && this.isHeadLeftWithoutRefresh(queryPayload)) {
      this.messagePaginator.unmarkStaleHead();
    }

    return state;
  }

  /**
   * Whether nothing but this query brings the head interval up to date, so its `last_message_at` may
   * show the interval stale: the watch was stopped (`NotWatching`), or this query itself watches
   * again after a dropped connection (`WasWatching`), leaving nothing to re-watch with the newest
   * page. While the channel is watched, a message the interval lacks is still on its way; after a
   * dropped connection, the re-watch that follows places the newest page (see
   * `ConnectionRecoveryManager`).
   */
  private isHeadLeftWithoutRefresh(query: ChannelGetOrCreateRequest): boolean {
    if (this.watchStatus === ChannelWatchStatus.NotWatching) return true;
    return this.watchStatus === ChannelWatchStatus.WasWatching && !!query.watch;
  }

  /**
   * Applies a channel query response: watch status, read/members state, polls, reminders, composer,
   * channel data, and the `channels.queried` event and offline write. Called once the response's
   * page of messages, if any, is placed (see {@link runChannelQuery}).
   *
   * @internal
   */
  applyChannelStateFromResponse(
    state: ChannelStateResponseFields,
    { isLatestMessageSet, watch }: { isLatestMessageSet: boolean; watch?: boolean },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const channel = state.channel!;

    if (this.supersededBy) {
      // The stored instance took over the watch (`supersedeChannel`), so this one receives no events.
      this.watchStatus = ChannelWatchStatus.NotWatching;
    } else if (watch) {
      // Set only here: a `watch: false` query does not unwatch server-side, so it must not clear it.
      this.watchStatus = ChannelWatchStatus.Watching;
    }

    // Seeds read, members, pinned and thread-cleanup state (messages live in the paginator).
    this._initializeState(state);
    this.getClient().polls.hydratePollCache(state.messages, true);
    this.getClient().reminders.hydrateState(state.messages);

    this.messageComposer.initStateFromChannelResponse(state);

    const areCapabilitiesChanged =
      [...(channel.own_capabilities || [])].sort().join() !==
      [
        ...(this.data && Array.isArray(this.data?.own_capabilities)
          ? this.data.own_capabilities
          : []),
      ]
        .sort()
        .join();
    this.data = channel;
    // One update before the events below: the offline DB reads it when handling them.
    this.state.partialNext({ initialized: true, offlineMode: false });

    if (areCapabilitiesChanged) {
      this.getClient().dispatchEvent({
        type: 'capabilities.changed',
        cid: this.cid,
        own_capabilities: channel.own_capabilities ?? [],
      });
    }

    this.getClient().dispatchEvent({
      type: 'channels.queried',
      queriedChannels: {
        channels: [state],
        isLatestMessageSet,
      },
    });
    this.getClient().offlineDb?.executeQuerySafely(
      (db) =>
        db.upsertChannels?.({
          channels: [state],
          isLatestMessagesSet: isLatestMessageSet,
        }),
      { method: 'upsertChannels' },
    );

    this.getClient().syncDeliveredCandidates([this]);
  }

  /**
   * Bans a user from this channel.
   *
   * @param targetUserId - The user to ban.
   * @param options - Ban options.
   * @returns The server response.
   */
  async banUser(targetUserId: string, options: Omit<BanUserOptions, 'channel_cid'>) {
    this._checkHasId();

    return await this.getClient().moderation.ban({
      ...options,
      target_user_id: targetUserId,
      channel_cid: this.cid,
    });
  }

  /**
   * Removes the bans of a user on this channel.
   *
   * @param targetUserId - The user to unban.
   * @param options - Unban options (optional).
   * @returns The server response.
   */
  async unbanUser(targetUserId: string, options?: UnBanUserOptions) {
    this._checkHasId();

    return await this.getClient().unbanUser(targetUserId, {
      ...options,
      type: this.type,
      id: this.id,
    });
  }

  /**
   * Casts a vote on a poll. `removeVote()` removes one.
   *
   * @param ...args - `[pathParams, request, requestOptions]`. `pathParams` holds the target
   *   `message_id` and `poll_id`; `request` holds the vote to cast; `requestOptions` carries
   *   per-request options such as an abort `signal` and is never serialized into the request.
   * @returns The poll vote response.
   */
  async vote(...args: Parameters<ChatApi['castPollVote']>) {
    this._checkHasId();
    return await this.getClient().castPollVote(...args);
  }

  async removeVote(...args: Parameters<ChatApi['deletePollVote']>) {
    this._checkHasId();
    return await this.getClient().deletePollVote(...args);
  }

  async _createDraft(...args: Parameters<ChannelApi['createDraft']>) {
    return await super.createDraft(...args);
  }

  /** Creates or updates a draft. With offline support the call is queued and replayed on reconnect. */
  override async createDraft(...args: Parameters<ChannelApi['createDraft']>) {
    this._checkHasId();

    const [request] = args;

    return await queueOrRun({
      channel: this,
      client: this.getClient(),
      task: {
        channelId: this.id,
        channelType: this.type,
        threadId: request.message?.parent_id,
        payload: args,
        type: 'create-draft',
      },
    });
  }

  async _deleteDraft(...args: Parameters<ChannelApi['deleteDraft']>) {
    return await super.deleteDraft(...args);
  }

  /** Deletes a draft. With offline support the call is queued and replayed on reconnect. */
  override async deleteDraft(...args: Parameters<ChannelApi['deleteDraft']>) {
    this._checkHasId();

    const [request] = args;

    return await queueOrRun({
      channel: this,
      client: this.getClient(),
      task: {
        channelId: this.id,
        channelType: this.type,
        threadId: request?.parent_id,
        payload: args,
        type: 'delete-draft',
      },
    });
  }

  /**
   * Listens to events on this channel. A callback alone listens to all events.
   *
   * @example
   * channel.on('message.new', (event) => {
   *   console.log('my new message', event, channel.state.messages);
   * });
   *
   * @example
   * channel.on((event) => {
   *   console.log(event.type);
   * });
   *
   * @param eventType - The event type to listen for.
   * @param callback - Called with each event of that type.
   * @returns An object with an `unsubscribe()` method.
   */
  on<T extends EventType>(
    eventType: T,
    callback: EventHandler<T>,
  ): { unsubscribe: () => void };
  /**
   * Listens to all events on this channel.
   *
   * @param callback - Called with every event.
   * @returns An object with an `unsubscribe()` method.
   */
  on(callback: EventHandler): { unsubscribe: () => void };
  on(
    callbackOrString: EventHandler | EventType,
    callbackOrNothing?: EventHandler,
  ): { unsubscribe: () => void } {
    const key = callbackOrNothing ? (callbackOrString as EventType) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    const set = this.listeners.get(key) ?? new Set();

    logger
      .withExtraTags('on', this.cid)
      .debug(`Attaching a listener for the "${key}" event.`);
    set.add(callback);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, set);
    }

    return {
      unsubscribe: () => {
        logger
          .withExtraTags('on', this.cid)
          .debug(`Removing the listener for the "${key}" event.`);
        set.delete(callback);
        if (!set.size) {
          this.listeners.delete(key);
        }
      },
    };
  }

  /**
   * Removes a listener for one event type.
   *
   * @param eventType - The event type it listens to.
   * @param callback - The listener to remove.
   */
  off<T extends EventType>(eventType: T, callback: EventHandler<T>): void;
  /**
   * Removes a listener for all events.
   *
   * @param callback - The listener to remove.
   */
  off(callback: EventHandler): void;
  off(
    callbackOrString: EventHandler | EventType,
    callbackOrNothing?: EventHandler,
  ): void {
    const key = callbackOrNothing ? (callbackOrString as EventType) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    logger
      .withExtraTags('off', this.cid)
      .debug(`Removing the listener for the "${key}" event.`);

    const set = this.listeners.get(key);

    set?.delete(callback);

    if (!set?.size) {
      this.listeners.delete(key);
    }
  }

  private _patchReadState(
    patch: (currentReadState: ChannelState['read']) => ChannelState['read'],
    reconcileMeta?: ReadStoreReconcileMeta,
  ) {
    let hasStateChanged = false;
    this.messageReceiptsTracker.setPendingReadStoreReconcileMeta(reconcileMeta);

    this.state.next((currentState) => {
      const nextReadState = patch(currentState.read);

      if (nextReadState === currentState.read) {
        return currentState;
      }
      hasStateChanged = true;

      return {
        ...currentState,
        read: nextReadState,
      };
    });

    if (!hasStateChanged) {
      this.messageReceiptsTracker.setPendingReadStoreReconcileMeta(undefined);
    }
  }

  private _upsertReadState(
    userId: string,
    update: (
      currentUserReadState: ChannelState['read'][string] | undefined,
    ) => ChannelState['read'][string],
    reconcileMeta?: ReadStoreReconcileMeta,
  ) {
    let nextUserReadState: ChannelState['read'][string] | undefined;

    this._patchReadState((currentReadState) => {
      const currentUserReadState = currentReadState[userId];
      const updatedUserReadState = update(currentUserReadState);

      nextUserReadState = updatedUserReadState;

      return {
        ...currentReadState,
        [userId]: updatedUserReadState,
      };
    }, reconcileMeta);

    return nextUserReadState;
  }

  /**
   * Sets the current user's unread count in `read[userId].unread_messages`, the one place it lives
   * (`state.unreadCount` derives from it). Returns whether the count changed.
   */
  _setOwnUnreadCount(unreadCount: number): boolean {
    if (this.pendingDisposal) return false;

    const userId = this.getClient().userId;
    if (!userId) return false;

    const currentUserReadState = this.state.read[userId];
    // Only updates an existing read entry, never creates one.
    if (!currentUserReadState || currentUserReadState.unread_messages === unreadCount) {
      return false;
    }

    this._upsertReadState(
      userId,
      () => ({ ...currentUserReadState, unread_messages: unreadCount }),
      { changedUserIds: [userId] },
    );

    return true;
  }

  _handleChannelEvent(event: Event) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const channel = this;
    logger
      .withExtraTags('_handleChannelEvent', this.cid)
      .debug(`Received an event of type "${event.type}".`, { event });

    const channelState = channel.state;

    // The server unhides a channel on any new message without sending `channel.visible`.
    if (
      (event.type === 'message.new' || event.type === 'notification.message_new') &&
      channel.data?.hidden
    ) {
      channel.data = { ...channel.data, hidden: false };
    }

    switch (event.type) {
      case 'typing.start':
        if (event.user?.id) {
          channelState.setTypingEvent(event.user.id, event);
        }
        break;
      case 'typing.stop':
        if (event.user?.id) {
          channelState.removeTypingEvent(event.user.id);
        }
        break;
      case 'ai_indicator.update':
        channelState.partialNext({
          aiState: (event.ai_state as AIState) ?? AIStates.Idle,
        });
        break;
      case 'ai_indicator.clear':
        channelState.partialNext({ aiState: AIStates.Idle });
        break;
      case 'ai_indicator.stop':
        channelState.partialNext({ aiState: AIStates.Stop });
        break;
      // `notification.mark_read` is the only read signal for a channel the user is not watching
      // (`message.read` goes to watchers only). `message.read_locally` is the local stand-in when read
      // events are disabled. All share the `message.read` logic.
      case 'notification.mark_read':
      case 'message.read_locally':
      case 'message.read':
        if (
          event.user?.id &&
          event.created_at != null &&
          // A thread read (`thread_id` on `notification.mark_read`, `thread` on `message.read`) is the
          // `thread` object's business and must not reset the channel's unread count.
          !(event.type === 'notification.mark_read' && event.thread_id) &&
          !('thread' in event && event.thread)
        ) {
          const eventUser = event.user;
          const readAt = event.created_at;
          this._upsertReadState(
            eventUser.id,
            (currentUserReadState) => {
              const currentDeliveredAt = currentUserReadState?.last_delivered_at;

              return {
                ...currentUserReadState,
                last_read: readAt,
                last_read_message_id: event.last_read_message_id,
                last_delivered_at:
                  !currentDeliveredAt || currentDeliveredAt < readAt
                    ? readAt
                    : currentDeliveredAt,
                last_delivered_message_id:
                  !currentDeliveredAt || currentDeliveredAt < readAt
                    ? (event.last_read_message_id ??
                      currentUserReadState?.last_delivered_message_id)
                    : currentUserReadState?.last_delivered_message_id,
                first_unread_message_id: undefined,
                user: eventUser,
                unread_messages: 0,
              };
            },
            { changedUserIds: [eventUser.id] },
          );

          const client = this.getClient();
          const isOwnEvent = event.user?.id === client.user?.id;

          if (isOwnEvent) {
            // Delivery reporting buffers a `markChannelsDelivered` request, which a local read must not
            // trigger: only the server `message.read` syncs.
            if (event.type === 'message.read') {
              client.syncDeliveredCandidates([this]);
            }
          }
        }
        break;
      case 'message.delivered':
        // todo: update also on thread
        if (event.user?.id && event.created_at != null) {
          const eventUser = event.user;
          const createdAt = event.created_at;
          // `last_delivered_at` arrives as RFC3339 (the spec declares a bare string) while `created_at`
          // is unix nanoseconds. Normalized to nanoseconds, falling back to `created_at` when absent or
          // unparseable.
          // TODO: report upstream — this field should be a `date-time` like every other timestamp.
          const parsedDeliveredAt = event.last_delivered_at
            ? Date.parse(event.last_delivered_at)
            : NaN;
          const resolvedDeliveredAt = Number.isFinite(parsedDeliveredAt)
            ? msToNs(parsedDeliveredAt)
            : createdAt;
          this._upsertReadState(
            eventUser.id,
            (currentUserReadState) => {
              const currentDeliveredAt = currentUserReadState?.last_delivered_at;
              const currentReadAt = currentUserReadState?.last_read;

              return {
                ...currentUserReadState,
                last_delivered_at:
                  currentDeliveredAt && currentDeliveredAt > resolvedDeliveredAt
                    ? currentDeliveredAt
                    : resolvedDeliveredAt,
                last_delivered_message_id:
                  currentDeliveredAt && currentDeliveredAt > resolvedDeliveredAt
                    ? currentUserReadState?.last_delivered_message_id
                    : event.last_delivered_message_id,
                user: eventUser,
                // delivery events can be received before read events
                last_read: currentReadAt ?? createdAt,
                unread_messages: currentUserReadState?.unread_messages ?? 0,
              };
            },
            { changedUserIds: [eventUser.id] },
          );

          const client = this.getClient();
          const isOwnEvent = event.user?.id === client.user?.id;

          // Do not report deliveries the own user already confirmed from another device.
          if (isOwnEvent) {
            client.syncDeliveredCandidates([this]);
          }
        }
        break;
      case 'user.watching.start':
      case 'user.updated':
        if (event.user?.id) {
          channelState.watchers[event.user.id] = event.user;
          channel.getClient().state.updateUserReference(event.user, channel.cid);
        }
        break;
      case 'user.watching.stop':
        if (event.user?.id) {
          delete channelState.watchers[event.user.id];
        }
        break;
      case 'message.deleted':
        if (event.message) {
          this._extendEventWithOwnReactions(event);
          const formattedMessage = formatMessage(event.message);
          // Thread-only replies are handled by the Thread object; the channel owns the main list.
          if (!isThreadOnlyReply(event.message)) {
            if (event.hard_delete) {
              this.messagePaginator.removeItem({ id: event.message.id });
              this.pinnedMessagesPaginator.removeItem({ id: event.message.id });
            } else {
              // A soft delete changes neither `created_at` nor `pinned`: one store write reaches every
              // holder, where an `ingestItem` per collection would re-emit each active interval.
              const store = this.getClient().messageStore;
              if (store.has(event.message.id)) store.upsert(formattedMessage);
            }
          }
          this.messagePaginator.reflectQuotedMessageUpdate(formattedMessage);
          this.pinnedMessagesPaginator.reflectQuotedMessageUpdate(formattedMessage);
        }
        break;
      case 'user.messages.deleted':
        if (event.user) {
          const deletedAt = event.created_at ?? nowNs();
          const hardDelete = !!event.hard_delete;
          this.messagePaginator.applyMessageDeletionForUser({
            userId: event.user.id,
            hardDelete,
            deletedAt,
          });
          this.pinnedMessagesPaginator.applyMessageDeletionForUser({
            userId: event.user.id,
            hardDelete,
            deletedAt,
          });
        }
        break;
      case 'message.new':
        if (event.message) {
          const client = this.getClient();
          const ownMessage = event.user?.id === client.user?.id;
          const isThreadMessage = isThreadOnlyReply(event.message);
          if (!isThreadMessage) {
            // `ingestItem` advances the tracked latest message. A message arriving while the viewer
            // is in an older interval lands in the head interval, leaving the view as it is.
            const formattedMessage = formatMessage(event.message);
            this.messagePaginator.ingestItem(formattedMessage);
            // Added only when pinned (`matchesFilter`).
            this.pinnedMessagesPaginator.ingestItem(formattedMessage);
          }

          // The back-end does not count own messages or thread replies as unread.
          const preventUnreadCountUpdate = ownMessage || isThreadMessage;
          if (preventUnreadCountUpdate) break;

          // The own row bumps only for a message that counts as unread and arrives outside the live
          // view (the SDK marks it read there). Other users' rows always bump: they are receipt data.
          const countsAsOwnUnread =
            !this.messagePaginator.isViewingLive &&
            this._countMessageAsUnread(event.message);

          if (event.user?.id) {
            const eventUser = event.user;
            const eventUserId = eventUser.id;
            const createdAt = event.created_at ?? nowNs();
            const eventMessageId = event.message.id;
            const ownUserId = client.userId;
            this._patchReadState(
              (currentReadState) => {
                const userIds = Object.keys(currentReadState);
                if (!userIds.length && !countsAsOwnUnread) return currentReadState;

                const nextReadState = { ...currentReadState };

                for (const userId of userIds) {
                  if (userId === eventUserId) {
                    nextReadState[eventUserId] = {
                      last_read: createdAt,
                      user: eventUser,
                      unread_messages: 0,
                      last_delivered_at: createdAt,
                      last_delivered_message_id: eventMessageId,
                    };
                  } else if (userId === ownUserId && !countsAsOwnUnread) {
                    // Not counted as own unread: leave the row untouched.
                    continue;
                  } else {
                    nextReadState[userId] = {
                      ...currentReadState[userId],
                      unread_messages:
                        (currentReadState[userId]?.unread_messages ?? 0) + 1,
                    };
                  }
                }

                // Seeds the own row when the channel has none (uninitialized, or queried with
                // `state: false` so `_initializeState` never ran): the count needs a row to live in.
                // `last_read` is the epoch: nothing has been read.
                if (ownUserId && countsAsOwnUnread && !currentReadState[ownUserId]) {
                  nextReadState[ownUserId] = {
                    last_read: asTimestampNS(0),
                    unread_messages: 1,
                    user: (client.user ?? { id: ownUserId }) as UserResponse,
                  };
                }

                return nextReadState;
              },
              { changedUserIds: Object.keys(channelState.read) },
            );
          }

          if (countsAsOwnUnread) {
            this.messagePaginator.setUnreadSnapshot({
              unreadCount: channelState.unreadCount,
            });
          }

          client.syncDeliveredCandidates([this]);
        }
        break;
      case 'message.updated':
      case 'message.undeleted':
        if (event.message) {
          this._extendEventWithOwnReactions(event);
          const formattedMessage = formatMessage(event.message);
          const { parent_id: parentId } = event.message;
          const { threads } = this.getClient();
          // to avoid double state publish
          const isAppliedByThread =
            !!parentId && threads.hasSubscriptions && !!threads.get(parentId);
          if (!isThreadOnlyReply(event.message) && !isAppliedByThread) {
            this.messagePaginator.ingestItem(formattedMessage);
            this.messagePaginator.reflectQuotedMessageUpdate(formattedMessage);
            // Added on pin, removed on unpin (`matchesFilter`).
            this.pinnedMessagesPaginator.ingestItem(formattedMessage);
            this.pinnedMessagesPaginator.reflectQuotedMessageUpdate(formattedMessage);
          }
        }
        break;
      case 'channel.truncated': {
        if (event.channel) channel.data = { ...channel.data, ...event.channel };
        const truncatedAt = event.channel?.truncated_at;
        if (truncatedAt != null) {
          this._setOwnUnreadCount(this.countUnread(truncatedAt));
          // Partial truncation keeps messages newer than the cutoff, so the paginator is not wiped. It
          // resets the channel-wide read context, so the unread snapshot goes too.
          this.messagePaginator.truncate({ truncatedAt });
          this.messagePaginator.clearUnreadSnapshot();
          this.pinnedMessagesPaginator.truncate({ truncatedAt });
        } else {
          this._setOwnUnreadCount(0);
          this.messagePaginator.clearStateAndCache();
          this.pinnedMessagesPaginator.clearStateAndCache();
        }

        // system messages don't increment unread counts
        if (event.message) {
          const formattedMessage = formatMessage(event.message);
          this.messagePaginator.ingestItem(formattedMessage);
          this.pinnedMessagesPaginator.ingestItem(formattedMessage);
        }

        break;
      }
      case 'member.added':
      case 'member.updated': {
        const memberCopy: ChannelMemberResponse = {
          ...event.member,
        };

        if (memberCopy.pinned_at === null) {
          delete memberCopy.pinned_at;
        }

        if (memberCopy.archived_at === null) {
          delete memberCopy.archived_at;
        }

        if (memberCopy?.user) {
          channelState.members = {
            ...channelState.members,
            [memberCopy.user.id]: memberCopy,
          };
          channel.getClient().state.updateUserReference(memberCopy.user, channel.cid);
        }

        const currentUserId = this.getClient().userId;
        if (
          typeof currentUserId === 'string' &&
          typeof memberCopy?.user?.id === 'string' &&
          memberCopy.user.id === currentUserId
        ) {
          channelState.membership = memberCopy;
        }
        break;
      }
      case 'member.removed':
        if (event.user?.id) {
          const newMembers = {
            ...channelState.members,
          };

          delete newMembers[event.user.id];

          channelState.members = newMembers;

          // TODO?: unset membership
        }
        break;
      case 'notification.mark_unread': {
        const ownMessage = event.user?.id === this.getClient().user?.id;
        if (!ownMessage || !event.user || event.last_read_at == null) break;
        const eventUser = event.user;
        const lastReadAt = event.last_read_at;
        const unreadCount = event.unread_messages ?? 0;
        this._upsertReadState(
          eventUser.id,
          (currentUserReadState) => ({
            ...currentUserReadState,
            first_unread_message_id: event.first_unread_message_id,
            last_read: lastReadAt,
            last_read_message_id: event.last_read_message_id,
            user: eventUser,
            unread_messages: unreadCount,
          }),
          { changedUserIds: [eventUser.id] },
        );

        this.messagePaginator.setUnreadSnapshot({
          firstUnreadMessageId:
            channelState.read[event.user.id].first_unread_message_id ?? null,
          lastReadAt: channelState.read[event.user.id].last_read,
          lastReadMessageId: channelState.read[event.user.id].last_read_message_id,
          unreadCount,
        });
        break;
      }
      case 'channel.updated':
        if (event.channel) {
          const isFrozenChanged =
            event.channel?.frozen !== undefined &&
            event.channel.frozen !== channel.data?.frozen;
          if (isFrozenChanged) {
            this.query({ state: false, messages: { limit: 0 }, watchers: { limit: 0 } });
          }
          const newChannelData = {
            ...event.channel,
            hidden: event.channel?.hidden ?? channel.data?.hidden,
            member_count: event.channel?.member_count ?? channel.data?.member_count,
            own_capabilities:
              event.channel?.own_capabilities ?? channel.data?.own_capabilities,
          };
          channel.data = newChannelData;
        }
        break;
      case 'reaction.new':
      case 'reaction.updated':
      case 'reaction.deleted':
        if (event.message && event.reaction) {
          reflectReactionEvent(this.getClient(), {
            // reaction.updated is only sent when enforce_unique is set
            enforceUnique: event.type === 'reaction.updated',
            message: event.message,
            reaction: event.reaction,
            removed: event.type === 'reaction.deleted',
          });
        }
        break;
      case 'channel.hidden': {
        channel.data = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...channel.data!,
          blocked: event.channel?.blocked ?? false,
          hidden: true,
        };
        if (event.clear_history) {
          this.messagePaginator.clearStateAndCache();
          this.pinnedMessagesPaginator.clearStateAndCache();
        }
        break;
      }
      case 'channel.visible': {
        channel.data = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...channel.data!,
          blocked: event.channel?.blocked ?? false,
          hidden: false,
        };
        this.getClient().offlineDb?.handleChannelVisibilityEvent({ event });
        break;
      }
      case 'user.banned':
        if (!event.user?.id) break;
        channelState.members[event.user.id] = {
          ...(channelState.members[event.user.id] || {}),
          shadow_banned: !!event.shadow,
          banned: !event.shadow,
          user: { ...(channelState.members[event.user.id]?.user || {}), ...event.user },
        };
        break;
      case 'user.unbanned':
        if (!event.user?.id) break;
        channelState.members[event.user.id] = {
          ...(channelState.members[event.user.id] || {}),
          shadow_banned: false,
          banned: false,
          user: { ...(channelState.members[event.user.id]?.user || {}), ...event.user },
        };
        break;
      default:
    }

    const typedEvent = event as Extract<WSEvent, { watcher_count?: any }>;
    // any event can send over the online count
    if (typeof typedEvent.watcher_count !== 'undefined') {
      channel.state.watcher_count = typedEvent.watcher_count;
    }
  }

  _callChannelListeners = (event: Event) => {
    // Snapshot: a listener added while handling an event must not be invoked for it (`on` adds in
    // place and iterating a `Set` visits entries appended mid-iteration).
    const listeners = [
      ...(this.listeners.get('all') ?? []),
      ...(this.listeners.get(event.type) ?? []),
    ];

    for (const listener of listeners) {
      invokeEventListener(listener, event, logger);
    }
  };

  /**
   * Throws if the channel has no ID (created from members only). Narrows `id` to `string`. Call it
   * before any request that uses `this.cid`: it is a string (possibly temporary) even without an ID,
   * so TypeScript does not flag a missing check.
   */
  _checkHasId(): asserts this is this & { id: string } {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }
  }

  /** Throws unless the channel was queried or populated from the offline DB. */
  _checkInitialized() {
    if (!this.initialized && !this.offlineMode) {
      throw Error(
        `Channel ${this.cid} hasn't been initialized yet. Make sure to call .watch() and wait for it to resolve`,
      );
    }
  }

  _initializeState(state: ChannelStateResponseFields) {
    const { state: clientState, user, userID } = this.getClient();

    if (state.members) {
      this._hydrateMembers({ members: state.members });
    }

    if (state.membership) {
      this.state.membership = state.membership;
      // the members page of a large channel may leave out the current user, so register them here
      if (state.membership.user) {
        clientState.updateUserReference(state.membership.user, this.cid);
      }
    }

    // Each channel response's `last_message_at` replaces the queried `latestMessageAt`. Callers
    // that place a message page set it before placing it, so the paginator can tell whether
    // the page reaches the newest message; this covers the responses whose page is not placed, such
    // as a channel-list query for a channel the viewer has jumped away from.
    this.messagePaginator.setQueriedLatestMessageAt(state.channel?.last_message_at);

    // The pinned list's first page comes with the channel's state.
    this.pinnedMessagesPaginator.placeExternalQueryPage(
      (state.pinned_messages || []).map(formatMessage),
      this.pinnedMessagesPaginator.pageSize,
    );
    if (state.pending_messages) {
      this.state.pending_messages = state.pending_messages;
    }
    if (state.watcher_count !== undefined) {
      this.state.watcher_count = state.watcher_count;
    }
    if (state.watchers) {
      for (const watcher of state.watchers) {
        if (watcher) {
          clientState.updateUserReference(watcher, this.cid);
          this.state.watchers[watcher.id] = watcher;
        }
      }
    }

    // Initialized to the latest message (or now, if empty) so nothing up to here counts as
    // unread. A member's entry is overwritten below.
    const readUpdates: ChannelState['read'] = {};
    if (userID != null) {
      const last_read = this.messagePaginator.latestMessageAt ?? nowNs();
      if (user) {
        readUpdates[user.id] = {
          user: user as UserResponse,
          last_read,
          unread_messages: 0,
        };
      }
    }

    if (state.read) {
      for (const read of state.read) {
        readUpdates[read.user.id] = {
          last_delivered_at: read.last_delivered_at ?? undefined,
          last_delivered_message_id: read.last_delivered_message_id,
          last_read: read.last_read,
          last_read_message_id: read.last_read_message_id,
          unread_messages: read.unread_messages ?? 0,
          user: read.user,
        };
      }
    }

    const entries = Object.entries(readUpdates);
    if (entries.length) {
      this._patchReadState(
        (currentReadState) => {
          let hasChanges = false;
          const nextReadState = { ...currentReadState };

          for (const [userId, readState] of entries) {
            if (nextReadState[userId] === readState) continue;
            nextReadState[userId] = readState;
            hasChanges = true;
          }

          return hasChanges ? nextReadState : currentReadState;
        },
        { changedUserIds: entries.map(([userId]) => userId) },
      );
    }
  }

  _extendEventWithOwnReactions(
    event: EventPayload<'message.undeleted' | 'message.updated' | 'message.deleted'>,
  ) {
    if (!event.message) {
      return;
    }
    // Enriched from the paginator, which owns the channel message list. Thread-only replies are not in
    // it: the Thread object preserves their `own_reactions`.
    const message = this.messagePaginator.getItem(event.message.id);
    if (message) {
      event.message.own_reactions = message.own_reactions;
    }
  }

  _hydrateMembers({
    members,
    overrideCurrentState = true,
  }: {
    members: ChannelMemberResponse[];
    /** `true` replaces `state.members`. `false` merges (a new member replaces one with the same ID). */
    overrideCurrentState?: boolean;
  }) {
    const clientState = this.getClient().state;
    const newMembersById = members.reduce<ChannelState['members']>(
      (membersById, member) => {
        if (member.user) {
          membersById[member.user.id] = member;
          // lets `user.updated` and `user.presence.changed` reach this member
          clientState.updateUserReference(member.user, this.cid);
        }
        return membersById;
      },
      {},
    );

    if (overrideCurrentState) {
      this.state.members = newMembersById;
    } else if (members.length) {
      this.state.members = {
        ...this.state.members,
        ...newMembersById,
      };
    }
  }

  /**
   * Ends the instance for good: unsubscribes from the configuration and the server config, stops the
   * receipts tracker and the cooldown timer, disposes both paginators, then sets
   * `pendingDisposal: true` and `watchStatus: NotWatching`. It sends no request, so the server keeps a
   * watch this connection held until the connection ends. Calling it again does nothing.
   *
   * The SDK calls it when a channel ends (deleted, current user removed, logout, released as unused).
   * It does not remove the channel from the channel store. The SDK's own ends remove it; after a
   * direct call it stays until `client.channelManager.releaseUnusedChannels()`, or until `ensure()`
   * for the same cid replaces it.
   */
  disconnect() {
    // Once only: a second run would drop subscription counts other consumers hold.
    if (this.pendingDisposal) return;
    logger.withExtraTags('disconnect', this.cid).info('Disconnecting the channel.');

    // Subscriptions are released before `pendingDisposal` flips, so no handler runs on a
    // half-disconnected channel.

    // Runs the `'channel'` setup function's teardown and unsubscribes from the configuration store.
    this.unsubscribeConfiguration?.();
    this.unsubscribeConfiguration = undefined;
    this.unsubscribeServerConfig?.();
    this.unsubscribeServerConfig = undefined;
    this.messageReceiptsTracker.unregisterSubscriptions();
    this.cooldownTimer.unregisterSubscriptions();
    // Otherwise the message store keeps this channel and its messages alive through its subscribers.
    this.messagePaginator.dispose();
    this.pinnedMessagesPaginator.dispose();

    // One update, last, so subscribers see both together. A deleted channel must not be re-watched.
    this.endWatch();
    this.state.partialNext({
      pendingDisposal: true,
      watchStatus: ChannelWatchStatus.NotWatching,
    });
  }
}
