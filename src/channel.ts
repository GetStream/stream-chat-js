import type { AxiosRequestConfig } from 'axios';
import { ChannelState } from './channel_state';
import { CooldownTimer } from './CooldownTimer';
import { isEphemeral } from './errors';
import { applyReactionLocally } from './entityStore';
import { MessageComposer } from './messageComposer';
import { MessageReceiptsTracker } from './messageDelivery';
import type { ReadStoreReconcileMeta } from './messageDelivery';
import { MessagePaginator, PinnedMessagePaginator } from './pagination/paginators';
import { MessageOperations } from './messageOperations';
import {
  channelHasReadEvents,
  formatMessage,
  generateChannelTempCid,
  localMessageToNewMessagePayload,
  logChatPromiseExecution,
} from './utils';
import type { StreamChat } from './client';
import { chatLoggerSystem } from './logger';
import type {
  AIState,
  APIResponse,
  BanUserOptions,
  ChannelData,
  ChannelGetOrCreateRequest,
  ChannelMemberResponse,
  ChannelResponse,
  ChannelStateResponseFields,
  ChannelUpdateOptions,
  CreateDraftResponse,
  DeleteMessageOptions,
  Event,
  EventHandler,
  EventPayload,
  EventType,
  GetRepliesAPIResponse,
  LocalMessage,
  MarkReadRequest,
  MarkReadResponse,
  MessagePaginationOptions,
  MessageRequest,
  MessageResponse,
  MessageSetType,
  PinnedMessagePaginationOptions,
  PinnedMessagesSort,
  QueryMembersPayload,
  ReactionAPIResponse,
  ReactionRequest,
  SendMessageOptions,
  SendReactionRequest,
  SharedLocation,
  StreamRequestOptions,
  StreamResponse,
  UnBanUserOptions,
  UpdateChannelPartialRequest,
  UpdateLiveLocationRequest,
  UpdateMessageOptions,
  UserResponse,
} from './types';
import type { RoleName } from './permissions';
import { StateStore } from './store';
import type {
  ChannelMemberRequest as Gen_ChannelMemberRequest,
  ChannelPushPreferencesResponse as Gen_ChannelPushPreferencesResponse,
  MuteChannelRequest as Gen_MuteChannelRequest,
  UnmuteChannelRequest as Gen_UnmuteChannelRequest,
  WSEvent,
} from './gen/models';
import type { ChatApi } from './gen/chat/ChatApi';
import { ChannelApi } from './gen/chat/ChannelApi';

const logger = chatLoggerSystem.getLogger('channel');
const offlineDbLogger = chatLoggerSystem.getLogger('offline-db');

// todo: move to dedicated file
export type SendMessageWithStateUpdateParams = {
  localMessage: LocalMessage;
  message?: MessageRequest;
  options?: SendMessageOptions;
  /**
   * Per-call override for the send/retry request (advanced).
   * If set, it takes precedence over channel instance configuration handlers.
   */
  sendMessageRequestFn?: CustomSendMessageRequestFn;
};

export type RetrySendMessageWithLocalUpdateParams = Omit<
  SendMessageWithStateUpdateParams,
  'message'
>;

export type UpdateMessageWithStateUpdateParams = {
  localMessage: LocalMessage;
  options?: UpdateMessageOptions;
  /**
   * Per-call override for the update request (advanced).
   * If set, it takes precedence over channel instance configuration handlers.
   */
  updateMessageRequestFn?: CustomUpdateMessageRequestFn;
};

export type DeleteMessageWithStateUpdateParams = {
  localMessage: LocalMessage;
  options?: DeleteMessageOptions;
  /**
   * Per-call override for the delete request (advanced).
   * If set, it takes precedence over channel instance configuration handlers.
   */
  deleteMessageRequestFn?: CustomDeleteMessageRequestFn;
};

// Custom request function types for configuration
export type CustomSendMessageRequestFn = (
  params: Omit<SendMessageWithStateUpdateParams, 'sendMessageRequestFn'>,
) => Promise<{ message: MessageResponse }>;

export type CustomUpdateMessageRequestFn = (
  params: Omit<UpdateMessageWithStateUpdateParams, 'updateMessageRequestFn'>,
) => Promise<{ message: MessageResponse }>;

export type CustomDeleteMessageRequestFn = (
  params: Omit<DeleteMessageWithStateUpdateParams, 'deleteMessageRequestFn'>,
) => Promise<{ message: MessageResponse }>;

export type CustomMarkReadRequestFn = (params: {
  channel: Channel;
  options?: MarkReadRequest;
}) => Promise<Partial<StreamResponse<MarkReadResponse>> | null>;

export type ChannelInstanceConfig = {
  requestHandlers?: {
    deleteMessageRequest?: CustomDeleteMessageRequestFn;
    markReadRequest?: CustomMarkReadRequestFn;
    sendMessageRequest?: CustomSendMessageRequestFn;
    retrySendMessageRequest?: CustomSendMessageRequestFn;
    updateMessageRequest?: CustomUpdateMessageRequestFn;
  };
};

/**
 * The Channel class manages its own state.
 */
export class Channel extends ChannelApi {
  _client: StreamChat;
  data: Partial<ChannelResponse> | undefined;
  _data: ChannelData;
  cid: string;
  /**  */
  listeners: Map<EventType, Set<EventHandler>>;
  state: ChannelState;
  /**
   * This boolean is a vague indication of whether the channel exists on chat backend.
   *
   * If the value is true, then that means the channel has been initialized by either calling
   * channel.create() or channel.query() or channel.watch().
   *
   * If the value is false, then channel may or may not exist on the backend. The only way to ensure
   * is by calling channel.create() or channel.query() or channel.watch().
   */
  initialized: boolean;
  /**
   * Indicates whether channel has been initialized by manually populating the state with some messages, members etc.
   * Static state indicates that channel exists on backend, but is not being watched yet.
   */
  offlineMode: boolean;
  lastKeyStroke?: Date;
  lastTypingEvent: Date | null;
  isTyping: boolean;
  disconnected: boolean;
  /** Re-entrancy guard for {@link Channel.reload} (mirrors Thread.reload's isLoading guard). */
  private _reloading = false;
  push_preferences?: Gen_ChannelPushPreferencesResponse;
  public readonly configState = new StateStore<ChannelInstanceConfig>({});
  public readonly messageComposer: MessageComposer;
  public readonly messageReceiptsTracker: MessageReceiptsTracker;
  public readonly messagePaginator: MessagePaginator;
  public readonly pinnedMessagesPaginator: PinnedMessagePaginator;
  public readonly messageOperations: MessageOperations;
  public readonly cooldownTimer: CooldownTimer;

  /**
   * Creates a `Channel` instance bound to the given chat client.
   *
   * @param client - The chat client.
   * @param type - The type of channel.
   * @param id - The ID of the chat (optional).
   * @param data - Any additional custom params.
   * @returns A new uninitialized channel.
   */
  constructor(
    client: StreamChat,
    type: string,
    id: string | undefined,
    data: ChannelData,
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
    // used by the frontend, gets updated:
    this.data = data as Partial<ChannelResponse>;
    // this._data is used for the requests...
    this._data = { ...data };
    this.cid = `${type}:${id}`;
    this.listeners = new Map();
    // perhaps the state variable should be private
    this.state = new ChannelState(this);
    this.initialized = false;
    this.offlineMode = false;
    this.lastTypingEvent = null;
    this.isTyping = false;
    this.disconnected = false;

    this.messageComposer = new MessageComposer({
      client: this._client,
      compositionContext: this,
    });

    // Created before MessageReceiptsTracker and CooldownTimer: both read the message paginator
    // (receipts resolve read cursors via findItemByTimestamp; CooldownTimer.refresh reads the
    // latest window at construction).
    this.messagePaginator = new MessagePaginator({ channel: this });
    this.pinnedMessagesPaginator = new PinnedMessagePaginator({ channel: this });

    this.messageReceiptsTracker = new MessageReceiptsTracker({ channel: this });
    this.messageReceiptsTracker.registerSubscriptions();

    this.cooldownTimer = new CooldownTimer({ channel: this });

    this.messageOperations = new MessageOperations({
      ingest: (m) => {
        this.messagePaginator.ingestItem(m);
        this.getClient().messageStore.flushSubscribers(m.id);
      },
      get: (id) => this.messagePaginator.getItem(id),
      handlers: () => {
        const { requestHandlers } = this.configState.getLatestValue();
        const deleteMessageRequest = requestHandlers?.deleteMessageRequest;
        const sendMessageRequest = requestHandlers?.sendMessageRequest;
        const retrySendMessageRequest = requestHandlers?.retrySendMessageRequest;
        const updateMessageRequest = requestHandlers?.updateMessageRequest;
        return {
          delete: deleteMessageRequest
            ? (p) =>
                deleteMessageRequest({
                  localMessage: p.localMessage,
                  options: p.options,
                })
            : undefined,
          send: sendMessageRequest
            ? (p) =>
                sendMessageRequest({
                  localMessage: p.localMessage,
                  message: p.message,
                  options: p.options,
                })
            : undefined,
          retry: retrySendMessageRequest
            ? (p) =>
                retrySendMessageRequest({
                  localMessage: p.localMessage,
                  message: p.message,
                  options: p.options,
                })
            : undefined,
          update: updateMessageRequest
            ? (p) =>
                updateMessageRequest({
                  localMessage: p.localMessage,
                  options: p.options,
                })
            : undefined,
        };
      },
      defaults: {
        delete: async (id, o) => {
          const result = await this.getClient().deleteMessage({ id, ...o });
          return { message: result.message };
        },
        send: async (m, o) => {
          const result = await this.sendMessage({ message: m, ...o });
          return { message: result.message };
        },
        update: async (m, o) => {
          const result = await this.getClient().updateMessage({
            id: m.id,
            message: localMessageToNewMessagePayload(m),
            ...o,
          });
          return { message: result.message };
        },
      },
    });
  }

  /**
   * Returns the chat client for this channel. Throws if `client.disconnect()` was called.
   *
   * @returns The chat client.
   */
  getClient(): StreamChat {
    if (this.disconnected === true) {
      throw Error(`You can't use a channel after client.disconnect() was called`);
    }
    return this._client;
  }

  /**
   * Returns the config for this channel ID (CID).
   *
   * @returns The channel config.
   */
  getConfig() {
    const client = this.getClient();
    return client.configs[this.cid];
  }

  _sendMessage(...args: Parameters<ChannelApi['sendMessage']>) {
    return super.sendMessage(...args);
  }

  /**
   * Sends a message to this channel.
   *
   * @param ...args - `[request, requestOptions]`. `request` holds the message body and optional
   *   flags such as `skip_enrich_url`, `skip_push`, and `keep_channel_hidden`; `requestOptions`
   *   carries per-request options such as an abort `signal` and is never serialized into the request.
   * @returns The server response.
   */
  override async sendMessage(...args: Parameters<ChannelApi['sendMessage']>) {
    const [request] = args;
    try {
      const offlineDb = this.getClient().offlineDb;
      const messageId = request.message?.id;
      if (offlineDb && messageId) {
        return await offlineDb.queueTask<Awaited<ReturnType<ChatApi['sendMessage']>>>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId,
            payload: args,
            type: 'send-message',
          },
        });
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('sendMessage', this.cid)
        .error('Sending the message failed.', { error });
    }
    return await this._sendMessage(...args);
  }

  /**
   * Sends a message with optimistic local state update.
   */
  async sendMessageWithLocalUpdate(
    params: SendMessageWithStateUpdateParams,
  ): Promise<void> {
    await this.messageOperations.send(
      {
        localMessage: params.localMessage,
        message: params.message,
        options: params.options,
      },
      params.sendMessageRequestFn,
    );
    if (this.messageComposer.config.text.publishTypingEvents) await this.stopTyping();
  }

  /**
   * Retry sending a failed message.
   */
  async retrySendMessageWithLocalUpdate(
    params: Omit<SendMessageWithStateUpdateParams, 'message'>,
  ) {
    await this.messageOperations.retry(
      {
        localMessage: { ...params.localMessage, type: 'regular' },
        options: params.options,
      },
      params.sendMessageRequestFn,
    );
  }

  /**
   * Updates a message with optimistic local state update.
   */
  async updateMessageWithLocalUpdate(params: UpdateMessageWithStateUpdateParams) {
    await this.messageOperations.update(
      {
        localMessage: params.localMessage,
        options: params.options,
      },
      params.updateMessageRequestFn,
    );
  }

  /**
   * Deletes a message with local state update.
   */
  async deleteMessageWithLocalUpdate(params: DeleteMessageWithStateUpdateParams) {
    await this.messageOperations.delete(
      {
        localMessage: params.localMessage,
        options: params.options,
      },
      params.deleteMessageRequestFn,
    );
  }

  /**
   * Adds a reaction with an optimistic local state update: the reaction is applied to the cached
   * message immediately ({@link applyReactionLocally}), then the request is
   * fired via {@link Channel.sendReaction} (which owns the offline-DB write + queue). The
   * server-authoritative counts reconcile on the response; the message is rolled back on failure.
   */
  async addReactionWithLocalUpdate({
    messageId,
    reaction,
    options,
  }: {
    messageId: string;
    reaction: ReactionRequest;
    options?: Pick<SendReactionRequest, 'enforce_unique' | 'skip_push'>;
  }) {
    const client = this.getClient();
    const undo = applyReactionLocally(client, {
      enforceUnique: options?.enforce_unique ?? false,
      messageId,
      reaction,
    });

    try {
      const response = await this.sendReaction({ id: messageId, reaction, ...options });
      // reconcile the server copy only if we still hold it — a bare upsert of an unheld id would
      // orphan it (the store's refcount GC only reclaims held ids).
      if (response?.message && client.messageStore.has(response.message.id)) {
        client.messageStore.upsert(formatMessage(response.message));
      }
    } catch (error) {
      if (undo && (!client.offlineDb || !isEphemeral(error as Error))) {
        undo();
      }
      throw error;
    }
  }

  /**
   * Removes the current user's reaction with an optimistic local state update, mirroring
   * {@link Channel.addReactionWithLocalUpdate}.
   */
  async deleteReactionWithLocalUpdate({
    messageId,
    type,
  }: {
    messageId: string;
    type: string;
  }) {
    const client = this.getClient();
    const undo = applyReactionLocally(client, {
      messageId,
      reaction: { type },
      removed: true,
    });

    try {
      const response = await this.deleteReaction({ id: messageId, type });
      // reconcile the server copy only if we still hold it — a bare upsert of an unheld id would
      // orphan it (the store's refcount GC only reclaims held ids).
      if (response?.message && client.messageStore.has(response.message.id)) {
        client.messageStore.upsert(formatMessage(response.message));
      }
    } catch (error) {
      if (undo && (!client.offlineDb || !isEphemeral(error as Error))) {
        undo();
      }
      throw error;
    }
  }

  /**
   * Upload a file to this channel’s file endpoint (multipart). Forwards to the client’s `sendFile` implementation.
   *
   * @param uri - File source: URL string, `File`, `Buffer`, or readable stream (Node).
   * @param name - File name sent in the multipart body (optional).
   * @param contentType - MIME type; required for React Native URI uploads (optional).
   * @param user - User payload appended to the form as JSON (optional).
   * @param axiosRequestConfig - Axios per-request config, merged after upload defaults, e.g. `onUploadProgress`, `signal` from `AbortController` (optional).
   * @returns A promise resolving to `{ file: string, ... }` with the CDN URL.
   */
  sendFile(
    uri: string | File,
    name?: string,
    contentType?: string,
    user?: UserResponse,
    axiosRequestConfig?: AxiosRequestConfig,
  ) {
    return this.getClient().api.sendFile(
      `${this._channelURL()}/file`,
      uri,
      name,
      contentType,
      user,
      axiosRequestConfig,
    );
  }

  /**
   * Upload an image to this channel's image endpoint (multipart). Uses the same transport as `sendFile`.
   *
   * @param uri - Image source: URL string, `File`, or readable stream (Node). For `Buffer` uploads, use `sendFile` toward the channel file endpoint instead.
   * @param name - File name sent in the multipart body (optional).
   * @param contentType - MIME type; required for React Native URI uploads (optional).
   * @param user - User payload appended to the form as JSON (optional).
   * @param axiosRequestConfig - Axios per-request config, merged after upload defaults, e.g. `onUploadProgress`, `signal` (optional).
   * @returns A promise resolving to `{ file: string, ... }` with the CDN URL.
   */
  sendImage(
    uri: string | File,
    name?: string,
    contentType?: string,
    user?: UserResponse,
    axiosRequestConfig?: AxiosRequestConfig,
  ) {
    return this.getClient().api.sendFile(
      `${this._channelURL()}/image`,
      uri,
      name,
      contentType,
      user,
      axiosRequestConfig,
    );
  }

  deleteFile(url: string, requestOptions?: StreamRequestOptions) {
    return this.deleteChannelFile({ url }, requestOptions);
  }

  deleteImage(url: string, requestOptions?: StreamRequestOptions) {
    return this.deleteChannelImage({ url }, requestOptions);
  }

  /**
   * Sends an event on this channel.
   *
   * @param request - For example `{ event: { type: 'message.read' } }`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  override async sendEvent(
    request: { event: Event },
    requestOptions?: StreamRequestOptions,
  ) {
    this._checkInitialized();
    return await super.sendEvent(request, requestOptions);
  }

  /**
   * Queries messages.
   *
   * @param ...args - `[request, requestOptions]`. The optional `request.payload` accepts
   *   MongoDB-style filters and additional options such as `user_id`. `requestOptions` carries
   *   per-request options such as an abort `signal` and is never serialized into the request.
   * @returns The search messages response.
   */
  async search(...args: Parameters<ChatApi['search']>) {
    return await this.getClient().search(...args);
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
    const payload = {
      type: this.type,
      // TODO: these should be probably optional in the OAPI spec
      // filter_conditions: ...
    } as QueryMembersPayload;

    if (this.id) {
      payload.id = this.id;
    } else if (Array.isArray(this.data?.members)) {
      payload.members = this.data.members.map((m) => ({
        ...m,
        // TODO: this should not be needed Gen_QueryMembersResponse should not come with user_id as optinal
        user_id: (m.user_id ?? m.user?.id) as string,
      }));
    }
    // Return a list of members
    return await this.getClient().queryMembers(
      {
        payload: {
          ...payload,
          ...request?.payload,
        },
      },
      requestOptions,
    );
  }

  /**
   * Sends a reaction to a message. If offline support is enabled, it will make sure
   * that sending the reaction is queued up if it fails due to bad internet conditions and executed
   * later.
   *
   * @param ...args - `[request, requestOptions]`. `request` holds the target message ID, the
   *   reaction object (e.g. `{ type: 'love' }`), and optional flags such as `enforce_unique` and
   *   `skip_push`; `requestOptions` carries per-request options such as an abort `signal`.
   *   When the call is queued for offline replay, `requestOptions` is queued with it - see the
   *   note on signal persistence in `AbstractOfflineDB.queueTask`.
   * @returns The server response.
   */
  async sendReaction(...args: Parameters<ChatApi['sendReaction']>) {
    const [{ id: messageId }] = args;

    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        // The optimistic reaction row is written by the local-update layer
        // (`applyReactionLocally`); here we only queue the request for replay.
        return await offlineDb.queueTask<ReactionAPIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId,
            payload: args,
            type: 'send-reaction',
          },
        });
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('sendReaction', this.cid)
        .error('Sending the reaction failed.', { error });
    }

    return this._sendReaction(...args);
  }

  _sendReaction(...args: Parameters<ChatApi['sendReaction']>) {
    return this.getClient().sendReaction(...args);
  }

  async deleteReaction(...args: Parameters<ChatApi['deleteReaction']>) {
    this._checkInitialized();
    const [request] = args;

    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        // The optimistic reaction-row removal is handled by the local-update layer
        // (`applyReactionLocally`); here we only queue the request for replay.
        return await offlineDb.queueTask<ReactionAPIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId: request.id,
            payload: args,
            type: 'delete-reaction',
          },
        });
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('deleteReaction', this.cid)
        .error('Deleting the reaction failed.', { error });
    }

    return await this._deleteReaction(...args);
  }

  /**
   * Deletes a reaction by user and type.
   *
   * @param ...args - `[request, requestOptions]`. `request` identifies the target message and
   *   reaction type; `requestOptions` carries per-request options such as an abort `signal` and is
   *   never serialized into the request.
   * @returns The server response.
   */
  async _deleteReaction(...args: Parameters<ChatApi['deleteReaction']>) {
    return await this.getClient().deleteReaction(...args);
  }

  /**
   * Edit the channel using the inherited `update()` from `ChannelApi`. Caches the
   * server-returned channel onto `this.data`.
   *
   * @param ...args - `[request, requestOptions]`. `request` is the channel update payload, e.g.
   *   `{ data: { name: 'foo' }, message }`; `requestOptions` carries per-request options such as an
   *   abort `signal` and is never serialized into the request.
   * @returns The server response.
   */
  override async update(...args: Parameters<ChannelApi['update']>) {
    const previousData = this.data;
    const data = await super.update(...args);
    this.data = data.channel;
    this._syncStateFromChannelData(this.data, previousData);
    return data;
  }

  /**
   * Partial update of channel properties.
   *
   * @param update - The partial update request.
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async updatePartial(
    update: UpdateChannelPartialRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    const data = await this.updateChannelPartial(update, requestOptions);

    if (!this.getClient()._cacheEnabled) return data;

    const channel = data.channel;
    const currentCapabilities = this.data?.own_capabilities ?? [];
    const newCapabilities = channel?.own_capabilities;

    const capabilitiesChanged =
      newCapabilities &&
      [...currentCapabilities].sort().join() !== [...newCapabilities].sort().join();

    const previousData = this.data;
    this.data = channel;
    this._syncStateFromChannelData(this.data, previousData);
    // If the capabiltities are changed, we trigger the `capabilities.changed` event.
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
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async enableSlowMode(coolDownInterval: number, requestOptions?: StreamRequestOptions) {
    return await this.update({ cooldown: coolDownInterval }, requestOptions);
  }

  /**
   * Disables slow mode.
   *
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async disableSlowMode(requestOptions?: StreamRequestOptions) {
    return await this.update({ cooldown: 0 }, requestOptions);
  }

  public async sendSharedLocation(location: SharedLocation & { message_id?: string }) {
    const result = await this.sendMessage({
      message: {
        id: location.message_id,
        shared_location: location,
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
    const location = await this.getClient().updateLiveLocation(
      {
        ...payload,
        end_at: new Date(),
      },
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
   * @param options - The object to update the custom properties of this channel with (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async acceptInvite(
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ accept_invite: true, ...options }, requestOptions);
  }

  /**
   * Rejects an invitation to the channel.
   *
   * @param options - The object to update the custom properties of this channel with (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async rejectInvite(
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update({ reject_invite: true, ...options }, requestOptions);
  }

  /**
   * Adds members to the channel.
   *
   * @param members - An array of members to add to the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async addMembers(
    members: string[] | Array<Gen_ChannelMemberRequest>,
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      {
        add_members: members.map((member) =>
          typeof member === 'string' ? { user_id: member } : member,
        ),
        message,
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Adds filter tags to the channel.
   *
   * @param tags - An array of tags to add to the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async addFilterTags(
    tags: string[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      { add_filter_tags: tags, message, ...options },
      requestOptions,
    );
  }

  /**
   * Removes filter tags from the channel.
   *
   * @param tags - An array of tags to remove from the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async removeFilterTags(
    tags: string[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      { remove_filter_tags: tags, message, ...options },
      requestOptions,
    );
  }

  /**
   * Adds moderators to the channel.
   *
   * @param members - An array of member identifiers.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async addModerators(
    members: string[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      { add_moderators: members, message, ...options },
      requestOptions,
    );
  }

  /**
   * Sets member roles in a channel.
   *
   * @param roles - List of role assignments.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async assignRoles(
    roles: { channel_role: RoleName; user_id: string }[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      { assign_roles: roles, message, ...options },
      requestOptions,
    );
  }

  /**
   * Invite members to the channel.
   *
   * @param members - An array of members to invite to the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async inviteMembers(
    members: string[] | Required<Omit<Gen_ChannelMemberRequest, 'channel_role'>>[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      {
        invites: members.map((member) =>
          typeof member === 'string' ? { user_id: member } : member,
        ),
        message,
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Removes members from the channel.
   *
   * @param members - An array of member identifiers.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async removeMembers(
    members: string[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      { remove_members: members, message, ...options },
      requestOptions,
    );
  }

  /**
   * Removes the moderator role from channel members.
   *
   * @param members - An array of member identifiers.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async demoteModerators(
    members: string[],
    message?: MessageRequest,
    options: ChannelUpdateOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.update(
      { demote_moderators: members, message, ...options },
      requestOptions,
    );
  }

  /**
   * Mutes the current channel.
   *
   * @example
   * // with expiration
   * await channel.mute({ expiration: moment.duration(2, 'weeks') });
   *
   * @example
   * // server side
   * await channel.mute({ user_id: userId });
   *
   * @param options - Mute options (optional, defaults to `{}`).
   * @param options.expiration - Expiration in minutes (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async mute(options?: Gen_MuteChannelRequest, requestOptions?: StreamRequestOptions) {
    return await this.getClient().muteChannel(
      {
        channel_cids: [this.cid],
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Unmutes the current channel.
   *
   * @example
   * // server side
   * await channel.unmute({ user_id: userId });
   *
   * @param options - Unmute options (optional, defaults to `{}`).
   * @param options.user_id - User ID (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async unmute(
    options?: Gen_UnmuteChannelRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    return await this.getClient().unmuteChannel(
      {
        channel_cids: [this.cid],
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Archives the current channel.
   *
   * @example
   * await channel.archive();
   *
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async archive(requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { archived: true } }, requestOptions);
  }

  /**
   * Unarchives the current channel.
   *
   * @example
   * await channel.unarchive();
   *
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async unarchive(requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { archived: false } }, requestOptions);
  }

  /**
   * Pins the current channel.
   *
   * @example
   * await channel.pin();
   *
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async pin(requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { pinned: true } }, requestOptions);
  }

  /**
   * Unpins the current channel.
   *
   * @example
   * await channel.unpin();
   *
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response.
   */
  async unpin(requestOptions?: StreamRequestOptions) {
    return await this.updateMemberPartial({ set: { pinned: false } }, requestOptions);
  }

  /**
   * Returns the mute status for the current channel.
   *
   * @returns An object of the form `{ muted: true | false, createdAt: Date | null, expiresAt: Date | null }`.
   */
  muteStatus() {
    this._checkInitialized();
    return this.getClient()._muteStatus(this.cid);
  }

  sendAction(
    messageId: string,
    formData: Record<string, string>,
    requestOptions?: StreamRequestOptions,
  ) {
    this._checkInitialized();
    if (!messageId) {
      throw Error(`Message ID is missing`);
    }
    return this.getClient().runMessageAction(
      {
        id: messageId,
        form_data: formData,
      },
      requestOptions,
    );
  }

  /**
   * First of the `typing.start` and `typing.stop` events based on the user's keystrokes.
   * Call this on every keystroke.
   *
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   *
   * @param parentId - Set this field to `message.id` to indicate that the typing event is happening in a thread (optional).
   * @param options - Optional override carrying a `user_id` (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async keystroke(
    parentId?: string,
    options?: { user_id: string },
    requestOptions?: StreamRequestOptions,
  ) {
    if (!this._isTypingIndicatorsEnabled()) {
      return;
    }
    const now = new Date();
    const diff = this.lastTypingEvent && now.getTime() - this.lastTypingEvent.getTime();
    this.lastKeyStroke = now;
    this.isTyping = true;
    // send a typing.start every 2 seconds
    if (diff === null || diff > 2000) {
      this.lastTypingEvent = new Date();
      await this.sendEvent(
        {
          event: {
            type: 'typing.start',
            parent_id: parentId,
            ...(options || {}),
            created_at: new Date(),
            custom: {},
          },
        },
        requestOptions,
      );
    }
  }

  /**
   * Sends an event to update the AI state for a specific message.
   * Typically used by the server connected to the AI service to notify clients of state changes.
   *
   * @param messageId - The ID of the message associated with the AI state.
   * @param state - The new state of the AI process, e.g. thinking, generating.
   * @param options - Parameters such as `ai_message` to include additional details in the event (optional, defaults to `{}`).
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
          ...options,
          type: 'ai_indicator.update',
          message_id: messageId,
          ai_state: state,
          created_at: new Date(),
          custom: {},
        },
      },
      requestOptions,
    );
  }

  /**
   * Sends an event to notify watchers to clear the typing/thinking UI when the AI response starts streaming.
   * Typically used by the server connected to the AI service to inform clients that the AI response has started.
   *
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async clearAIIndicator(requestOptions?: StreamRequestOptions) {
    await this.sendEvent(
      {
        event: {
          type: 'ai_indicator.clear',
          created_at: new Date(),
          custom: {},
        },
      },
      requestOptions,
    );
  }

  /**
   * Sends an event to stop AI response generation, leaving the message in its current state.
   * Triggered by the user to halt the AI response process.
   *
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async stopAIResponse(requestOptions?: StreamRequestOptions) {
    await this.sendEvent(
      {
        event: {
          type: 'ai_indicator.stop',
          created_at: new Date(),
          custom: {},
        },
      },
      requestOptions,
    );
  }

  /**
   * Sets last typing to null and sends the `typing.stop` event.
   *
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   *
   * @param parentId - Set this field to `message.id` to indicate that the typing event is happening in a thread (optional).
   * @param options - Optional override carrying a `user_id` (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   */
  async stopTyping(
    parentId?: string,
    options?: { user_id: string },
    requestOptions?: StreamRequestOptions,
  ) {
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
          ...(options || {}),
          created_at: new Date(),
          custom: {},
        },
      },
      requestOptions,
    );
  }

  _isTypingIndicatorsEnabled(): boolean {
    if (!this.getConfig()?.typing_events || !this.getClient().wsConnection?.isHealthy) {
      return false;
    }
    return this.getClient().user?.privacy_settings?.typing_indicators?.enabled ?? true;
  }

  /**
   * Run this user's mark-read reporter for this channel. Delegates to
   * `MessageDeliveryReporter`, which batches the underlying `markRead` request
   * with the user's read receipts state.
   *
   * Use the inherited `markRead()` from `ChannelApi` for a direct, unbatched call.
   *
   * @param data - Mark read options (optional, defaults to `{}`).
   */
  async markReadViaReporter(data: MarkReadRequest = {}) {
    return await this.getClient().messageDeliveryReporter.markRead(this, data);
  }

  /**
   * Override of the inherited `markRead()` from `ChannelApi` that requires the
   * channel to be initialized and respects the `read_events` channel config.
   *
   * @param ...args - `[data, requestOptions]`. `data` holds the mark-read options;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The server response, or `null` if the request was skipped.
   */
  override async markRead(...args: Parameters<ChannelApi['markRead']>) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events) {
      throw new Error('Read events are disabled for this application');
    }

    return await super.markRead(...args);
  }

  /**
   * Marks the channel as unread from `messageId`. Only works when the `read_events` setting is enabled.
   *
   * @param ...args - `[data, requestOptions]`. `data` holds the mark-unread options;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns An API response, or `null` if the request was skipped.
   */
  override async markUnread(...args: Parameters<ChannelApi['markUnread']>) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events) {
      throw new Error('Read events are disabled for this application');
    }

    return await super.markUnread(...args);
  }

  /**
   * Resets this user's unread count locally, without any backend call. Intended for
   * channels that have read events disabled (e.g. livestreams) when the client is created with the
   * `isLocalUnreadCountEnabled` option. Dispatches a dedicated, client-only `message.read_locally` event
   * that runs through the same `_handleChannelEvent` read logic as a real `message.read` (minus the
   * delivery-report network sync), so the read-state update lives in one place. When offline support
   * is enabled, the offline DB persists the reset for read-events-disabled channels, so the local
   * count stays consistent across app restarts.
   *
   * @returns The dispatched `message.read_locally` event, or `undefined` if there is no connected user.
   */
  markReadLocally() {
    const client = this.getClient();
    if (!client.userId) return;

    const event: EventPayload<'message.read_locally'> = {
      channel_id: this.id,
      channel_type: this.type,
      cid: this.cid,
      created_at: new Date(),
      last_read_message_id: this.messagePaginator.headmostItem?.id,
      team: this.data?.team,
      type: 'message.read_locally',
      user: client.user as UserResponse,
    };
    client.dispatchEvent(event);

    return event;
  }

  /**
   * Cleans the channel state and fires stop typing if needed.
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
  }

  /**
   * Loads the initial channel state and watches for changes.
   *
   * @param options - Additional options for the query endpoint (optional).
   * @returns The server response.
   */
  async watch(options?: ChannelGetOrCreateRequest) {
    const defaultOptions = {
      state: true,
      watch: true,
      presence: false,
    };

    // Make sure we wait for the connect promise if there is a pending one
    await this.getClient().wsPromise;

    if (!this.getClient()._hasConnectionID()) {
      defaultOptions.watch = false;
    }

    const combined = { ...defaultOptions, ...options };
    const state = await this.query(combined, 'latest');
    this.initialized = true;
    const previousData = this.data;
    this.data = state.channel;
    this._syncStateFromChannelData(this.data, previousData);

    // The message paginator is seeded synchronously inside query() (before read-state hydration),
    // so a channel opened via watch() alone — a deep-link restore, a search result, a freshly
    // created DM — already has its latest page loaded here.

    logger.withExtraTags('watch', this.cid).info('Started watching the channel.');
    return state;
  }

  /**
   * Re-watch the channel and refresh its FULL loaded message window — the channel analog of
   * {@link Thread.reload}. Used on reconnect to catch up AND reconcile hard deletes that happened
   * while offline: a hard delete reaches other clients via no event, so an offline client only learns
   * of it by diffing the re-queried page.
   *
   * This is intentionally thin: it only re-issues `watch()` with a limit sized to the loaded window
   * (`items.length`, so the whole loaded window is refreshed — not the smaller channel-list page). The
   * actual fold + destructive reconciliation happens inside `query()` → `seedFirstPageSync`
   * (the same path the channel-list re-hydrate and React's `recoverState` use), driven by the loaded-id
   * snapshot `query()` captures before its await. Owning that single path is what lets the SDK stop
   * passing the reconciliation window/snapshot itself.
   *
   * Preserves failed (unsent) messages: an overlap merge keeps them (the reconcile's provenance guard
   * never prunes a non-server message); only a disjoint rebuild can drop them, so any that actually
   * fell out are re-ingested below.
   */
  async reload() {
    if (this._reloading || (!this.initialized && !this.offlineMode)) return;
    this._reloading = true;
    try {
      const paginator = this.messagePaginator;
      const headItems = paginator.headItems;
      const requestedLimit = headItems.length || paginator.pageSize;
      const failedBefore = headItems.filter((message) => message.status === 'failed');

      await this.watch({ messages: { limit: requestedLimit } });
      this.offlineMode = false;

      paginator.batch(
        () => {
          for (const failed of failedBefore) {
            if (!paginator.getItem(failed.id)) paginator.ingestItem(failed);
          }
        },
        { coalesce: true },
      );
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

    logger.withExtraTags('stopWatching', this.cid).info('Stopped watching the channel.');

    return response;
  }

  /**
   * List the message replies for a parent message.
   *
   * The recommended way of working with threads is to use the `Thread` class.
   *
   * @param ...args - `[request, requestOptions]`. `request` holds the parent message ID, pagination
   *   params, and optional sort directions for `created_at`; `requestOptions` carries per-request
   *   options such as an abort `signal` and is never serialized into the request.
   * @returns A response with a list of messages.
   */
  async getReplies(...args: Parameters<ChatApi['getReplies']>) {
    const data = await this.getClient().getReplies(...args);

    // Thread reply state is owned by the Thread object (Thread.messagePaginator); the returned
    // replies are consumed there. The channel message list is owned by channel.messagePaginator.
    return data;
  }

  // TODO: find out v2 equivalent
  /**
   * List pinned messages of the channel.
   *
   * @param options - Pagination params, e.g. `{ limit: 10, id_lte: 10 }`.
   * @param sort - Defines sorting direction of pinned messages (optional, defaults to `[]`).
   * @returns A response with a list of messages.
   */
  async getPinnedMessages(
    options: PinnedMessagePaginationOptions,
    sort: PinnedMessagesSort = [],
  ) {
    return await this.getClient().api.get<GetRepliesAPIResponse>(
      this._channelURL() + '/pinned_messages',
      {
        payload: {
          ...options,
          sort,
        },
      },
    );
  }

  /**
   * List the reactions; supports pagination.
   *
   * @param ...args - `[request, requestOptions]`. `request` holds the target message ID and
   *   pagination options (`limit`, `offset`); `requestOptions` carries per-request options such as
   *   an abort `signal` and is never serialized into the request.
   * @returns The server response.
   */
  getReactions(...args: Parameters<ChatApi['getReactions']>) {
    return this.getClient().getReactions(...args);
  }

  /**
   * Retrieves a list of messages by ID.
   *
   * @param messageIds - The IDs of the messages to retrieve from this channel.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns Server response.
   */
  getMessagesById(messageIds: string[], requestOptions?: StreamRequestOptions) {
    return this.getManyMessages({ ids: messageIds }, requestOptions);
  }

  /**
   * Returns the last time the user marked the channel as read. If the user never marked the channel as read, this will return `null`.
   *
   * @returns The last-read `Date`, `null` if never read, or `undefined` if the user is unset.
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
    if (message.parent_id && !message.show_in_channel) return false;
    if (message.user?.id === this.getClient().userId) return false;
    if (message.user?.id && this.getClient().userMuteStatus(message.user.id))
      return false;

    // Return false if channel doesn't allow read events, unless the client opted into a local
    // unread count (e.g. livestreams where read events are disabled). See `isLocalUnreadCountEnabled`.
    if (
      !this.getClient().options.isLocalUnreadCountEnabled &&
      !channelHasReadEvents(this)
    ) {
      return false;
    }

    // FIXME: see #1265, adjust and count new messages even when the channel is muted
    // Read mute state directly from the client to avoid _checkInitialized() — this method
    // is invoked from _handleChannelEvent (e.g. message.new) before .watch() resolves.
    if (this.getClient()._muteStatus(this.cid).muted) return false;

    return true;
  }

  /**
   * Count of unread messages.
   *
   * @param lastRead - The time that the user read a message (optional, defaults to the current user's read state).
   * @returns Unread count.
   */
  countUnread(lastRead?: Date | null) {
    if (!lastRead) return this.state.unreadCount;
    let count = 0;
    const latestMessages = this.messagePaginator.headItems;
    for (let i = 0; i < latestMessages.length; i += 1) {
      const message = latestMessages[i];
      if (message.created_at > lastRead && this._countMessageAsUnread(message)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Count the number of unread messages mentioning the current user.
   *
   * @returns Unread mentions count.
   */
  countUnreadMentions() {
    const lastRead = this.lastRead();
    const userId = this.getClient().userId;

    let count = 0;
    const latestMessages = this.messagePaginator.headItems;
    for (let i = 0; i < latestMessages.length; i += 1) {
      const message = latestMessages[i];
      if (
        this._countMessageAsUnread(message) &&
        (!lastRead || message.created_at > lastRead) &&
        message.mentioned_users?.some((user) => user.id === userId)
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Creates a new channel.
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
    return await this.query(defaultOptions, 'latest');
  };

  /**
   * Queries the API to load messages, members, or other channel fields.
   *
   * @param options - The query options (optional, defaults to `{}`).
   * @param messageSetToAddToIfDoesNotExist - It's possible to load disjunct sets of a channel's
   *   messages into state. Use `current` to load the initial channel state or to extend the
   *   currently displayed messages; use `latest` to load/extend the latest messages; `new` is
   *   used for loading a specific message and its surroundings (optional, defaults to `'current'`).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns A query response.
   */
  async query(
    options: ChannelGetOrCreateRequest = {},
    messageSetToAddToIfDoesNotExist: MessageSetType = 'current',
    requestOptions?: StreamRequestOptions,
  ) {
    // Snapshot the loaded message ids BEFORE the network await, for a latest-window (re)seed only.
    // When this query re-seeds an already-loaded window (reconnect / re-hydrate), seedFirstPageSync
    // reconciles the fresh page against what is loaded, and the snapshot lets it tell an offline
    // hard-delete (in the snapshot, absent from the page) from a message that arrives live
    // during the fetch (not in the snapshot). Captured here — the only place with the pre-await state —
    // so callers (channel.reload, watch) need not thread it. Empty on a cold open, so it is harmless.
    // TODO(perf/cleanup): `headItems` materializes full message objects (intervalToItems) just to map
    // them down to ids. A cheaper, clearer equivalent is a straight copy of the paginator index's own
    // id set — expose `memberIds` on StoreBackedItemIndex (e.g. `snapshotMembers()` returning
    // `new Set(this.memberIds)`) and use it here AND in client.queryChannelsAndHydrate. The broader
    // scope (all intervals vs just the head) is inert: the reconcile only consults head ids, older
    // island ids are never at/above-newest, and local messages are guarded by isServerConfirmedMessage.
    const candidateIds =
      messageSetToAddToIfDoesNotExist === 'latest'
        ? new Set(this.messagePaginator.headItems.map((message) => message.id))
        : undefined;

    // The INITIAL channel-open query honors the paginator's OWN pageSize (light on native, 25) rather
    // than the server's larger default — opening loads the same page size it paginates by. A caller
    // that already knows how much to fetch passes an explicit messages.limit, which is respected as-is:
    // a reconnect/re-hydrate sizes it to the loaded window (channel.reload → items.length), and
    // pagination/around pass their own cursors + limit.
    const requestedPageSize = options?.messages?.limit ?? this.messagePaginator.pageSize;

    // Make sure we wait for the connect promise if there is a pending one
    await this.getClient().wsPromise;

    const queryPayload: ChannelGetOrCreateRequest = {
      data: this._data,
      state: true,
      ...options,
      // Ask the server for exactly the initial-open page size (not its default), so the loaded window
      // matches the paginator's pageSize. Explicit messages (reconnect/around/pagination) pass through.
      messages:
        options?.messages ??
        (messageSetToAddToIfDoesNotExist === 'latest'
          ? { limit: requestedPageSize }
          : undefined),
    };

    const state = this.id
      ? await this.getOrCreate(queryPayload, requestOptions)
      : await this.getClient().getOrCreateDistinctChannel(
          {
            type: this.type,
            ...queryPayload,
          },
          requestOptions,
        );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const channel = state.channel!;

    // update the channel id if it was missing
    if (!this.id) {
      this.id = channel.id;
      this.cid = channel.cid;
      // set the channel as active...

      const tempChannelCid = generateChannelTempCid(
        this.type,
        state.members.map((member) => member.user_id || member.user?.id || ''),
      );

      if (tempChannelCid && tempChannelCid in this.getClient().activeChannels) {
        // This gets set in `client.channel()` function, when channel is created
        // using members, not id.
        delete this.getClient().activeChannels[tempChannelCid];
      }

      if (
        !(this.cid in this.getClient().activeChannels) &&
        this.getClient()._cacheEnabled()
      ) {
        this.getClient().activeChannels[this.cid] = this;
      }
    }

    this.getClient()._addChannelConfig(channel);

    // the only config param that is necessary to be updated based on server config soon as the config is delivered
    if (typeof channel.config?.shared_locations !== 'undefined') {
      this.messageComposer.updateConfig({
        location: { enabled: channel.config.shared_locations },
      });
    }

    // Seed the message paginator with the first (latest) page BEFORE _initializeState, which
    // hydrates the read state and (via MessageReceiptsTracker) resolves read/delivered cursors
    // against this paginator. Seeding first guarantees the tracker sees a populated timeline; a
    // later async seed would run after the reconcile and mislabel delivery status. Only the
    // latest-page open paths (watch/create) pass 'latest' — the paginator's own pagination queries
    // use 'current' and must not be reseeded as a first page here.
    if (messageSetToAddToIfDoesNotExist === 'latest' && Array.isArray(state.messages)) {
      // Pass the query's message pagination options through: a channel can be opened AROUND a
      // message (id_around / created_at_around), in which case the fetched page is a jump window,
      // not the latest page — the paginator must reconcile it with jump semantics.
      this.messagePaginator.seedFirstPageSync(
        state.messages.map(formatMessage),
        requestedPageSize,
        options?.messages,
        // Re-seed of an already-loaded window folds + reconciles instead of blanking (see above).
        { candidateIds, reconcile: true },
      );
    }

    // Seed read/members/pinned/thread-cleanup state; the message list is in the paginator.
    this._initializeState(state);
    // The queried page is the latest set unless this was a jump/around query.
    const isLatestMessageSet =
      messageSetToAddToIfDoesNotExist === 'latest' &&
      !options?.messages?.id_around &&
      !(options?.messages as MessagePaginationOptions | undefined)?.created_at_around;

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
    const previousData = this.data;
    this.data = channel;
    this._syncStateFromChannelData(this.data, previousData);
    this.offlineMode = false;
    this.cooldownTimer.refresh();

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
    return state;
  }

  /**
   * Bans a user from a channel.
   *
   * @param targetUserId - The user to ban.
   * @param options - Ban options.
   * @returns The server response.
   */
  async banUser(targetUserId: string, options: BanUserOptions) {
    this._checkInitialized();
    return await this.getClient().banUser(targetUserId, {
      ...options,
      type: this.type,
      id: this.id,
    });
  }

  /**
   * Hides the channel from `queryChannels` for the user until a message is added.
   * If `clear_history` is set to `true`, all messages will be removed for the user.
   *
   * @param ...args - `[request, requestOptions]`. Pass `request: { clear_history: true }` to clear
   *   message history for the user; `requestOptions` carries per-request options such as an abort
   *   `signal` and is never serialized into the request.
   * @returns The server response.
   */
  override async hide(...args: Parameters<ChannelApi['hide']>) {
    this._checkInitialized();
    return await super.hide(...args);
  }

  /**
   * Removes the hidden status for a channel. Ensures the channel is initialized first.
   *
   * @param ...args - `[request, requestOptions]`. `request` is the show-channel payload;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The server response.
   */
  override async show(...args: Parameters<ChannelApi['show']>) {
    this._checkInitialized();
    return await super.show(...args);
  }

  /**
   * Removes the bans for a user on a channel.
   *
   * @param targetUserId - The user to unban.
   * @param options - Unban options (optional).
   * @returns The server response.
   */
  async unbanUser(targetUserId: string, options?: UnBanUserOptions) {
    this._checkInitialized();
    return await this.getClient().unbanUser(targetUserId, {
      ...options,
      type: this.type,
      id: this.id,
    });
  }

  /**
   * Shadow bans a user from a channel.
   *
   * @param targetUserId - The user to shadow ban.
   * @param options - Ban options.
   * @returns The server response.
   */
  async shadowBan(targetUserId: string, options: BanUserOptions) {
    this._checkInitialized();
    return await this.getClient().shadowBan(targetUserId, {
      ...options,
      type: this.type,
      id: this.id,
    });
  }

  /**
   * Removes the shadow ban for a user on a channel.
   *
   * @param targetUserId - The user to remove the shadow ban for.
   * @returns The server response.
   */
  async removeShadowBan(targetUserId: string) {
    this._checkInitialized();
    return await this.getClient().removeShadowBan(targetUserId, {
      type: this.type,
      id: this.id,
    });
  }

  /**
   * Casts or cancels one or more votes on a poll.
   *
   * @param ...args - `[request, requestOptions]`. `request` holds the target message ID, poll ID,
   *   and the vote to cast (or an empty payload to cancel); `requestOptions` carries per-request
   *   options such as an abort `signal` and is never serialized into the request.
   * @returns The poll vote response.
   */
  async vote(...args: Parameters<ChatApi['castPollVote']>) {
    return await this.getClient().castPollVote(...args);
  }

  async removeVote(...args: Parameters<ChatApi['deletePollVote']>) {
    return await this.getClient().deletePollVote(...args);
  }

  async _createDraft(...args: Parameters<ChannelApi['createDraft']>) {
    return await super.createDraft(...args);
  }

  /**
   * Creates or updates a draft message in a channel. If offline support is enabled, the
   * call is queued so it is replayed on reconnect.
   */
  override async createDraft(...args: Parameters<ChannelApi['createDraft']>) {
    const [request] = args;
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return (await offlineDb.queueTask<CreateDraftResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            threadId: request.message?.parent_id,
            payload: args,
            type: 'create-draft',
          },
        })) as Awaited<ReturnType<ChannelApi['createDraft']>>;
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('createDraft', this.cid)
        .error('Creating the draft in the offline database failed.', { error });
    }

    return this._createDraft(...args);
  }

  async _deleteDraft(...args: Parameters<ChannelApi['deleteDraft']>) {
    return await super.deleteDraft(...args);
  }

  /**
   * Deletes a draft message from a channel or a thread. If offline support is enabled, the
   * call is queued so it is replayed on reconnect.
   */
  override async deleteDraft(...args: Parameters<ChannelApi['deleteDraft']>) {
    const [request] = args;
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return (await offlineDb.queueTask<APIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            threadId: request?.parent_id,
            payload: args,
            type: 'delete-draft',
          },
        })) as Awaited<ReturnType<ChannelApi['deleteDraft']>>;
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('deleteDraft', this.cid)
        .error('Deleting the draft from the offline database failed.', { error });
    }

    return this._deleteDraft(...args);
  }

  /**
   * Listens to events on this channel.
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
   * @param callbackOrString - The event type to listen for, or the callback when listening to all events.
   * @param callbackOrNothing - The callback to call when an event type was provided (optional).
   * @returns An object with an `unsubscribe()` method.
   */
  on<T extends EventType | string>(
    eventType: T,
    callback: EventHandler<T>,
  ): { unsubscribe: () => void };
  on(callback: EventHandler): { unsubscribe: () => void };
  on(
    callbackOrString: EventHandler | string,
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
   * Removes the event handler.
   *
   * @param callbackOrString - The event type, or the callback when removing an all-events listener.
   * @param callbackOrNothing - The callback to remove when an event type was provided (optional).
   */
  off<T extends EventType | string>(eventType: T, callback: EventHandler): void;
  off(callback: EventHandler): void;
  off(callbackOrString: EventHandler | string, callbackOrNothing?: EventHandler): void {
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

    this.state.readStore.next((currentReadStoreState) => {
      const nextReadState = patch(currentReadStoreState.read);

      if (nextReadState === currentReadStoreState.read) {
        return currentReadStoreState;
      }
      hasStateChanged = true;

      return {
        ...currentReadStoreState,
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

  _handleChannelEvent(event: Event) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const channel = this;
    logger
      .withExtraTags('_handleChannelEvent', this.cid)
      .debug(`Received an event of type "${event.type}".`, { event });

    const channelState = channel.state;
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
      // `message.read_locally` is the client-only event dispatched by `markReadLocally()` when read
      // events are disabled (e.g. livestreams with `isLocalUnreadCountEnabled`). It reuses the exact
      // `message.read` state logic so the read-state update lives in one place — only the
      // delivery-report network sync below is skipped for it.
      case 'message.read_locally':
      case 'message.read':
        if (event.user?.id && event.created_at) {
          const eventUser = event.user;
          const readAtDate = new Date(event.created_at);
          const toDate = (value?: string | Date) =>
            value ? (value instanceof Date ? value : new Date(value)) : undefined;
          const userReadState = this._upsertReadState(
            eventUser.id,
            (currentUserReadState) => {
              const currentDeliveredAt = toDate(currentUserReadState?.last_delivered_at);

              return {
                // preserve delivery information already known for user
                ...currentUserReadState,
                ...(currentUserReadState?.last_read
                  ? { last_read: toDate(currentUserReadState.last_read) }
                  : null),
                ...(currentDeliveredAt
                  ? { last_delivered_at: currentDeliveredAt }
                  : null),
                last_read: readAtDate,
                last_read_message_id: event.last_read_message_id,
                last_delivered_at:
                  !currentDeliveredAt || currentDeliveredAt < readAtDate
                    ? readAtDate
                    : currentDeliveredAt,
                last_delivered_message_id:
                  !currentDeliveredAt || currentDeliveredAt < readAtDate
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
          void userReadState;

          const client = this.getClient();
          const isOwnEvent = event.user?.id === client.user?.id;

          if (isOwnEvent) {
            channelState.unreadCount = 0;
            // Delivery reporting buffers a `markChannelsDelivered` network request; the local read
            // must not hit the backend, so only sync for the real server `message.read`.
            if (event.type === 'message.read') {
              client.syncDeliveredCandidates([this]);
            }
          }
        }
        break;
      case 'message.delivered':
        // todo: update also on thread
        if (event.user?.id && event.created_at) {
          const eventUser = event.user;
          const createdAt = event.created_at;
          const toDate = (value?: string | Date) =>
            value ? (value instanceof Date ? value : new Date(value)) : undefined;
          const resolvedDeliveredAt = new Date(event.last_delivered_at ?? createdAt);
          const userReadState = this._upsertReadState(
            eventUser.id,
            (currentUserReadState) => {
              const currentDeliveredAt = toDate(currentUserReadState?.last_delivered_at);
              const currentReadAt = toDate(currentUserReadState?.last_read);

              return {
                ...currentUserReadState,
                ...(currentReadAt ? { last_read: currentReadAt } : null),
                ...(currentDeliveredAt
                  ? { last_delivered_at: currentDeliveredAt }
                  : null),
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
                last_read: currentReadAt ?? new Date(createdAt),
                unread_messages: currentUserReadState?.unread_messages ?? 0,
              };
            },
            { changedUserIds: [eventUser.id] },
          );
          void userReadState;

          const client = this.getClient();
          const isOwnEvent = event.user?.id === client.user?.id;

          // make sure not to report deliveries that were
          // already confirmed from own user from another device
          if (isOwnEvent) {
            client.syncDeliveredCandidates([this]);
          }
        }
        break;
      case 'user.watching.start':
      case 'user.updated':
        if (event.user?.id) {
          channelState.watchers[event.user.id] = event.user;
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
          const isThreadReply =
            !!event.message.parent_id && !event.message.show_in_channel;
          // Thread-only replies are handled by the Thread object; the channel owns the main list.
          if (!isThreadReply) {
            if (event.hard_delete) {
              this.messagePaginator.removeItem({ id: event.message.id });
              this.pinnedMessagesPaginator.removeItem({ id: event.message.id });
            } else {
              this.messagePaginator.ingestItem(formattedMessage);
              this.pinnedMessagesPaginator.ingestItem(formattedMessage);
            }
          }
          this.messagePaginator.reflectQuotedMessageUpdate(formattedMessage);
          this.pinnedMessagesPaginator.reflectQuotedMessageUpdate(formattedMessage);
        }
        break;
      case 'user.messages.deleted':
        if (event.user) {
          const deletedAt = new Date(event.created_at ?? Date.now());
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
          /* if message belongs to current user, always assume timestamp is changed to filter it out and add again to avoid duplication */
          const ownMessage = event.user?.id === client.user?.id;
          const isThreadMessage =
            event.message.parent_id && !event.message.show_in_channel;

          if (!isThreadMessage) {
            // ingestItem advances the paginator's tracked latest message (→ last_message_at). A
            // message that arrives while the viewer has scrolled to an older window lands in the
            // head interval, not the active one, so the view is preserved without an isUpToDate flag.
            this.messagePaginator.ingestItem(formatMessage(event.message));
            // ingestItem auto-adds when pinned (matchesFilter { pinned: true }).
            this.pinnedMessagesPaginator.ingestItem(formatMessage(event.message));
          }

          // do not increase the unread count - the back-end does not increase the count neither in the following cases:
          // 1. the message is mine
          // 2. the message is a thread reply from any user
          const preventUnreadCountUpdate = ownMessage || isThreadMessage;
          if (ownMessage) {
            this.cooldownTimer.refresh();
          }
          if (preventUnreadCountUpdate) break;

          if (event.user?.id) {
            const eventUser = event.user;
            const eventUserId = eventUser.id;
            const createdAt = new Date(event.created_at ?? Date.now());
            const eventMessageId = event.message.id;
            this._patchReadState(
              (currentReadState) => {
                const userIds = Object.keys(currentReadState);
                if (!userIds.length) return currentReadState;

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
                  } else {
                    nextReadState[userId] = {
                      ...currentReadState[userId],
                      unread_messages:
                        (currentReadState[userId]?.unread_messages ?? 0) + 1,
                    };
                  }
                }

                return nextReadState;
              },
              { changedUserIds: Object.keys(channelState.read) },
            );
          }

          // Skip the own-unread bump when the user is actively viewing the latest messages (app
          // foregrounded + newest message on screen). Without this, a message read in real time
          // momentarily bumps `unreadCount`/the snapshot — the "N new" separator/banner + the
          // channel-list badge would flash until the SDK's mark-read resets it. The SDK reports the
          // viewing state via `messagePaginator.setViewingLive` and marks the message read itself.
          // Only the OWN unread accounting is gated; the per-user read/receipt tracking above is
          // intentionally left intact.
          const isViewingLive = this.messagePaginator.isViewingLive;
          if (!isViewingLive && this._countMessageAsUnread(event.message)) {
            channelState.unreadCount = channelState.unreadCount + 1;
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
          if (!event.message.parent_id) {
            this.messagePaginator.ingestItem(formattedMessage);
            this.messagePaginator.reflectQuotedMessageUpdate(formattedMessage);
            // ingestItem auto-adds on pin / auto-removes on unpin (matchesFilter { pinned: true }).
            this.pinnedMessagesPaginator.ingestItem(formattedMessage);
            this.pinnedMessagesPaginator.reflectQuotedMessageUpdate(formattedMessage);
          }
        }
        break;
      case 'channel.truncated':
        if (event.channel?.truncated_at) {
          const truncatedAtDate = new Date(event.channel.truncated_at);

          channelState.unreadCount = this.countUnread(truncatedAtDate);
          // Partial truncation: keep messages newer than the cutoff. clearStateAndCache would wipe
          // the whole paginator (readers now source from it), so use the partial truncate. The
          // channel-wide read/unread context is reset by the truncation, so drop the unread snapshot
          // too (clearStateAndCache did this for the full-truncate branch).
          this.messagePaginator.truncate({ truncatedAt: truncatedAtDate });
          this.messagePaginator.clearUnreadSnapshot();
          this.pinnedMessagesPaginator.truncate({ truncatedAt: truncatedAtDate });
        } else {
          channelState.unreadCount = 0;
          this.messagePaginator.clearStateAndCache();
          this.pinnedMessagesPaginator.clearStateAndCache();
        }

        // system messages don't increment unread counts
        if (event.message) {
          this.messagePaginator.ingestItem(formatMessage(event.message));
          this.pinnedMessagesPaginator.ingestItem(formatMessage(event.message));
        }

        break;
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
        if (!ownMessage || !event.user || !event.last_read_at) break;
        const eventUser = event.user;
        const lastReadAt = event.last_read_at;
        const unreadCount = event.unread_messages ?? 0;
        this._upsertReadState(
          eventUser.id,
          (currentUserReadState) => ({
            // keep the message delivery info
            ...currentUserReadState,
            first_unread_message_id: event.first_unread_message_id,
            last_read: new Date(lastReadAt),
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

        channelState.unreadCount = unreadCount;
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
          const previousChannelData = channel.data;
          const newChannelData = {
            ...event.channel,
            hidden: event.channel?.hidden ?? channel.data?.hidden,
            member_count: event.channel?.member_count ?? channel.data?.member_count,
            own_capabilities:
              event.channel?.own_capabilities ?? channel.data?.own_capabilities,
          };
          channel.data = newChannelData;
          channel._syncStateFromChannelData(channel.data, previousChannelData);
          this.cooldownTimer.refresh();
        }
        break;
      case 'reaction.new':
        if (event.message && event.reaction) {
          const { reaction } = event;
          // Reflect main messages AND show_in_channel replies (both live in these paginators);
          // pure replies are handled by the thread's own reaction subscription.
          if (!event.message?.parent_id || event.message.show_in_channel) {
            this.messagePaginator.reflectReaction({ message: event.message, reaction });
            this.pinnedMessagesPaginator.reflectReaction({
              message: event.message,
              reaction,
            });
          }
        }
        break;
      case 'reaction.deleted':
        if (event.message && event.reaction) {
          const { reaction } = event;
          if (
            event.message &&
            (!event.message.parent_id || event.message.show_in_channel)
          ) {
            this.messagePaginator.reflectReaction({
              message: event.message,
              reaction,
              removed: true,
            });
            this.pinnedMessagesPaginator.reflectReaction({
              message: event.message,
              reaction,
              removed: true,
            });
          }
        }
        break;
      case 'reaction.updated':
        if (event.message && event.reaction) {
          const { reaction } = event;
          // assuming reaction.updated is only called if enforce_unique is true
          if (!event.message?.parent_id || event.message.show_in_channel) {
            this.messagePaginator.reflectReaction({
              enforceUnique: true,
              message: event.message,
              reaction,
            });
            this.pinnedMessagesPaginator.reflectReaction({
              enforceUnique: true,
              message: event.message,
              reaction,
            });
          }
        }
        break;
      case 'channel.hidden': {
        const previousChannelData = channel.data;
        channel.data = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...channel.data!,
          blocked: event.channel?.blocked ?? false,
          hidden: true,
        };
        channel._syncStateFromChannelData(channel.data, previousChannelData);
        if (event.clear_history) {
          this.messagePaginator.clearStateAndCache();
          this.pinnedMessagesPaginator.clearStateAndCache();
        }
        break;
      }
      case 'channel.visible': {
        const previousChannelData = channel.data;
        channel.data = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...channel.data!,
          blocked: event.channel?.blocked ?? false,
          hidden: false,
        };
        channel._syncStateFromChannelData(channel.data, previousChannelData);
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

  _callChannelListeners = (event: WSEvent) => {
    const allSet = this.listeners.get('all');
    const targetSet = this.listeners.get(event.type);

    [allSet, targetSet].forEach((set) =>
      set?.forEach((handleEvent) => handleEvent(event)),
    );
  };

  /**
   * Returns the channel url.
   *
   * @returns The channel url.
   */
  _channelURL = () => {
    if (!this.id) {
      throw new Error('channel id is not defined');
    }
    return `${this.getClient().baseURL}/channels/${encodeURIComponent(
      this.type,
    )}/${encodeURIComponent(this.id)}`;
  };

  _checkInitialized() {
    if (!this.initialized && !this.offlineMode) {
      throw Error(
        `Channel ${this.cid} hasn't been initialized yet. Make sure to call .watch() and wait for it to resolve`,
      );
    }
  }

  _syncStateFromChannelData(
    data: Channel['data'],
    fallbackData: Channel['data'] = this.data,
  ) {
    this.state.syncOwnCapabilitiesFromChannelData(data, fallbackData);
    this.state.syncMemberCountFromChannelData(data, fallbackData);
  }

  _initializeState(state: ChannelStateResponseFields) {
    const { state: clientState, user, userID } = this.getClient();

    // add the members and users
    if (state.members) {
      this._hydrateMembers({ members: state.members });

      for (const member of state.members) {
        if (member.user) {
          clientState.updateUserReference(member.user, this.cid);
        }
      }
    }

    if (state.membership) {
      this.state.membership = state.membership;
    }

    // Seed the message paginator's `lastMessageAt` aggregate from the server's authoritative
    // `last_message_at`. The first-page seed (Channel.query / client.hydrateActiveChannels) also
    // advances it from ingested messages; both feed the same monotonic max, so this additionally
    // covers the path where the paginator seed is skipped (an already-loaded channel the viewer has
    // jumped away from, where re-seeding would clobber their window).
    this.messagePaginator.seedLastMessageAt(state.channel?.last_message_at);

    // Seed the pinned-messages paginator from the same response.
    this.pinnedMessagesPaginator.seedFirstPageSync(
      (state.pinned_messages || []).map(formatMessage),
      this.pinnedMessagesPaginator.pageSize,
    );
    if (state.pending_messages) {
      this.state.pending_messages = state.pending_messages;
    }
    if (state.watcher_count !== undefined) {
      this.state.watcher_count = state.watcher_count;
    }
    // convert the arrays into objects for easier syncing...
    if (state.watchers) {
      for (const watcher of state.watchers) {
        if (watcher) {
          clientState.updateUserReference(watcher, this.cid);
          this.state.watchers[watcher.id] = watcher;
        }
      }
    }

    // initialize read state to last message or current time if the channel is empty
    // if the user is a member, this value will be overwritten later on otherwise this ensures
    // that everything up to this point is not marked as unread
    const readUpdates: ChannelState['read'] = {};
    if (userID != null) {
      const last_read = this.messagePaginator.lastMessageAt || new Date();
      if (user) {
        readUpdates[user.id] = {
          user: user as UserResponse,
          last_read,
          unread_messages: 0,
        };
      }
    }

    // apply read state if part of the state
    if (state.read) {
      for (const read of state.read) {
        readUpdates[read.user.id] = {
          last_delivered_at: read.last_delivered_at
            ? new Date(read.last_delivered_at)
            : undefined,
          last_delivered_message_id: read.last_delivered_message_id,
          last_read: new Date(read.last_read),
          last_read_message_id: read.last_read_message_id,
          unread_messages: read.unread_messages ?? 0,
          user: read.user,
        };

        if (read.user.id === user?.id) {
          this.state.unreadCount = readUpdates[read.user.id].unread_messages;
        }
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
    // The channel message list is owned by the paginator; enrich from it. Thread-only replies are
    // not in the paginator (getItem returns undefined) — the Thread object preserves their
    // own_reactions on its own reply store.
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
    /**
     * If set to `true` then `ChannelState.members` will be overriden with the newly
     * provided `members`, setting this property to `false` will merge current `ChannelState.members`
     * object with the newly provided `members`
     * (new members with the same `userId` will replace the old ones).
     */
    overrideCurrentState?: boolean;
  }) {
    const newMembersById = members.reduce<ChannelState['members']>(
      (membersById, member) => {
        if (member.user) {
          membersById[member.user.id] = member;
        }
        return membersById;
      },
      {},
    );

    if (overrideCurrentState) {
      this.state.members = newMembersById;
    } else if (!overrideCurrentState && members.length) {
      this.state.members = {
        ...this.state.members,
        ...newMembersById,
      };
    }
  }

  _disconnect() {
    logger.withExtraTags('_disconnect', this.cid).info('Disconnecting the channel.');

    this.disconnected = true;
    this.messageReceiptsTracker.unregisterSubscriptions();
    this.cooldownTimer.clearTimeout();
    // Release the store-backed paginators so the message store no longer pins this removed channel
    // (and its whole message graph) through its subscriber registry. The channel is being discarded
    // here (disconnected + deleted from activeChannels, never reused), mirroring Thread teardown.
    this.messagePaginator.dispose();
    this.pinnedMessagesPaginator.dispose();
  }
}
