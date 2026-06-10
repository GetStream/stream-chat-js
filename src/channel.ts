import type { AxiosRequestConfig } from 'axios';
import { ChannelState } from './channel_state';
import { CooldownTimer } from './CooldownTimer';
import { MessageComposer } from './messageComposer';
import { MessageReceiptsTracker } from './messageDelivery';
import {
  generateChannelTempCid,
  logChatPromiseExecution,
  messageSetPagination,
  normalizeQuerySort,
} from './utils';
import type { ListenerKeys, StreamChat } from './client';
import { DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE } from './constants';
import type {
  AIState,
  APIResponse,
  AscDesc,
  BanUserOptions,
  ChannelAPIResponse,
  ChannelData,
  ChannelMemberResponse,
  ChannelQueryOptions,
  ChannelResponse,
  ChannelUpdateOptions,
  CombinedEvents,
  CreateDraftResponse,
  DraftMessagePayload,
  EventHandler,
  EventPayload,
  GetRepliesAPIResponse,
  GetRepliesOptions,
  GetRepliesRequest,
  LiveLocationPayload,
  LocalMessage,
  MarkReadOptions,
  MarkUnreadOptions,
  MemberFilters,
  MemberSort,
  Message,
  MessageFilters,
  MessageOptions,
  MessageResponse,
  MessageSetType,
  PartialUpdateChannel,
  PartialUpdateMember,
  PinnedMessagePaginationOptions,
  PinnedMessagesSort,
  PollVoteData,
  QueryMembersOptions,
  Reaction,
  ReactionAPIResponse,
  ReactionResponse,
  SearchMessageSortBase,
  SearchOptions,
  SearchPayload,
  SendMessageAPIResponse,
  SendMessageOptions,
  SendReactionOptions,
  StaticLocationPayload,
  TruncateOptions,
  UnBanUserOptions,
  UpdateLocationPayload,
  UserResponse,
} from './types';
import type { Role } from './permissions';
import type {
  ChannelGetOrCreateRequest as Gen_ChannelGetOrCreateRequest,
  ChannelInputRequest as Gen_ChannelInputRequest,
  ChannelMemberRequest as Gen_ChannelMemberRequest,
  ChannelPushPreferencesResponse as Gen_ChannelPushPreferencesResponse,
  SendMessageRequest as Gen_SendMessageRequest,
  UpdateChannelRequest as Gen_UpdateChannelRequest,
  WSEvent,
} from './gen/models';
import { ChannelApi } from './gen/chat/ChannelApi';

/**
 * Channel - The Channel class manages it's own state.
 */
export class Channel {
  _client: StreamChat;
  type: string;
  id: string | undefined;
  data: Partial<ChannelResponse> | undefined;
  _data: ChannelData;
  cid: string;
  /**  */
  listeners: Map<ListenerKeys, Set<EventHandler>>;
  state: ChannelState;
  /**
   * This boolean is a vague indication of weather the channel exists on chat backend.
   *
   * If the value is true, then that means the channel has been initialized by either calling
   * channel.create() or channel.query() or channel.watch().
   *
   * If the value is false, then channel may or may not exist on the backend. The only way to ensure
   * is by calling channel.create() or channel.query() or channel.watch().
   */
  initialized: boolean;
  /**
   * Indicates weather channel has been initialized by manually populating the state with some messages, members etc.
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
  public readonly channelApi: ChannelApi;

  /**
   * constructor - Create a channel
   *
   * @param {StreamChat} client the chat client
   * @param {string} type  the type of channel
   * @param {string} [id]  the id of the chat
   * @param {ChannelData} data any additional custom params
   *
   * @return {Channel} Returns a new uninitialized channel
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

    this.channelApi = new ChannelApi(client.chatApi, type, id);

    this._client = client;
    this.type = type;
    this.id = id;
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
   * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
   *
   * @return {StreamChat}
   */
  getClient(): StreamChat {
    if (this.disconnected === true) {
      throw Error(`You can't use a channel after client.disconnect() was called`);
    }
    return this._client;
  }

  /**
   * getConfig - Get the config for this channel id (cid)
   *
   * @return {Record<string, unknown>}
   */
  getConfig() {
    const client = this.getClient();
    return client.configs[this.cid];
  }

  /**
   * sendMessage - Send a message to this channel
   *
   * @param {Message} message The Message object
   * @param {boolean} [options.skip_enrich_url] Do not try to enrich the URLs within message
   * @param {boolean} [options.skip_push] Skip sending push notifications
   * @param {boolean} [options.is_pending_message] DEPRECATED, please use `pending` instead.
   * @param {boolean} [options.pending] Make this message pending
   * @param {Record<string,string>} [options.pending_message_metadata] Metadata for the pending message
   * @param {boolean} [options.force_moderation] Apply force moderation for server-side requests
   *
   * @return {Promise<SendMessageAPIResponse>} The Server Response
   */
  async _sendMessage(
    message: Gen_SendMessageRequest['message'],
    options?: SendMessageOptions,
  ) {
    return await this.channelApi.sendMessage({
      message,
      ...options,
    });
  }

  async sendMessage(
    message: Gen_SendMessageRequest['message'],
    options?: SendMessageOptions,
  ) {
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        const messageId = message.id;
        if (messageId) {
          return await offlineDb.queueTask<SendMessageAPIResponse>({
            task: {
              channelId: this.id as string,
              channelType: this.type,
              messageId,
              payload: [message, options],
              type: 'send-message',
            },
          });
        }
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:send-message`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }
    return await this._sendMessage(message, options);
  }

  /**
   * Upload a file to this channel’s file endpoint (multipart). Forwards to the client’s `sendFile` implementation.
   *
   * @param uri File source: URL string, `File`, `Buffer`, or readable stream (Node).
   * @param name File name sent in the multipart body.
   * @param contentType MIME type; defaults are applied when omitted.
   * @param user Optional user payload appended to the form as JSON.
   * @param axiosRequestConfig Optional Axios per-request config, merged after upload defaults (e.g. `onUploadProgress`, `signal` from `AbortController`).
   * @return Promise resolving to `{ file: string, ... }` with the CDN URL.
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
   * Upload an image to this channel’s image endpoint (multipart). Uses the same transport as `sendFile`.
   *
   * @param uri Image source: URL string, `File`, or readable stream (Node). For `Buffer` uploads, use `sendFile` toward the channel file endpoint instead.
   * @param name File name sent in the multipart body.
   * @param contentType MIME type.
   * @param user Optional user payload appended to the form as JSON.
   * @param axiosRequestConfig Optional Axios per-request config, merged after upload defaults (e.g. `onUploadProgress`, `signal`).
   * @return Promise resolving to `{ file: string, ... }` with the CDN URL.
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
    return this.channelApi.deleteChannelFile({ url });
  }

  deleteImage(url: string) {
    return this.channelApi.deleteChannelImage({ url });
  }

  /**
   * sendEvent - Send an event on this channel
   *
   * @param {Event} event for example {type: 'message.read'}
   *
   * @return {Promise<EventAPIResponse>} The Server Response
   */
  async sendEvent(event: CombinedEvents) {
    this._checkInitialized();
    return await this.channelApi.sendEvent({ event });
  }

  /**
   * search - Query messages
   *
   * @param {MessageFilters | string}  query search query or object MongoDB style filters
   * @param {{client_id?: string; connection_id?: string; query?: string; message_filter_conditions?: MessageFilters}} options Option object, {user_id: 'tommaso'}
   *
   * @return {Promise<SearchAPIResponse>} search messages response
   */
  async search(
    query: MessageFilters | string,
    options: SearchOptions & {
      client_id?: string;
      connection_id?: string;
      message_filter_conditions?: MessageFilters;
      message_options?: MessageOptions;
      query?: string;
    } = {},
  ) {
    if (options.offset && options.next) {
      throw Error(`Cannot specify offset with next`);
    }
    // Return a list of channels
    const payload: SearchPayload = {
      filter_conditions: { cid: this.cid },
      ...options,
      sort: options.sort
        ? normalizeQuerySort<SearchMessageSortBase>(options.sort)
        : undefined,
    };
    if (typeof query === 'string') {
      payload.query = query;
    } else if (typeof query === 'object') {
      payload.message_filter_conditions = query;
    } else {
      throw Error(`Invalid type ${typeof query} for query parameter`);
    }
    // Make sure we wait for the connect promise if there is a pending one
    await this.getClient().wsPromise;

    return await this.getClient().chatApi.search({ payload });
  }

  /**
   * queryMembers - Query Members
   *
   * @param {MemberFilters}  filterConditions object MongoDB style filters
   * @param {MemberSort} [sort] Sort options, for instance [{created_at: -1}].
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{name: -1}, {created_at: 1}]
   * @param {{ limit?: number; offset?: number }} [options] Option object, {limit: 10, offset:10}
   *
   * @return {Promise<ChannelMemberAPIResponse>} Query Members response
   */
  async queryMembers(
    filterConditions: MemberFilters,
    sort: MemberSort = [],
    options: QueryMembersOptions = {},
  ) {
    let id: QueryMembersOptions['id'];
    const type = this.type;
    let members: QueryMembersOptions['members'];
    if (this.id) {
      id = this.id;
    } else if (this.data?.members && Array.isArray(this.data.members)) {
      // TODO: this should not be needed Gen_QueryMembersResponse should not come with user_id as optinal
      members = this.data.members.map((m) => ({
        ...m,
        user_id: m.user_id ?? m.user?.id,
      })) as QueryMembersOptions['members'];
    }
    // Return a list of members
    return await this.getClient().chatApi.queryMembers({
      payload: {
        type,
        id,
        members,
        sort: normalizeQuerySort(sort),
        filter_conditions: filterConditions,
        ...options,
      },
    });
  }

  /**
   * updateMemberPartial - Partial update a member
   *
   * @param {PartialUpdateMember}  request
   * @param {{ user_id?: string }} [options] Option object, {user_id: 'jane'} to optionally specify the user id

   * @return {Promise<ChannelMemberResponse>} Updated member
   */
  async updateMemberPartial(request: PartialUpdateMember) {
    return await this.channelApi.updateMemberPartial({
      ...request,
    });
  }

  /**
   * sendReaction - Sends a reaction to a message. If offline support is enabled, it will make sure
   * that sending the reaction is queued up if it fails due to bad internet conditions and executed
   * later.
   *
   * @param {string} messageID the message id
   * @param {Reaction} reaction the reaction object for instance {type: 'love'}
   * @param {{ enforce_unique?: boolean, skip_push?: boolean }} [options] Option object, {enforce_unique: true, skip_push: true} to override any existing reaction or skip sending push notifications
   *
   * @return {Promise<ReactionAPIResponse>} The Server Response
   */
  async sendReaction(
    messageID: string,
    reaction: Reaction,
    options?: SendReactionOptions,
  ) {
    if (!messageID) {
      throw Error(`Message id is missing`);
    }
    if (!reaction || Object.keys(reaction).length === 0) {
      throw Error(`Reaction object is missing`);
    }

    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return await offlineDb.queueTask<ReactionAPIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            messageId: messageID,
            payload: [messageID, reaction, options],
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

    return this._sendReaction(messageID, reaction, options);
  }

  /**
   * sendReaction - Send a reaction about a message
   *
   * @param {string} messageId the message id
   * @param {Reaction} reaction the reaction object for instance {type: 'love'}
   * @param {{ enforce_unique?: boolean, skip_push?: boolean }} [options] Option object, {enforce_unique: true, skip_push: true} to override any existing reaction or skip sending push notifications
   *
   * @return {Promise<ReactionAPIResponse>} The Server Response
   */
  async _sendReaction(
    messageId: string,
    reaction: Reaction,
    options?: SendReactionOptions,
  ) {
    if (!messageId) {
      throw Error(`Message id is missing`);
    }
    if (!reaction || Object.keys(reaction).length === 0) {
      throw Error(`Reaction object is missing`);
    }

    return await this.getClient().chatApi.sendReaction({
      id: messageId,
      reaction,
      ...options,
    });
  }

  async deleteReaction(messageId: string, reactionType: string) {
    this._checkInitialized();
    if (!reactionType || !messageId) {
      throw Error(
        'Deleting a reaction requires specifying both the message and reaction type',
      );
    }

    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        const message = this.state.messages.find(({ id }) => id === messageId);
        const reaction = {
          message_id: messageId,
          type: reactionType,
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
            messageId,
            payload: [messageId, reactionType],
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

    return await this._deleteReaction(messageId, reactionType);
  }

  /**
   * deleteReaction - Delete a reaction by user and type
   *
   * @param {string} messageId the id of the message from which te remove the reaction
   * @param {string} reactionType the type of reaction that should be removed
   * @param {string} [user_id] the id of the user (used only for server side request) default null
   *
   * @return {Promise<ReactionAPIResponse>} The Server Response
   */
  async _deleteReaction(messageId: string, reactionType: string) {
    this._checkInitialized();
    if (!reactionType || !messageId) {
      throw Error(
        'Deleting a reaction requires specifying both the message and reaction type',
      );
    }

    return await this.getClient().chatApi.deleteReaction({
      id: messageId,
      type: reactionType,
    });
  }

  /**
   * update - Edit the channel's custom properties
   *
   * @param {ChannelData} channelData The object to update the custom properties of this channel with
   * @param {Message} [updateMessage] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async update(
    channelData: Gen_ChannelInputRequest = {},
    updateMessage?: Message,
    options?: ChannelUpdateOptions,
  ) {
    // Strip out reserved names that will result in API errors.
    // TODO: this needs to be typed better
    // const reserved: Exclude<
    //   keyof (ChannelResponse & ChannelData),
    //   keyof CustomChannelData
    // >[] = [
    //   'config',
    //   'cid',
    //   'created_by',
    //   'id',
    //   'member_count',
    //   'type',
    //   'created_at',
    //   'updated_at',
    //   'last_message_at',
    //   'own_capabilities',
    // ];

    // reserved.forEach((key) => {
    //   delete channelData[key];
    // });

    return await this._update({
      message: updateMessage,
      data: channelData,
      ...options,
    });
  }

  /**
   * updatePartial - partial update channel properties
   *
   * @param {PartialUpdateChannel} partial update request
   *
   * @return {Promise<PartialUpdateChannelAPIResponse>}
   */
  async updatePartial(update: PartialUpdateChannel) {
    const data = await this.channelApi.updateChannelPartial(update);

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
   * enableSlowMode - enable slow mode
   *
   * @param {number} coolDownInterval the cooldown interval in seconds
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async enableSlowMode(coolDownInterval: number) {
    const data = await this.channelApi.update({
      cooldown: coolDownInterval,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * disableSlowMode - disable slow mode
   *
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async disableSlowMode() {
    const data = await this.channelApi.update({
      cooldown: 0,
    });
    this.data = data.channel;
    return data;
  }

  public async sendSharedLocation(
    location: (StaticLocationPayload | LiveLocationPayload) & { message_id?: string },
  ) {
    const result = await this.sendMessage({
      id: location.message_id,
      shared_location: location,
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
    const location = await this.getClient().updateLocation({
      ...payload,
      end_at: new Date(),
    });
    this.getClient().dispatchEvent({
      live_location: location,
      type: 'live_location_sharing.stopped',
    });
  }

  /**
   * delete - Delete the channel. Messages are permanently removed.
   *
   * @param {boolean} [options.hard_delete] Defines if the channel is hard deleted or not
   *
   * @return {Promise<DeleteChannelAPIResponse>} The server response
   */
  async delete(options: { hard_delete?: boolean } = {}) {
    return await this.channelApi.delete(options);
  }

  /**
   * truncate - Removes all messages from the channel
   * @param {TruncateOptions} [options] Defines truncation options
   * @return {Promise<TruncateChannelAPIResponse>} The server response
   */
  async truncate(options: TruncateOptions = {}) {
    return await this.channelApi.truncate(options);
  }

  /**
   * acceptInvite - accept invitation to the channel
   *
   * @param {ChannelUpdateOptions} [options] The object to update the custom properties of this channel with
   *
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async acceptInvite(options: ChannelUpdateOptions = {}) {
    return await this._update({ accept_invite: true, ...options });
  }

  /**
   * rejectInvite - reject invitation to the channel
   *
   * @param {ChannelUpdateOptions} [options] The object to update the custom properties of this channel with
   *
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async rejectInvite(options: ChannelUpdateOptions = {}) {
    return await this._update({ reject_invite: true, ...options });
  }

  /**
   * addMembers - add members to the channel
   *
   * @param {string[] | Array<NewMemberPayload>} members An array of members to add to the channel
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
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
    return await this._update({ add_members: adjustedMembers, message, ...options });
  }

  /**
   * addFilterTags - add filter tags to the channel
   *
   * @param {string[]} tags An array of tags to add to the channel
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async addFilterTags(
    tags: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ add_filter_tags: tags, message, ...options });
  }

  /**
   * removeFilterTags - remove filter tags from the channel
   *
   * @param {string[]} tags An array of tags to remove from the channel
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async removeFilterTags(
    tags: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ remove_filter_tags: tags, message, ...options });
  }

  /**
   * addModerators - add moderators to the channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async addModerators(
    members: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ add_moderators: members, message, ...options });
  }

  /**
   * assignRoles - sets member roles in a channel
   *
   * @param {{channel_role: Role, user_id: string}[]} roles List of role assignments
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async assignRoles(
    roles: { channel_role: Role; user_id: string }[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ assign_roles: roles, message, ...options });
  }

  /**
   * inviteMembers - invite members to the channel
   *
   * @param {string[] | Array<NewMemberPayload>} members An array of members to invite to the channel
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
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

    return await this._update({ invites: adjustedMembers, message, ...options });
  }

  /**
   * removeMembers - remove members from channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async removeMembers(
    members: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ remove_members: members, message, ...options });
  }

  /**
   * demoteModerators - remove moderator role from channel members
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   */
  async demoteModerators(
    members: string[],
    message?: Message,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ demote_moderators: members, message, ...options });
  }

  /**
   * _update - executes channel update request
   * @param payload Object Update Channel payload
   * @return {Promise<UpdateChannelAPIResponse>} The server response
   * TODO: introduce new type instead of Object in the next major update
   */
  async _update(payload: Gen_UpdateChannelRequest) {
    const data = await this.channelApi.update(payload);
    this.data = data.channel;
    return data;
  }

  /**
   * mute - mutes the current channel
   * @param {{ user_id?: string, expiration?: string }} options expiration in minutes or user_id
   * @return {Promise<MuteChannelAPIResponse>} The server response
   *
   * example with expiration:
   * await channel.mute({expiration: moment.duration(2, 'weeks')});
   *
   * example server side:
   * await channel.mute({user_id: userId});
   *
   */
  async mute(options: { expiration?: number } = {}) {
    return await this.getClient().chatApi.muteChannel({
      channel_cids: [this.cid],
      ...options,
    });
  }

  /**
   * unmute - mutes the current channel
   * @param {{ user_id?: string}} opts user_id
   * @return {Promise<APIResponse>} The server response
   *
   * example server side:
   * await channel.unmute({user_id: userId});
   */
  async unmute(opts: { user_id?: string } = {}) {
    return await this.getClient().chatApi.unmuteChannel({
      channel_cids: [this.cid],
      ...opts,
    });
  }

  /**
   * archive - archives the current channel
   * @param {{ user_id?: string }} opts user_id if called server side
   * @return {Promise<ChannelMemberResponse>} The server response
   *
   * example:
   * await channel.archives();
   *
   * example server side:
   * await channel.archive({user_id: userId});
   *
   */
  async archive() {
    const resp = await this.updateMemberPartial({ set: { archived: true } });
    return resp.channel_member;
  }

  /**
   * unarchive - unarchives the current channel
   * @return {Promise<ChannelMemberResponse>} The server response
   *
   * example:
   * await channel.unarchive();
   *
   */
  async unarchive() {
    const resp = await this.updateMemberPartial({ set: { archived: false } });
    return resp.channel_member;
  }

  /**
   * pin - pins the current channel
   * @return {Promise<ChannelMemberResponse>} The server response
   *
   * example:
   * await channel.pin();
   *
   */
  async pin() {
    const resp = await this.updateMemberPartial({ set: { pinned: true } });
    return resp.channel_member;
  }

  /**
   * unpin - unpins the current channel
   * @return {Promise<ChannelMemberResponse>} The server response
   *
   * example:
   * await channel.unpin();
   *
   */
  async unpin() {
    const resp = await this.updateMemberPartial({ set: { pinned: false } });
    return resp.channel_member;
  }

  /**
   * muteStatus - returns the mute status for the current channel
   * @return {{ muted: boolean; createdAt: Date | null; expiresAt: Date | null }} { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
   */
  muteStatus(): {
    createdAt: Date | null;
    expiresAt: Date | null;
    muted: boolean;
  } {
    this._checkInitialized();
    return this.getClient()._muteStatus(this.cid);
  }

  sendAction(messageId: string, formData: Record<string, string>) {
    this._checkInitialized();
    if (!messageId) {
      throw Error(`Message id is missing`);
    }
    return this.getClient().chatApi.runMessageAction({
      id: messageId,
      form_data: formData,
    });
  }

  /**
   * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
   * Call this on every keystroke
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   * @param {string} [parentId] set this field to `message.id` to indicate that typing event is happening in a thread
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
        type: 'typing.start',
        parent_id: parentId,
        ...(options || {}),
        created_at: new Date(),
        custom: {},
      });
    }
  }

  /**
   * Sends an event to update the AI state for a specific message.
   * Typically used by the server connected to the AI service to notify clients of state changes.
   *
   * @param messageId - The ID of the message associated with the AI state.
   * @param state - The new state of the AI process (e.g., thinking, generating).
   * @param options - Optional parameters, such as `ai_message`, to include additional details in the event.
   */
  async updateAIState(
    messageId: string,
    state: AIState,
    options: { ai_message?: string } = {},
  ) {
    await this.sendEvent({
      ...options,
      type: 'ai_indicator.update',
      message_id: messageId,
      ai_state: state,
      created_at: new Date(),
      custom: {},
    });
  }

  /**
   * Sends an event to notify watchers to clear the typing/thinking UI when the AI response starts streaming.
   * Typically used by the server connected to the AI service to inform clients that the AI response has started.
   */
  async clearAIIndicator() {
    await this.sendEvent({
      type: 'ai_indicator.clear',
      created_at: new Date(),
      custom: {},
    });
  }

  /**
   * Sends an event to stop AI response generation, leaving the message in its current state.
   * Triggered by the user to halt the AI response process.
   */
  async stopAIResponse() {
    await this.sendEvent({
      type: 'ai_indicator.stop',
      created_at: new Date(),
      custom: {},
    });
  }

  /**
   * stopTyping - Sets last typing to null and sends the typing.stop event
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   * @param {string} [parentId] set this field to `message.id` to indicate that typing event is happening in a thread
   */
  async stopTyping(parentId?: string, options?: { user_id: string }) {
    if (!this._isTypingIndicatorsEnabled()) {
      return;
    }
    this.lastTypingEvent = null;
    this.isTyping = false;
    await this.sendEvent({
      type: 'typing.stop',
      parent_id: parentId,
      ...(options || {}),
      created_at: new Date(),
      custom: {},
    });
  }

  _isTypingIndicatorsEnabled(): boolean {
    if (!this.getConfig()?.typing_events || !this.getClient().wsConnection?.isHealthy) {
      return false;
    }
    return this.getClient().user?.privacy_settings?.typing_indicators?.enabled ?? true;
  }

  /**
   * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
   *
   * @return {ReturnType<ChannelState['formatMessage']> | undefined} Description
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
   * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled. Syncs the message delivery report candidates local state.
   *
   * @param {MarkReadOptions} data
   * @return {Promise<EventAPIResponse | null>} Description
   */
  async markRead(data: MarkReadOptions = {}) {
    return await this.getClient().messageDeliveryReporter.markRead(this, data);
  }

  /**
   * markReadRequest - Send the mark read event for this user, only works if the `read_events` setting is enabled
   *
   * @param {MarkReadOptions} data
   * @return {Promise<EventAPIResponse | null>} Description
   */
  async markAsReadRequest(data: MarkReadOptions = {}) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events && !this.getClient()._isUsingServerAuth()) {
      return null;
    }

    return await this.channelApi.markRead({ ...data });
  }

  /**
   * markUnread - Mark the channel as unread from messageID, only works if the `read_events` setting is enabled
   *
   * @param {MarkUnreadOptions} data
   * @return {APIResponse} An API response
   */
  async markUnread(data: MarkUnreadOptions) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events && !this.getClient()._isUsingServerAuth()) {
      return null;
    }

    return await this.channelApi.markUnread({ ...data });
  }

  /**
   * clean - Cleans the channel state and fires stop typing if needed
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
   * watch - Loads the initial channel state and watches for changes
   *
   * @param {ChannelQueryOptions} options additional options for the query endpoint
   *
   * @return {Promise<QueryChannelAPIResponse>} The server response
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
   * stopWatching - Stops watching the channel
   *
   * @return {Promise<APIResponse>} The server response
   */
  async stopWatching() {
    const response = await this.channelApi.stopWatching();

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
   * getReplies - List the message replies for a parent message.
   *
   * The recommended way of working with threads is to use the Thread class.
   *
   * @param {string} parentId The message parent id, ie the top of the thread
   * @param {MessagePaginationOptions & { user?: UserResponse; user_id?: string }} options Pagination params, ie {limit:10, id_lte: 10}
   *
   * @return {Promise<GetRepliesAPIResponse>} A response with a list of messages
   */
  async getReplies(
    parentId: GetRepliesRequest['parent_id'],
    options: GetRepliesOptions,
    sort?: { created_at: AscDesc }[],
  ) {
    const normalizedSort = sort ? normalizeQuerySort(sort) : undefined;
    const data = await this.getClient().chatApi.getReplies({
      parent_id: parentId,
      sort: normalizedSort,
      ...options,
    });

    // add any messages to our thread state
    if (data.messages) {
      this.state.addMessagesSorted(data.messages);
    }

    return data;
  }

  /**
   * getPinnedMessages - List list pinned messages of the channel
   *
   * @param {PinnedMessagePaginationOptions} options Pagination params, ie {limit:10, id_lte: 10}
   * @param {PinnedMessagesSort} sort defines sorting direction of pinned messages
   *
   * @return {Promise<GetRepliesAPIResponse>} A response with a list of messages
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
          sort: normalizeQuerySort(sort),
        },
      },
    );
  }

  /**
   * getReactions - List the reactions, supports pagination
   *
   * @param {string} messageId The message id
   * @param {{ limit?: number; offset?: number }} options The pagination options
   *
   * @return {Promise<GetReactionsAPIResponse>} Server response
   */
  getReactions(messageId: string, options: { limit?: number; offset?: number }) {
    return this.getClient().chatApi.getReactions({
      id: messageId,
      ...options,
    });
  }

  /**
   * getMessagesById - Retrieves a list of messages by ID
   *
   * @param {string[]} messageIds The ids of the messages to retrieve from this channel
   *
   * @return {Promise<GetMultipleMessagesAPIResponse>} Server response
   */
  getMessagesById(messageIds: string[]) {
    return this.channelApi.getManyMessages({ ids: messageIds });
  }

  /**
   * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
   * @return {Date | null | undefined}
   */
  lastRead() {
    const { userId: userID } = this.getClient();
    if (userID) {
      return this.state.read[userID] ? this.state.read[userID].last_read : null;
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
   * countUnread - Count of unread messages
   *
   * @param {Date | null} [lastRead] lastRead the time that the user read a message, defaults to current user's read state
   *
   * @return {number} Unread count
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
   * countUnreadMentions - Count the number of unread messages mentioning the current user
   *
   * @return {number} Unread mentions count
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
   * create - Creates a new channel
   *
   * @return {Promise<QueryChannelAPIResponse>} The Server Response
   *
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
   * query - Query the API, get messages, members or other channel fields
   *
   * @param {ChannelQueryOptions} options The query options
   * @param {MessageSetType} messageSetToAddToIfDoesNotExist It's possible to load disjunct sets of a channel's messages into state, use `current` to load the initial channel state or if you want to extend the currently displayed messages, use `latest` if you want to load/extend the latest messages, `new` is used for loading a specific message and it's surroundings
   *
   * @return {Promise<QueryChannelAPIResponse>} Returns a query response
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
      ? await this.channelApi.getOrCreate(queryPayload)
      : await this.getClient().chatApi.getOrCreateDistinctChannel({
          type: this.type,
          ...queryPayload,
        });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const channel = state.channel!;

    // update the channel id if it was missing
    if (!this.id) {
      this.id = channel.id;
      this.channelApi.id = channel.id;
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
   * banUser - Bans a user from a channel
   *
   * @param {string} targetUserId
   * @param {BanUserOptions} options
   * @returns {Promise<APIResponse>}
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
   * hides the channel from queryChannels for the user until a message is added
   * If clearHistory is set to true - all messages will be removed for the user
   *
   * @param {string | null} userId
   * @param {boolean} clearHistory
   * @returns {Promise<APIResponse>}
   */
  async hide(clearHistory = false) {
    this._checkInitialized();

    return await this.channelApi.hide({
      clear_history: clearHistory,
    });
  }

  /**
   * removes the hidden status for a channel
   *
   * @param {string | null} userId
   * @returns {Promise<APIResponse>}
   */
  async show() {
    this._checkInitialized();
    return await this.channelApi.show();
  }

  /**
   * unbanUser - Removes the bans for a user on a channel
   *
   * @param {string} targetUserId
   * @param {UnBanUserOptions} options
   * @returns {Promise<APIResponse>}
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
   * shadowBan - Shadow bans a user from a channel
   *
   * @param {string} targetUserId
   * @param {BanUserOptions} options
   * @returns {Promise<APIResponse>}
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
   * removeShadowBan - Removes the shadow ban for a user on a channel
   *
   * @param {string} targetUserId
   * @returns {Promise<APIResponse>}
   */
  async removeShadowBan(targetUserId: string) {
    this._checkInitialized();
    return await this.getClient().removeShadowBan(targetUserId, {
      type: this.type,
      id: this.id,
    });
  }

  /**
   * Cast or cancel one or more votes on a poll
   * @param pollId string The poll id
   * @param votes PollVoteData[] The votes that will be casted (or canceled in case of an empty array)
   * @returns {APIResponse & PollVoteResponse} The poll votes
   */
  async vote(messageId: string, pollId: string, vote: PollVoteData) {
    return await this.getClient().castPollVote(messageId, pollId, vote);
  }

  async removeVote(messageId: string, pollId: string, voteId: string) {
    return await this.getClient().removePollVote(messageId, pollId, voteId);
  }

  /**
   * createDraft - Creates or updates a draft message in a channel
   *
   * @param {DraftMessagePayload} message The draft message to create or update
   *
   * @return {Promise<CreateDraftResponse>} Response containing the created draft
   */
  async _createDraft(message: DraftMessagePayload) {
    return await this.channelApi.createDraft({ message });
  }

  /**
   * createDraft - Creates or updates a draft message in a channel. If offline support is
   * enabled, it will make sure that creating the draft is queued up if it fails due to
   * bad internet conditions and executed later.
   *
   * @param {DraftMessagePayload} message The draft message to create or update
   *
   * @return {Promise<CreateDraftResponse>} Response containing the created draft
   */
  async createDraft(message: DraftMessagePayload) {
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return await offlineDb.queueTask<CreateDraftResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            threadId: message.parent_id,
            payload: [message],
            type: 'create-draft',
          },
        });
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:create-draft`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return this._createDraft(message);
  }

  /**
   * deleteDraft - Deletes a draft message from a channel or a thread.
   *
   * @param {Object} options
   * @param {string} options.parent_id Optional parent message ID for drafts in threads
   *
   * @return {Promise<APIResponse>} API response
   */
  async _deleteDraft({ parent_id }: { parent_id?: string } = {}) {
    return await this.channelApi.deleteDraft({ parent_id });
  }

  /**
   * deleteDraft - Deletes a draft message from a channel or a thread. If offline support is
   * enabled, it will make sure that deleting the draft is queued up if it fails due to
   * bad internet conditions and executed later.
   *
   * @param {Object} options
   * @param {string} options.parent_id Optional parent message ID for drafts in threads
   *
   * @return {Promise<APIResponse>} API response
   */
  async deleteDraft(options: { parent_id?: string } = {}) {
    const { parent_id } = options;
    try {
      const offlineDb = this.getClient().offlineDb;
      if (offlineDb) {
        return await offlineDb.queueTask<APIResponse>({
          task: {
            channelId: this.id as string,
            channelType: this.type,
            threadId: parent_id,
            payload: [options],
            type: 'delete-draft',
          },
        });
      }
    } catch (error) {
      this._client.logger('error', `offlineDb:delete-draft`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return this._deleteDraft(options);
  }

  /**
   * getDraft - Retrieves a draft message from a channel
   *
   * @param {Object} options
   * @param {string} options.parent_id Optional parent message ID for drafts in threads
   *
   * @return {Promise<GetDraftResponse>} Response containing the draft
   */
  async getDraft({ parent_id }: { parent_id?: string } = {}) {
    return await this.channelApi.getDraft({ parent_id });
  }

  /**
   * on - Listen to events on this channel.
   *
   * channel.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
   * or
   * channel.on(event => {console.log(event.type)})
   *
   * @param {EventHandler | EventTypes} callbackOrString  The event type to listen for (optional)
   * @param {EventHandler} [callbackOrNothing] The callback to call
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
   * off - Remove the event handler
   *
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
          event.message = channelState.addReaction(reaction, message) as MessageResponse;
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
          event.message = channelState.addReaction(
            reaction,
            message,
            true,
          ) as MessageResponse;
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
   * _channelURL - Returns the channel url
   *
   * @return {string} The channel url
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
