import type { AxiosRequestConfig } from 'axios';
import { ChannelState } from './channel_state';
import { CooldownTimer } from './CooldownTimer';
import { MessageComposer } from './messageComposer';
import { MessageReceiptsTracker } from './messageDelivery';
import {
  generateChannelTempCid,
  logChatPromiseExecution,
  messageSetPagination,
} from './utils';
import type { ListenerKeys, StreamChat } from './client';
import { DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE } from './constants';
import type {
  AIState,
  APIResponse,
  BanUserOptions,
  ChannelAPIResponse,
  ChannelData,
  ChannelMemberResponse,
  ChannelQueryOptions,
  ChannelResponse,
  ChannelUpdateOptions,
  CombinedEvents,
  CreateDraftResponse,
  EventHandler,
  EventPayload,
  GetRepliesAPIResponse,
  GetRepliesRequest,
  LiveLocationPayload,
  LocalMessage,
  MarkReadOptions,
  MarkUnreadOptions,
  Message,
  MessageResponse,
  MessageSetType,
  PartialUpdateChannel,
  PinnedMessagePaginationOptions,
  PinnedMessagesSort,
  QueryMembersPayload,
  ReactionAPIResponse,
  ReactionResponse,
  SearchPayload,
  StaticLocationPayload,
  UnBanUserOptions,
  UpdateLocationPayload,
  UserResponse,
} from './types';
import type { RoleName } from './permissions';
import type {
  ChannelGetOrCreateRequest as Gen_ChannelGetOrCreateRequest,
  ChannelMemberRequest as Gen_ChannelMemberRequest,
  ChannelPushPreferencesResponse as Gen_ChannelPushPreferencesResponse,
  ChannelStopWatchingRequest as Gen_ChannelStopWatchingRequest,
  CreateDraftRequest as Gen_CreateDraftRequest,
  HideChannelRequest as Gen_HideChannelRequest,
  MuteChannelRequest as Gen_MuteChannelRequest,
  SendMessageRequest as Gen_SendMessageRequest,
  ShowChannelRequest as Gen_ShowChannelRequest,
  UnmuteChannelRequest as Gen_UnmuteChannelRequest,
  UpdateChannelRequest as Gen_UpdateChannelRequest,
  WSEvent,
} from './gen/models';
import type { ChatApi } from './gen/chat/ChatApi';
import { ChannelApi } from './gen/chat/ChannelApi';

/**
 * The Channel class manages its own state.
 */
export class Channel extends ChannelApi {
  _client: StreamChat;
  data: Partial<ChannelResponse> | undefined;
  _data: ChannelData;
  cid: string;
  /**  */
  listeners: Map<ListenerKeys, Set<EventHandler>>;
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
  push_preferences?: Gen_ChannelPushPreferencesResponse;
  public readonly messageComposer: MessageComposer;
  public readonly messageReceiptsTracker: MessageReceiptsTracker;
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
    // this.data = data;
    // this._data is used for the requests...
    this._data = data;
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

    this.messageReceiptsTracker = new MessageReceiptsTracker({
      locateMessage: (timestampMs) => {
        const msg = this.state.findMessageByTimestamp(timestampMs);
        return msg && { timestampMs, msgId: msg.id };
      },
    });

    this.cooldownTimer = new CooldownTimer({ channel: this });
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

  _sendMessage(request: Gen_SendMessageRequest) {
    return super.sendMessage(request);
  }

  /**
   * Sends a message to this channel.
   *
   * @param request - The send message request payload, including the message body and optional flags
   *   such as `skip_enrich_url`, `skip_push`, and `keep_channel_hidden`.
   * @returns The server response.
   */
  override async sendMessage(request: Gen_SendMessageRequest) {
    try {
      const offlineDb = this.getClient().offlineDb;
      const messageId = request.message?.id;
      if (offlineDb && messageId) {
        return await offlineDb.queueTask<Awaited<ReturnType<ChatApi['sendMessage']>>>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId,
            payload: [request],
            type: 'send-message',
          },
        });
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:send-message`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }
    return await this._sendMessage(request);
  }

  /**
   * Upload a file to this channel's file endpoint (multipart). Forwards to the client's `sendFile` implementation.
   *
   * @param uri - File source: URL string, `File`, `Buffer`, or readable stream (Node).
   * @param name - File name sent in the multipart body (optional).
   * @param contentType - MIME type; defaults are applied when omitted (optional).
   * @param user - User payload appended to the form as JSON (optional).
   * @param axiosRequestConfig - Axios per-request config, merged after upload defaults, e.g. `onUploadProgress`, `signal` from `AbortController` (optional).
   * @returns A promise resolving to `{ file: string, ... }` with the CDN URL.
   */
  sendFile(
    uri: string | NodeJS.ReadableStream | Buffer | File,
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
   * @param contentType - MIME type (optional).
   * @param user - User payload appended to the form as JSON (optional).
   * @param axiosRequestConfig - Axios per-request config, merged after upload defaults, e.g. `onUploadProgress`, `signal` (optional).
   * @returns A promise resolving to `{ file: string, ... }` with the CDN URL.
   */
  sendImage(
    uri: string | NodeJS.ReadableStream | File,
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

  deleteFile(url: string) {
    return this.deleteChannelFile({ url });
  }

  deleteImage(url: string) {
    return this.deleteChannelImage({ url });
  }

  /**
   * Sends an event on this channel.
   *
   * @param event - For example `{ type: 'message.read' }`.
   * @returns The server response.
   */
  override async sendEvent(request: { event: CombinedEvents }) {
    this._checkInitialized();
    return await super.sendEvent(request);
  }

  /**
   * Queries messages.
   *
   * @param request - The search request payload (optional). The inner `payload` accepts
   *   MongoDB-style filters and additional options such as `user_id`.
   * @returns The search messages response.
   */
  async search(request?: { payload?: SearchPayload }) {
    return await this.getClient().search(request);
  }

  /**
   * Queries members.
   *
   * @param request - The query members request payload (optional). The inner `payload` accepts
   *   MongoDB-style filters, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`),
   *   and pagination options (`limit`, `offset`).
   * @returns The query members response.
   */
  async queryMembers(request?: { payload?: Partial<QueryMembersPayload> }) {
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
    return await this.getClient().queryMembers({
      payload: {
        ...payload,
        ...request?.payload,
      },
    });
  }

  /**
   * Sends a reaction to a message. If offline support is enabled, it will make sure
   * that sending the reaction is queued up if it fails due to bad internet conditions and executed
   * later.
   *
   * @param request - The send-reaction request payload, including the target message ID, the
   *   reaction object (e.g. `{ type: 'love' }`), and optional flags such as `enforce_unique` and
   *   `skip_push`.
   * @returns The server response.
   */
  async sendReaction(request: Parameters<ChatApi['sendReaction']>[0]) {
    const { id: messageId } = request;

    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return await offlineDb.queueTask<ReactionAPIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId,
            payload: [request],
            type: 'send-reaction',
          },
        });
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:send-reaction`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return this._sendReaction(request);
  }

  _sendReaction(request: Parameters<ChatApi['sendReaction']>[0]) {
    return this.getClient().sendReaction(request);
  }

  async deleteReaction(request: Parameters<ChatApi['deleteReaction']>[0]) {
    this._checkInitialized();

    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        const message = this.state.messages.find(({ id }) => id === request.id);
        const reaction = {
          message_id: request.id,
          type: request.type,
        } as ReactionResponse;

        if (message) {
          await offlineDb.deleteReaction({
            message,
            reaction,
          });
        }

        return await offlineDb.queueTask<ReactionAPIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId: request.id,
            payload: [request],
            type: 'delete-reaction',
          },
        });
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:delete-reaction`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return await this._deleteReaction(request);
  }

  /**
   * Deletes a reaction by user and type.
   *
   * @param request - The delete reaction request payload identifying the target message and reaction type.
   * @returns The server response.
   */
  async _deleteReaction(request: Parameters<ChatApi['deleteReaction']>[0]) {
    return await this.getClient().deleteReaction(request);
  }

  /**
   * Edit the channel using the inherited `update()` from `ChannelApi`. Caches the
   * server-returned channel onto `this.data`.
   *
   * @param request - Channel update payload, e.g. `{ data: { name: 'foo' }, message }` (optional).
   * @returns The server response.
   */
  override async update(request?: Gen_UpdateChannelRequest) {
    const data = await super.update(request);
    this.data = data.channel;
    return data;
  }

  /**
   * Partial update of channel properties.
   *
   * @param update - The partial update request.
   * @returns The server response.
   */
  async updatePartial(update: PartialUpdateChannel) {
    const data = await this.updateChannelPartial(update);

    if (!this.getClient()._cacheEnabled) return data;

    const channel = data.channel;
    const currentCapabilities = this.data?.own_capabilities ?? [];
    const newCapabilities = channel?.own_capabilities;

    const capabilitiesChanged =
      newCapabilities &&
      [...currentCapabilities].sort().join() !== [...newCapabilities].sort().join();

    this.data = channel;
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
   * @returns The server response.
   */
  async enableSlowMode(coolDownInterval: number) {
    return await this.update({ cooldown: coolDownInterval });
  }

  /**
   * Disables slow mode.
   *
   * @returns The server response.
   */
  async disableSlowMode() {
    return await this.update({ cooldown: 0 });
  }

  public async sendSharedLocation(
    location: (StaticLocationPayload | LiveLocationPayload) & { message_id?: string },
  ) {
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

  public async stopLiveLocationSharing(payload: UpdateLocationPayload) {
    const location = await this.getClient().updateLiveLocation({
      ...payload,
      end_at: new Date(),
    });
    this.getClient().dispatchEvent({
      live_location: location,
      type: 'live_location_sharing.stopped',
    });
  }

  /**
   * Accepts an invitation to the channel.
   *
   * @param options - The object to update the custom properties of this channel with (optional, defaults to `{}`).
   * @returns The server response.
   */
  async acceptInvite(options: ChannelUpdateOptions = {}) {
    return await this.update({ accept_invite: true, ...options });
  }

  /**
   * Rejects an invitation to the channel.
   *
   * @param options - The object to update the custom properties of this channel with (optional, defaults to `{}`).
   * @returns The server response.
   */
  async rejectInvite(options: ChannelUpdateOptions = {}) {
    return await this.update({ reject_invite: true, ...options });
  }

  /**
   * Adds members to the channel.
   *
   * @param members - An array of members to add to the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async addMembers(
    members: string[] | Gen_ChannelMemberRequest[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    const adjustedMembers = members.map(
      (memberOrId) =>
        ({
          user_id: typeof memberOrId === 'string' ? memberOrId : memberOrId.user_id,
        }) satisfies Gen_ChannelMemberRequest,
    );
    return await this.update({ add_members: adjustedMembers, message, ...options });
  }

  /**
   * Adds filter tags to the channel.
   *
   * @param tags - An array of tags to add to the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async addFilterTags(
    tags: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this.update({ add_filter_tags: tags, message, ...options });
  }

  /**
   * Removes filter tags from the channel.
   *
   * @param tags - An array of tags to remove from the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async removeFilterTags(
    tags: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this.update({ remove_filter_tags: tags, message, ...options });
  }

  /**
   * Adds moderators to the channel.
   *
   * @param members - An array of member identifiers.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async addModerators(
    members: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this.update({ add_moderators: members, message, ...options });
  }

  /**
   * Sets member roles in a channel.
   *
   * @param roles - List of role assignments.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async assignRoles(
    roles: { channel_role: RoleName; user_id: string }[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this.update({ assign_roles: roles, message, ...options });
  }

  /**
   * Invite members to the channel.
   *
   * @param members - An array of members to invite to the channel.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async inviteMembers(
    members: string[] | Gen_ChannelMemberRequest[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    const adjustedMembers = members.map(
      (memberOrId) =>
        ({
          user_id: typeof memberOrId === 'string' ? memberOrId : memberOrId.user_id,
        }) satisfies Gen_ChannelMemberRequest,
    );

    return await this.update({ invites: adjustedMembers, message, ...options });
  }

  /**
   * Removes members from the channel.
   *
   * @param members - An array of member identifiers.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async removeMembers(
    members: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this.update({ remove_members: members, message, ...options });
  }

  /**
   * Removes the moderator role from channel members.
   *
   * @param members - An array of member identifiers.
   * @param message - Message object for channel members notification (optional).
   * @param options - Configuration to control the behavior while updating (optional, defaults to `{}`).
   * @returns The server response.
   */
  async demoteModerators(
    members: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this.update({ demote_moderators: members, message, ...options });
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
   * @returns The server response.
   */
  async mute(options?: Gen_MuteChannelRequest) {
    return await this.getClient().muteChannel({
      channel_cids: [this.cid],
      ...options,
    });
  }

  /**
   * Unmutes the current channel.
   *
   * @example
   * // server side
   * await channel.unmute({ user_id: userId });
   *
   * @param options - Unmute options (optional, defaults to `{}`).
   * @param opts.user_id - User ID (optional).
   * @returns The server response.
   */
  async unmute(options?: Gen_UnmuteChannelRequest) {
    return await this.getClient().unmuteChannel({
      channel_cids: [this.cid],
      ...options,
    });
  }

  /**
   * Archives the current channel.
   *
   * @example
   * await channel.archive();
   *
   * @returns The server response.
   */
  async archive() {
    return await this.updateMemberPartial({ set: { archived: true } });
  }

  /**
   * Unarchives the current channel.
   *
   * @example
   * await channel.unarchive();
   *
   * @returns The server response.
   */
  async unarchive() {
    return await this.updateMemberPartial({ set: { archived: false } });
  }

  /**
   * Pins the current channel.
   *
   * @example
   * await channel.pin();
   *
   * @returns The server response.
   */
  async pin() {
    return await this.updateMemberPartial({ set: { pinned: true } });
  }

  /**
   * Unpins the current channel.
   *
   * @example
   * await channel.unpin();
   *
   * @returns The server response.
   */
  async unpin() {
    return await this.updateMemberPartial({ set: { pinned: false } });
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

  sendAction(messageId: string, formData: Record<string, string>) {
    this._checkInitialized();
    if (!messageId) {
      throw Error(`Message id is missing`);
    }
    return this.getClient().runMessageAction({
      id: messageId,
      form_data: formData,
    });
  }

  /**
   * First of the `typing.start` and `typing.stop` events based on the user's keystrokes.
   * Call this on every keystroke.
   *
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   *
   * @param parentId - Set this field to `message.id` to indicate that the typing event is happening in a thread (optional).
   * @param options - Optional override carrying a `user_id` (optional).
   */
  async keystroke(parentId?: string, options?: { user_id: string }) {
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
      await this.sendEvent({
        event: {
          type: 'typing.start',
          parent_id: parentId,
          ...(options || {}),
          created_at: new Date(),
          custom: {},
        },
      });
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
   */
  async updateAIState(
    messageId: string,
    state: AIState,
    options: { ai_message?: string } = {},
  ) {
    await this.sendEvent({
      event: {
        ...options,
        type: 'ai_indicator.update',
        message_id: messageId,
        ai_state: state,
        created_at: new Date(),
        custom: {},
      },
    });
  }

  /**
   * Sends an event to notify watchers to clear the typing/thinking UI when the AI response starts streaming.
   * Typically used by the server connected to the AI service to inform clients that the AI response has started.
   */
  async clearAIIndicator() {
    await this.sendEvent({
      event: {
        type: 'ai_indicator.clear',
        created_at: new Date(),
        custom: {},
      },
    });
  }

  /**
   * Sends an event to stop AI response generation, leaving the message in its current state.
   * Triggered by the user to halt the AI response process.
   */
  async stopAIResponse() {
    await this.sendEvent({
      event: {
        type: 'ai_indicator.stop',
        created_at: new Date(),
        custom: {},
      },
    });
  }

  /**
   * Sets last typing to null and sends the `typing.stop` event.
   *
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   *
   * @param parentId - Set this field to `message.id` to indicate that the typing event is happening in a thread (optional).
   * @param options - Optional override carrying a `user_id` (optional).
   */
  async stopTyping(parentId?: string, options?: { user_id: string }) {
    if (!this._isTypingIndicatorsEnabled()) {
      return;
    }
    this.lastTypingEvent = null;
    this.isTyping = false;
    await this.sendEvent({
      event: {
        type: 'typing.stop',
        parent_id: parentId,
        ...(options || {}),
        created_at: new Date(),
        custom: {},
      },
    });
  }

  _isTypingIndicatorsEnabled(): boolean {
    if (!this.getConfig()?.typing_events || !this.getClient().wsConnection?.isHealthy) {
      return false;
    }
    return this.getClient().user?.privacy_settings?.typing_indicators?.enabled ?? true;
  }

  /**
   * Returns the last message, accounting for the fact that the last few messages might not be perfectly sorted.
   *
   * @returns The latest local message, or `undefined` if there are no messages.
   */
  lastMessage(): LocalMessage | undefined {
    // get last 5 messages, sort, return the latest
    // get a slice of the last 5
    let min = this.state.latestMessages.length - 5;
    if (min < 0) {
      min = 0;
    }
    const max = this.state.latestMessages.length + 1;
    const messageSlice = this.state.latestMessages.slice(min, max);

    // sort by pk desc
    messageSlice.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return messageSlice[0];
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
  async markReadViaReporter(data: MarkReadOptions = {}) {
    return await this.getClient().messageDeliveryReporter.markRead(this, data);
  }

  /**
   * Override of the inherited `markRead()` from `ChannelApi` that requires the
   * channel to be initialized and respects the `read_events` channel config.
   *
   * @param data - Mark read options (optional, defaults to `{}`).
   * @returns The server response, or `null` if the request was skipped.
   */
  override async markRead(data?: MarkReadOptions) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events) {
      throw new Error('Read events are disabled for this application');
    }

    return await super.markRead(data);
  }

  /**
   * Marks the channel as unread from `messageId`. Only works when the `read_events` setting is enabled.
   *
   * @param data - Mark unread options.
   * @returns An API response, or `null` if the request was skipped.
   */
  override async markUnread(data?: MarkUnreadOptions) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events) {
      throw new Error('Read events are disabled for this application');
    }

    return await super.markUnread(data);
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
  async watch(options?: ChannelQueryOptions) {
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
    this.data = state.channel;

    this._client.logger(
      'info',
      `channel:watch() - started watching channel ${this.cid}`,
      {
        tags: ['channel'],
        channel: this,
      },
    );
    return state;
  }

  /**
   * Stops watching the channel.
   *
   * @param request - The stop-watching request payload (optional).
   * @returns The server response.
   */
  override async stopWatching(request?: Gen_ChannelStopWatchingRequest) {
    const response = await super.stopWatching(request);

    this._client.logger(
      'info',
      `channel:watch() - stopped watching channel ${this.cid}`,
      {
        tags: ['channel'],
        channel: this,
      },
    );

    return response;
  }

  /**
   * List the message replies for a parent message.
   *
   * The recommended way of working with threads is to use the `Thread` class.
   *
   * @param request - The get-replies request payload, including the parent message ID, pagination
   *   params, and optional sort directions for `created_at`.
   * @returns A response with a list of messages.
   */
  async getReplies(request: GetRepliesRequest) {
    const data = await this.getClient().getReplies(request);

    // add any messages to our thread state
    if (data.messages) {
      this.state.addMessagesSorted(data.messages);
    }

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
   * @param request - The request payload, including the target message ID and
   *   pagination options (`limit`, `offset`).
   * @returns The server response.
   */
  getReactions(request: Parameters<ChatApi['getReactions']>[0]) {
    return this.getClient().getReactions(request);
  }

  /**
   * Retrieves a list of messages by ID.
   *
   * @param messageIds - The IDs of the messages to retrieve from this channel.
   * @returns Server response.
   */
  getMessagesById(messageIds: string[]) {
    return this.getManyMessages({ ids: messageIds });
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

    // Return false if channel doesn't allow read events.
    if (
      Array.isArray(this.data?.own_capabilities) &&
      !this.data?.own_capabilities.includes('read-events')
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
    // todo: prevent finding the latest message set on each iteration
    let count = 0;
    for (let i = 0; i < this.state.latestMessages.length; i += 1) {
      const message = this.state.latestMessages[i];
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
    for (let i = 0; i < this.state.latestMessages.length; i += 1) {
      const message = this.state.latestMessages[i];
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
  create = async (options?: ChannelQueryOptions) => {
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
   * @returns A query response.
   */
  async query(
    options: ChannelQueryOptions & { created_by_id?: string } = {},
    messageSetToAddToIfDoesNotExist: MessageSetType = 'current',
  ) {
    // Make sure we wait for the connect promise if there is a pending one
    await this.getClient().wsPromise;

    const createdById = options.created_by_id ?? this._data?.created_by?.id;
    // this._data?.created_by_id;

    if (this.getClient()._isUsingServerAuth() && typeof createdById !== 'string') {
      this.getClient().logger(
        'warn',
        'Either `created_by` (with `id` property) or `created_by_id` are missing from both `Channel._data` and `options` parameter',
      );
    }

    const queryPayload: Gen_ChannelGetOrCreateRequest = {
      data: this._data,
      state: true,
      ...options,
    };

    const state = this.id
      ? await this.getOrCreate(queryPayload)
      : await this.getClient().getOrCreateDistinctChannel({
          type: this.type,
          ...queryPayload,
        });

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

    // add any messages to our channel state
    const { messageSet, filteredMessageIds } = this._initializeState(
      state,
      messageSetToAddToIfDoesNotExist,
    );
    messageSet.pagination = {
      ...messageSet.pagination,
      ...messageSetPagination({
        parentSet: messageSet,
        messagePaginationOptions: options?.messages,
        requestedPageSize:
          options?.messages?.limit ?? DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
        returnedPage: state.messages,
        filteredReturnedPage: state.messages.filter(
          (m) => !filteredMessageIds.includes(m.id),
        ),
        logger: this.getClient().logger,
      }),
    };

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
        isLatestMessageSet: messageSet.isLatest,
      },
    });
    this.getClient().offlineDb?.executeQuerySafely(
      (db) =>
        db.upsertChannels?.({
          channels: [state],
          isLatestMessagesSet: messageSet.isLatest,
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
   * @param request - The hide channel request payload (optional). Pass `{ clear_history: true }`
   *   to clear message history for the user.
   * @returns The server response.
   */
  override async hide(request?: Gen_HideChannelRequest) {
    this._checkInitialized();
    return await super.hide(request);
  }

  /**
   * Removes the hidden status for a channel. Ensures the channel is initialized first.
   *
   * @param request - The show channel request payload (optional).
   * @returns The server response.
   */
  override async show(request?: Gen_ShowChannelRequest) {
    this._checkInitialized();
    return await super.show(request);
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
   * @param request - The cast-poll-vote request payload, including the target message ID, poll ID,
   *   and the vote to cast (or an empty payload to cancel).
   * @returns The poll vote response.
   */
  async vote(request: Parameters<ChatApi['castPollVote']>[0]) {
    return await this.getClient().castPollVote(request);
  }

  async removeVote(request: Parameters<ChatApi['deletePollVote']>[0]) {
    return await this.getClient().deletePollVote(request);
  }

  async _createDraft(request: Gen_CreateDraftRequest) {
    return await super.createDraft(request);
  }

  /**
   * Creates or updates a draft message in a channel. If offline support is enabled, the
   * call is queued so it is replayed on reconnect.
   */
  override async createDraft(request: Gen_CreateDraftRequest) {
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return (await offlineDb.queueTask<CreateDraftResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            threadId: request.message?.parent_id,
            payload: [request],
            type: 'create-draft',
          },
        })) as Awaited<ReturnType<ChannelApi['createDraft']>>;
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:create-draft`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return this._createDraft(request);
  }

  async _deleteDraft(request?: Parameters<ChannelApi['deleteDraft']>[0]) {
    return await super.deleteDraft(request);
  }

  /**
   * Deletes a draft message from a channel or a thread. If offline support is enabled, the
   * call is queued so it is replayed on reconnect.
   */
  override async deleteDraft(request?: Parameters<ChannelApi['deleteDraft']>[0]) {
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return (await offlineDb.queueTask<APIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            threadId: request?.parent_id,
            payload: [request],
            type: 'delete-draft',
          },
        })) as Awaited<ReturnType<ChannelApi['deleteDraft']>>;
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:delete-draft`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return this._deleteDraft(request);
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
  on<T extends ListenerKeys | string>(
    eventType: T,
    callback: EventHandler<T>,
  ): { unsubscribe: () => void };
  on(callback: EventHandler): { unsubscribe: () => void };
  on(
    callbackOrString: EventHandler | string,
    callbackOrNothing?: EventHandler,
  ): { unsubscribe: () => void } {
    const key = callbackOrNothing ? (callbackOrString as ListenerKeys) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    const set = this.listeners.get(key) ?? new Set();

    this._client.logger(
      'info',
      `Attaching listener for ${key} event on channel ${this.cid}`,
      {
        tags: ['event', 'channel'],
      },
    );
    set.add(callback);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, set);
    }

    return {
      unsubscribe: () => {
        this._client.logger(
          'info',
          `Removing listener for ${key} event from channel ${this.cid}`,
          {
            tags: ['event', 'channel'],
          },
        );
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
  off<T extends ListenerKeys | string>(eventType: T, callback: EventHandler): void;
  off(callback: EventHandler): void;
  off(callbackOrString: EventHandler | string, callbackOrNothing?: EventHandler): void {
    const key = callbackOrNothing ? (callbackOrString as ListenerKeys) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    this._client.logger(
      'info',
      `Removing listener for ${key} event from channel ${this.cid}`,
      {
        tags: ['event', 'channel'],
        channel: this,
      },
    );

    const set = this.listeners.get(key);

    set?.delete(callback);

    if (!set?.size) {
      this.listeners.delete(key);
    }
  }

  _handleChannelEvent(event: CombinedEvents) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const channel = this;
    this._client.logger(
      'info',
      `channel:_handleChannelEvent - Received event of type { ${event.type} } on ${this.cid}`,
      {
        tags: ['event', 'channel'],
        channel: this,
      },
    );

    const channelState = channel.state;
    switch (event.type) {
      case 'typing.start':
        if (event.user?.id) {
          channelState.typing[event.user.id] = event;
        }
        break;
      case 'typing.stop':
        if (event.user?.id) {
          delete channelState.typing[event.user.id];
        }
        break;
      case 'message.read':
        if (event.user?.id && event.created_at) {
          const previousReadState = channelState.read[event.user.id];
          channelState.read[event.user.id] = {
            // in case we already have delivery information
            ...previousReadState,
            last_read: new Date(event.created_at),
            last_read_message_id: event.last_read_message_id,
            user: event.user,
            unread_messages: 0,
          };
          this.messageReceiptsTracker.onMessageRead({
            user: event.user,
            readAt: event.created_at,
            lastReadMessageId: event.last_read_message_id,
          });
          const client = this.getClient();

          const isOwnEvent = event.user?.id === client.user?.id;

          if (isOwnEvent) {
            channelState.unreadCount = 0;
            client.syncDeliveredCandidates([this]);
          }
        }
        break;
      case 'message.delivered':
        // todo: update also on thread
        if (event.user?.id && event.created_at) {
          const previousReadState = channelState.read[event.user.id];
          channelState.read[event.user.id] = {
            ...previousReadState,
            last_delivered_at: event.last_delivered_at
              ? new Date(event.last_delivered_at)
              : undefined,
            last_delivered_message_id: event.last_delivered_message_id,
            user: event.user,
          };

          this.messageReceiptsTracker.onMessageDelivered({
            user: event.user,
            deliveredAt: event.created_at,
            lastDeliveredMessageId: event.last_delivered_message_id,
          });

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
          if (event.hard_delete) channelState.removeMessage(event.message);
          else channelState.addMessageSorted(event.message, false, false);

          channelState.removeQuotedMessageReferences(event.message);

          if (event.message.pinned) {
            channelState.removePinnedMessage(event.message);
          }
        }
        break;
      case 'user.messages.deleted':
        if (event.user) {
          this.state.deleteUserMessages(
            event.user,
            !!event.hard_delete,
            new Date(event.created_at ?? Date.now()),
          );
        }
        break;
      case 'message.new':
        if (event.message) {
          const client = this.getClient();
          /* if message belongs to current user, always assume timestamp is changed to filter it out and add again to avoid duplication */
          const ownMessage = event.user?.id === client.user?.id;
          const isThreadMessage =
            event.message.parent_id && !event.message.show_in_channel;

          if (this.state.isUpToDate || isThreadMessage) {
            channelState.addMessageSorted(event.message, ownMessage);
          }

          if (event.message.pinned) {
            channelState.addPinnedMessage(event.message);
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
            for (const userId in channelState.read) {
              if (userId === event.user.id) {
                channelState.read[event.user.id] = {
                  last_read: event.created_at,
                  user: event.user,
                  unread_messages: 0,
                  last_delivered_at: event.created_at,
                  last_delivered_message_id: event.message.id,
                };
              } else {
                channelState.read[userId].unread_messages += 1;
              }
            }
          }

          if (this._countMessageAsUnread(event.message)) {
            channelState.unreadCount = channelState.unreadCount + 1;
          }

          client.syncDeliveredCandidates([this]);
        }
        break;
      case 'message.updated':
      case 'message.undeleted':
        if (event.message) {
          this._extendEventWithOwnReactions(event);
          channelState.addMessageSorted(event.message, false, false);
          channelState._updateQuotedMessageReferences({ message: event.message });
          if (event.message.pinned) {
            channelState.addPinnedMessage(event.message);
          } else {
            channelState.removePinnedMessage(event.message);
          }
        }
        break;
      case 'channel.truncated':
        if (event.channel?.truncated_at) {
          const truncatedAt = +new Date(event.channel.truncated_at);

          channelState.messageSets.forEach((messageSet, messageSetIndex) => {
            messageSet.messages.forEach(({ created_at: createdAt, id }) => {
              if (truncatedAt > +createdAt)
                channelState.removeMessage({ id, messageSetIndex });
            });
          });

          channelState.pinnedMessages.forEach(({ id, created_at: createdAt }) => {
            if (truncatedAt > +createdAt)
              channelState.removePinnedMessage({ id } as MessageResponse);
          });
          channelState.unreadCount = this.countUnread(
            new Date(event.channel.truncated_at),
          );
        } else {
          channelState.clearMessages();
          channelState.unreadCount = 0;
        }

        // system messages don't increment unread counts
        if (event.message) {
          channelState.addMessageSorted(event.message);
          if (event.message.pinned) {
            channelState.addPinnedMessage(event.message);
          }
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
        if (!ownMessage || !event.user) break;

        const unreadCount = event.unread_messages ?? 0;
        const currentState = channelState.read[event.user.id];
        channelState.read[event.user.id] = {
          // keep the message delivery info
          ...currentState,
          first_unread_message_id: event.first_unread_message_id,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          last_read: event.last_read_at!, // TODO: see why this is optional in OAPI spec
          last_read_message_id: event.last_read_message_id,
          user: event.user,
          unread_messages: unreadCount,
        };

        channelState.unreadCount = unreadCount;
        this.messageReceiptsTracker.onNotificationMarkUnread({
          user: event.user,
          lastReadAt: event.last_read_at,
          lastReadMessageId: event.last_read_message_id,
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
            own_capabilities:
              event.channel?.own_capabilities ?? channel.data?.own_capabilities,
          };
          channel.data = newChannelData;
          this.cooldownTimer.refresh();
        }
        break;
      case 'reaction.new':
        if (event.message && event.reaction) {
          const { message, reaction } = event;
          event.message = channelState.addReaction(reaction, message);
        }
        break;
      case 'reaction.deleted':
        if (event.message && event.reaction) {
          const { message, reaction } = event;
          event.message = channelState.removeReaction(reaction, message);
        }
        break;
      case 'reaction.updated':
        if (event.message && event.reaction) {
          const { message, reaction } = event;
          // assuming reaction.updated is only called if enforce_unique is true
          event.message = channelState.addReaction(reaction, message, true);
        }
        break;
      case 'channel.hidden':
        channel.data = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...channel.data!,
          blocked: event.channel?.blocked ?? false,
          hidden: true,
        };
        if (event.clear_history) {
          channelState.clearMessages();
        }
        break;
      case 'channel.visible':
        channel.data = {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...channel.data!,
          blocked: event.channel?.blocked ?? false,
          hidden: false,
        };
        this.getClient().offlineDb?.handleChannelVisibilityEvent({ event });
        break;
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
    if (
      !this.initialized &&
      !this.offlineMode &&
      !this.getClient()._isUsingServerAuth()
    ) {
      throw Error(
        `Channel ${this.cid} hasn't been initialized yet. Make sure to call .watch() and wait for it to resolve`,
      );
    }
  }

  _initializeState(
    state: ChannelAPIResponse,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'latest',
  ) {
    const { state: clientState, user, userId } = this.getClient();

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

    const messages = state.messages || [];
    if (!this.state.messages) {
      this.state.initMessages();
    }
    const { messageSet, filteredMessageIds } = this.state.addMessagesSorted(
      messages,
      false,
      true,
      true,
      messageSetToAddToIfDoesNotExist,
    );

    if (!this.state.pinnedMessages) {
      this.state.pinnedMessages = [];
    }
    this.state.addPinnedMessages(state.pinned_messages || []);
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
    if (userId != null) {
      const last_read = this.state.last_message_at || new Date();
      if (user) {
        this.state.read[user.id] = {
          user: user as UserResponse,
          last_read,
          unread_messages: 0,
        };
      }
    }

    // apply read state if part of the state
    if (state.read) {
      for (const read of state.read) {
        this.state.read[read.user.id] = {
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
          this.state.unreadCount = this.state.read[read.user.id].unread_messages;
        }
      }

      this.messageReceiptsTracker.ingestInitial(state.read);
    }

    return {
      messageSet,
      filteredMessageIds,
    };
  }

  _extendEventWithOwnReactions(
    event: EventPayload<'message.undeleted' | 'message.updated' | 'message.deleted'>,
  ) {
    if (!event.message) {
      return;
    }
    const message = this.state.findMessage(event.message.id, event.message.parent_id);
    if (message?.own_reactions) {
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
    this._client.logger(
      'info',
      `channel:disconnect() - Disconnecting the channel ${this.cid}`,
      {
        tags: ['connection', 'channel'],
        channel: this,
      },
    );

    this.disconnected = true;
    this.cooldownTimer.clearTimeout();
    this.state.setIsUpToDate(false);
  }
}
