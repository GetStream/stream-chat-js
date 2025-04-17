import { ChannelState } from './channel_state';
import { generateChannelTempCid, logChatPromiseExecution, messageSetPagination, normalizeQuerySort } from './utils';
import { StreamChat } from './client';
import {
  APIResponse,
  BanUserOptions,
  ChannelAPIResponse,
  ChannelData,
  ChannelFilters,
  ChannelMemberAPIResponse,
  ChannelMemberResponse,
  ChannelQueryOptions,
  ChannelResponse,
  ChannelUpdateOptions,
  CreateCallOptions,
  CreateCallResponse,
  DefaultGenerics,
  DeleteChannelAPIResponse,
  Event,
  EventAPIResponse,
  EventHandler,
  EventTypes,
  ExtendableGenerics,
  FormatMessageResponse,
  GetMultipleMessagesAPIResponse,
  GetReactionsAPIResponse,
  GetRepliesAPIResponse,
  InviteOptions,
  MarkReadOptions,
  MarkUnreadOptions,
  MemberFilters,
  MemberSort,
  Message,
  MessageFilters,
  MessagePaginationOptions,
  MessageResponse,
  MessageSetType,
  MuteChannelAPIResponse,
  NewMemberPayload,
  PartialUpdateChannel,
  PartialUpdateChannelAPIResponse,
  PartialUpdateMember,
  PinnedMessagePaginationOptions,
  PinnedMessagesSort,
  QueryMembersOptions,
  Reaction,
  ReactionAPIResponse,
  SearchAPIResponse,
  SearchMessageSortBase,
  SearchOptions,
  SearchPayload,
  SendMessageAPIResponse,
  TruncateChannelAPIResponse,
  TruncateOptions,
  UpdateChannelAPIResponse,
  UserResponse,
  QueryChannelAPIResponse,
  PollVoteData,
  SendMessageOptions,
  AscDesc,
  PartialUpdateMemberAPIResponse,
  AIState,
  MessageOptions,
  PushPreference,
  CreateDraftResponse,
  GetDraftResponse,
  DraftMessagePayload,
} from './types';
import { Role } from './permissions';
import { DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE } from './constants';

/**
 * Channel - The Channel class manages it's own state.
 */
export class Channel<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  _client: StreamChat<StreamChatGenerics>;
  type: string;
  id: string | undefined;
  data: ChannelData<StreamChatGenerics> | ChannelResponse<StreamChatGenerics> | undefined;
  _data: ChannelData<StreamChatGenerics> | ChannelResponse<StreamChatGenerics>;
  cid: string;
  /**  */
  listeners: { [key: string]: (string | EventHandler<StreamChatGenerics>)[] };
  state: ChannelState<StreamChatGenerics>;
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
  push_preferences?: PushPreference;

  /**
   * constructor - Create a channel
   *
   * @param {StreamChat<StreamChatGenerics>} client the chat client
   * @param {string} type  the type of channel
   * @param {string} [id]  the id of the chat
   * @param {ChannelData<StreamChatGenerics>} data any additional custom params
   *
   * @return {Channel<StreamChatGenerics>} Returns a new uninitialized channel
   */
  constructor(
    client: StreamChat<StreamChatGenerics>,
    type: string,
    id: string | undefined,
    data: ChannelData<StreamChatGenerics>,
  ) {
    const validTypeRe = /^[\w_-]+$/;
    const validIDRe = /^[\w!_-]+$/;

    if (!validTypeRe.test(type)) {
      throw new Error(`Invalid chat type ${type}, letters, numbers and "_-" are allowed`);
    }
    if (typeof id === 'string' && !validIDRe.test(id)) {
      throw new Error(`Invalid chat id ${id}, letters, numbers and "!-_" are allowed`);
    }

    this._client = client;
    this.type = type;
    this.id = id;
    // used by the frontend, gets updated:
    this.data = data;
    // this._data is used for the requests...
    this._data = { ...data };
    this.cid = `${type}:${id}`;
    this.listeners = {};
    // perhaps the state variable should be private
    this.state = new ChannelState<StreamChatGenerics>(this);
    this.initialized = false;
    this.offlineMode = false;
    this.lastTypingEvent = null;
    this.isTyping = false;
    this.disconnected = false;
  }

  /**
   * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
   *
   * @return {StreamChat<StreamChatGenerics>}
   */
  getClient(): StreamChat<StreamChatGenerics> {
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
   * @param {Message<StreamChatGenerics>} message The Message object
   * @param {boolean} [options.skip_enrich_url] Do not try to enrich the URLs within message
   * @param {boolean} [options.skip_push] Skip sending push notifications
   * @param {boolean} [options.is_pending_message] DEPRECATED, please use `pending` instead.
   * @param {boolean} [options.pending] Make this message pending
   * @param {Record<string,string>} [options.pending_message_metadata] Metadata for the pending message
   * @param {boolean} [options.force_moderation] Apply force moderation for server-side requests
   *
   * @return {Promise<SendMessageAPIResponse<StreamChatGenerics>>} The Server Response
   */
  async sendMessage(message: Message<StreamChatGenerics>, options?: SendMessageOptions) {
    return await this.getClient().post<SendMessageAPIResponse<StreamChatGenerics>>(this._channelURL() + '/message', {
      message,
      ...options,
    });
  }

  sendFile(
    uri: string | NodeJS.ReadableStream | Buffer | File,
    name?: string,
    contentType?: string,
    user?: UserResponse<StreamChatGenerics>,
  ) {
    return this.getClient().sendFile(`${this._channelURL()}/file`, uri, name, contentType, user);
  }

  sendImage(
    uri: string | NodeJS.ReadableStream | File,
    name?: string,
    contentType?: string,
    user?: UserResponse<StreamChatGenerics>,
  ) {
    return this.getClient().sendFile(`${this._channelURL()}/image`, uri, name, contentType, user);
  }

  deleteFile(url: string) {
    return this.getClient().delete<APIResponse>(`${this._channelURL()}/file`, { url });
  }

  deleteImage(url: string) {
    return this.getClient().delete<APIResponse>(`${this._channelURL()}/image`, { url });
  }

  /**
   * sendEvent - Send an event on this channel
   *
   * @param {Event<StreamChatGenerics>} event for example {type: 'message.read'}
   *
   * @return {Promise<EventAPIResponse<StreamChatGenerics>>} The Server Response
   */
  async sendEvent(event: Event<StreamChatGenerics>) {
    this._checkInitialized();
    return await this.getClient().post<EventAPIResponse<StreamChatGenerics>>(this._channelURL() + '/event', {
      event,
    });
  }

  /**
   * search - Query messages
   *
   * @param {MessageFilters<StreamChatGenerics> | string}  query search query or object MongoDB style filters
   * @param {{client_id?: string; connection_id?: string; query?: string; message_filter_conditions?: MessageFilters<StreamChatGenerics>}} options Option object, {user_id: 'tommaso'}
   *
   * @return {Promise<SearchAPIResponse<StreamChatGenerics>>} search messages response
   */
  async search(
    query: MessageFilters<StreamChatGenerics> | string,
    options: SearchOptions<StreamChatGenerics> & {
      client_id?: string;
      connection_id?: string;
      message_filter_conditions?: MessageFilters<StreamChatGenerics>;
      message_options?: MessageOptions;
      query?: string;
    } = {},
  ) {
    if (options.offset && options.next) {
      throw Error(`Cannot specify offset with next`);
    }
    // Return a list of channels
    const payload: SearchPayload<StreamChatGenerics> = {
      filter_conditions: { cid: this.cid } as ChannelFilters<StreamChatGenerics>,
      ...options,
      sort: options.sort ? normalizeQuerySort<SearchMessageSortBase<StreamChatGenerics>>(options.sort) : undefined,
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

    return await this.getClient().get<SearchAPIResponse<StreamChatGenerics>>(this.getClient().baseURL + '/search', {
      payload,
    });
  }

  /**
   * queryMembers - Query Members
   *
   * @param {MemberFilters<StreamChatGenerics>}  filterConditions object MongoDB style filters
   * @param {MemberSort<StreamChatGenerics>} [sort] Sort options, for instance [{created_at: -1}].
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{name: -1}, {created_at: 1}]
   * @param {{ limit?: number; offset?: number }} [options] Option object, {limit: 10, offset:10}
   *
   * @return {Promise<ChannelMemberAPIResponse<StreamChatGenerics>>} Query Members response
   */
  async queryMembers(
    filterConditions: MemberFilters<StreamChatGenerics>,
    sort: MemberSort<StreamChatGenerics> = [],
    options: QueryMembersOptions = {},
  ) {
    let id: string | undefined;
    const type = this.type;
    let members: string[] | ChannelMemberResponse<StreamChatGenerics>[] | undefined;
    if (this.id) {
      id = this.id;
    } else if (this.data?.members && Array.isArray(this.data.members)) {
      members = this.data.members;
    }
    // Return a list of members
    return await this.getClient().get<ChannelMemberAPIResponse<StreamChatGenerics>>(
      this.getClient().baseURL + '/members',
      {
        payload: {
          type,
          id,
          members,
          sort: normalizeQuerySort(sort),
          filter_conditions: filterConditions,
          ...options,
        },
      },
    );
  }

  /**
   * updateMemberPartial - Partial update a member
   *
   * @param {PartialUpdateMember<StreamChatGenerics>}  updates
   * @param {{ user_id?: string }} [options] Option object, {user_id: 'jane'} to optionally specify the user id

   * @return {Promise<ChannelMemberResponse<StreamChatGenerics>>} Updated member
   */
  async updateMemberPartial(updates: PartialUpdateMember<StreamChatGenerics>, options?: { userId?: string }) {
    const url = new URL(`${this._channelURL()}/member`);

    if (options?.userId) {
      url.searchParams.append('user_id', options.userId);
    }

    return await this.getClient().patch<PartialUpdateMemberAPIResponse<StreamChatGenerics>>(url.toString(), updates);
  }

  /**
   * @deprecated Use `updateMemberPartial` instead
   * partialUpdateMember - Partial update a member
   *
   * @param {string} user_id member user id
   * @param {PartialUpdateMember<StreamChatGenerics>}  updates
   *
   * @return {Promise<ChannelMemberResponse<StreamChatGenerics>>} Updated member
   */
  async partialUpdateMember(user_id: string, updates: PartialUpdateMember<StreamChatGenerics>) {
    if (!user_id) {
      throw Error('Please specify the user id');
    }

    return await this.getClient().patch<PartialUpdateMemberAPIResponse<StreamChatGenerics>>(
      this._channelURL() + `/member/${encodeURIComponent(user_id)}`,
      updates,
    );
  }

  /**
   * sendReaction - Send a reaction about a message
   *
   * @param {string} messageID the message id
   * @param {Reaction<StreamChatGenerics>} reaction the reaction object for instance {type: 'love'}
   * @param {{ enforce_unique?: boolean, skip_push?: boolean }} [options] Option object, {enforce_unique: true, skip_push: true} to override any existing reaction or skip sending push notifications
   *
   * @return {Promise<ReactionAPIResponse<StreamChatGenerics>>} The Server Response
   */
  async sendReaction(
    messageID: string,
    reaction: Reaction<StreamChatGenerics>,
    options?: { enforce_unique?: boolean; skip_push?: boolean },
  ) {
    if (!messageID) {
      throw Error(`Message id is missing`);
    }
    if (!reaction || Object.keys(reaction).length === 0) {
      throw Error(`Reaction object is missing`);
    }
    return await this.getClient().post<ReactionAPIResponse<StreamChatGenerics>>(
      this.getClient().baseURL + `/messages/${encodeURIComponent(messageID)}/reaction`,
      {
        reaction,
        ...options,
      },
    );
  }

  /**
   * deleteReaction - Delete a reaction by user and type
   *
   * @param {string} messageID the id of the message from which te remove the reaction
   * @param {string} reactionType the type of reaction that should be removed
   * @param {string} [user_id] the id of the user (used only for server side request) default null
   *
   * @return {Promise<ReactionAPIResponse<StreamChatGenerics>>} The Server Response
   */
  deleteReaction(messageID: string, reactionType: string, user_id?: string) {
    this._checkInitialized();
    if (!reactionType || !messageID) {
      throw Error('Deleting a reaction requires specifying both the message and reaction type');
    }

    const url =
      this.getClient().baseURL +
      `/messages/${encodeURIComponent(messageID)}/reaction/${encodeURIComponent(reactionType)}`;
    //provided when server side request
    if (user_id) {
      return this.getClient().delete<ReactionAPIResponse<StreamChatGenerics>>(url, { user_id });
    }

    return this.getClient().delete<ReactionAPIResponse<StreamChatGenerics>>(url, {});
  }

  /**
   * update - Edit the channel's custom properties
   *
   * @param {ChannelData<StreamChatGenerics>} channelData The object to update the custom properties of this channel with
   * @param {Message<StreamChatGenerics>} [updateMessage] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async update(
    channelData: Partial<ChannelData<StreamChatGenerics>> | Partial<ChannelResponse<StreamChatGenerics>> = {},
    updateMessage?: Message<StreamChatGenerics>,
    options?: ChannelUpdateOptions,
  ) {
    // Strip out reserved names that will result in API errors.
    const reserved = [
      'config',
      'cid',
      'created_by',
      'id',
      'member_count',
      'type',
      'created_at',
      'updated_at',
      'last_message_at',
      'own_capabilities',
    ];
    reserved.forEach((key) => {
      delete channelData[key];
    });

    return await this._update({
      message: updateMessage,
      data: channelData,
      ...options,
    });
  }

  /**
   * updatePartial - partial update channel properties
   *
   * @param {PartialUpdateChannel<StreamChatGenerics>} partial update request
   *
   * @return {Promise<PartialUpdateChannelAPIResponse<StreamChatGenerics>>}
   */
  async updatePartial(update: PartialUpdateChannel<StreamChatGenerics>) {
    const data = await this.getClient().patch<PartialUpdateChannelAPIResponse<StreamChatGenerics>>(
      this._channelURL(),
      update,
    );

    const areCapabilitiesChanged =
      [...(data.channel.own_capabilities || [])].sort().join() !==
      [...(Array.isArray(this.data?.own_capabilities) ? (this.data?.own_capabilities as string[]) : [])].sort().join();
    this.data = data.channel;
    // If the capabiltities are changed, we trigger the `capabilities.changed` event.
    if (areCapabilitiesChanged) {
      this.getClient().dispatchEvent({
        type: 'capabilities.changed',
        cid: this.cid,
        own_capabilities: data.channel.own_capabilities,
      });
    }
    return data;
  }

  /**
   * enableSlowMode - enable slow mode
   *
   * @param {number} coolDownInterval the cooldown interval in seconds
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async enableSlowMode(coolDownInterval: number) {
    const data = await this.getClient().post<UpdateChannelAPIResponse<StreamChatGenerics>>(this._channelURL(), {
      cooldown: coolDownInterval,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * disableSlowMode - disable slow mode
   *
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async disableSlowMode() {
    const data = await this.getClient().post<UpdateChannelAPIResponse<StreamChatGenerics>>(this._channelURL(), {
      cooldown: 0,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * delete - Delete the channel. Messages are permanently removed.
   *
   * @param {boolean} [options.hard_delete] Defines if the channel is hard deleted or not
   *
   * @return {Promise<DeleteChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async delete(options: { hard_delete?: boolean } = {}) {
    return await this.getClient().delete<DeleteChannelAPIResponse<StreamChatGenerics>>(this._channelURL(), {
      ...options,
    });
  }

  /**
   * truncate - Removes all messages from the channel
   * @param {TruncateOptions<StreamChatGenerics>} [options] Defines truncation options
   * @return {Promise<TruncateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async truncate(options: TruncateOptions<StreamChatGenerics> = {}) {
    return await this.getClient().post<TruncateChannelAPIResponse<StreamChatGenerics>>(
      this._channelURL() + '/truncate',
      options,
    );
  }

  /**
   * acceptInvite - accept invitation to the channel
   *
   * @param {InviteOptions<StreamChatGenerics>} [options] The object to update the custom properties of this channel with
   *
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async acceptInvite(options: InviteOptions<StreamChatGenerics> = {}) {
    return await this._update({ accept_invite: true, ...options });
  }

  /**
   * rejectInvite - reject invitation to the channel
   *
   * @param {InviteOptions<StreamChatGenerics>} [options] The object to update the custom properties of this channel with
   *
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async rejectInvite(options: InviteOptions<StreamChatGenerics> = {}) {
    return await this._update({ reject_invite: true, ...options });
  }

  /**
   * addMembers - add members to the channel
   *
   * @param {string[] | Array<NewMemberPayload<StreamChatGenerics>>} members An array of members to add to the channel
   * @param {Message<StreamChatGenerics>} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async addMembers(
    members: string[] | Array<NewMemberPayload<StreamChatGenerics>>,
    message?: Message<StreamChatGenerics>,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ add_members: members, message, ...options });
  }

  /**
   * addModerators - add moderators to the channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<StreamChatGenerics>} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async addModerators(members: string[], message?: Message<StreamChatGenerics>, options: ChannelUpdateOptions = {}) {
    return await this._update({ add_moderators: members, message, ...options });
  }

  /**
   * assignRoles - sets member roles in a channel
   *
   * @param {{channel_role: Role, user_id: string}[]} roles List of role assignments
   * @param {Message<StreamChatGenerics>} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async assignRoles(
    roles: { channel_role: Role; user_id: string }[],
    message?: Message<StreamChatGenerics>,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ assign_roles: roles, message, ...options });
  }

  /**
   * inviteMembers - invite members to the channel
   *
   * @param {string[] | Array<NewMemberPayload<StreamChatGenerics>>} members An array of members to invite to the channel
   * @param {Message<StreamChatGenerics>} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async inviteMembers(
    members: string[] | Array<NewMemberPayload<StreamChatGenerics>>,
    message?: Message<StreamChatGenerics>,
    options: ChannelUpdateOptions = {},
  ) {
    return await this._update({ invites: members, message, ...options });
  }

  /**
   * removeMembers - remove members from channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<StreamChatGenerics>} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async removeMembers(members: string[], message?: Message<StreamChatGenerics>, options: ChannelUpdateOptions = {}) {
    return await this._update({ remove_members: members, message, ...options });
  }

  /**
   * demoteModerators - remove moderator role from channel members
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<StreamChatGenerics>} [message] Optional message object for channel members notification
   * @param {ChannelUpdateOptions} [options] Option object, configuration to control the behavior while updating
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async demoteModerators(members: string[], message?: Message<StreamChatGenerics>, options: ChannelUpdateOptions = {}) {
    return await this._update({ demote_moderators: members, message, ...options });
  }

  /**
   * _update - executes channel update request
   * @param payload Object Update Channel payload
   * @return {Promise<UpdateChannelAPIResponse<StreamChatGenerics>>} The server response
   * TODO: introduce new type instead of Object in the next major update
   */
  async _update(payload: Object) {
    const data = await this.getClient().post<UpdateChannelAPIResponse<StreamChatGenerics>>(this._channelURL(), payload);
    this.data = data.channel;
    return data;
  }

  /**
   * mute - mutes the current channel
   * @param {{ user_id?: string, expiration?: string }} opts expiration in minutes or user_id
   * @return {Promise<MuteChannelAPIResponse<StreamChatGenerics>>} The server response
   *
   * example with expiration:
   * await channel.mute({expiration: moment.duration(2, 'weeks')});
   *
   * example server side:
   * await channel.mute({user_id: userId});
   *
   */
  async mute(opts: { expiration?: number; user_id?: string } = {}) {
    return await this.getClient().post<MuteChannelAPIResponse<StreamChatGenerics>>(
      this.getClient().baseURL + '/moderation/mute/channel',
      { channel_cid: this.cid, ...opts },
    );
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
    return await this.getClient().post<APIResponse>(this.getClient().baseURL + '/moderation/unmute/channel', {
      channel_cid: this.cid,
      ...opts,
    });
  }

  /**
   * archive - archives the current channel
   * @param {{ user_id?: string }} opts user_id if called server side
   * @return {Promise<ChannelMemberResponse<StreamChatGenerics>>} The server response
   *
   * example:
   * await channel.archives();
   *
   * example server side:
   * await channel.archive({user_id: userId});
   *
   */
  async archive(opts: { user_id?: string } = {}) {
    const cli = this.getClient();
    const uid = opts.user_id || cli.userID;
    if (!uid) {
      throw Error('A user_id is required for archiving a channel');
    }
    const resp = await this.partialUpdateMember(uid, { set: { archived: true } });
    return resp.channel_member;
  }

  /**
   * unarchive - unarchives the current channel
   * @param {{ user_id?: string }} opts user_id if called server side
   * @return {Promise<ChannelMemberResponse<StreamChatGenerics>>} The server response
   *
   * example:
   * await channel.unarchive();
   *
   * example server side:
   * await channel.unarchive({user_id: userId});
   *
   */
  async unarchive(opts: { user_id?: string } = {}) {
    const cli = this.getClient();
    const uid = opts.user_id || cli.userID;
    if (!uid) {
      throw Error('A user_id is required for unarchiving a channel');
    }
    const resp = await this.partialUpdateMember(uid, { set: { archived: false } });
    return resp.channel_member;
  }

  /**
   * pin - pins the current channel
   * @param {{ user_id?: string }} opts user_id if called server side
   * @return {Promise<ChannelMemberResponse<StreamChatGenerics>>} The server response
   *
   * example:
   * await channel.pin();
   *
   * example server side:
   * await channel.pin({user_id: userId});
   *
   */
  async pin(opts: { user_id?: string } = {}) {
    const cli = this.getClient();
    const uid = opts.user_id || cli.userID;
    if (!uid) {
      throw new Error('A user_id is required for pinning a channel');
    }
    const resp = await this.partialUpdateMember(uid, { set: { pinned: true } });
    return resp.channel_member;
  }

  /**
   * unpin - unpins the current channel
   * @param {{ user_id?: string }} opts user_id if called server side
   * @return {Promise<ChannelMemberResponse<StreamChatGenerics>>} The server response
   *
   * example:
   * await channel.unpin();
   *
   * example server side:
   * await channel.unpin({user_id: userId});
   *
   */
  async unpin(opts: { user_id?: string } = {}) {
    const cli = this.getClient();
    const uid = opts.user_id || cli.userID;
    if (!uid) {
      throw new Error('A user_id is required for unpinning a channel');
    }
    const resp = await this.partialUpdateMember(uid, { set: { pinned: false } });
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

  sendAction(messageID: string, formData: Record<string, string>) {
    this._checkInitialized();
    if (!messageID) {
      throw Error(`Message id is missing`);
    }
    return this.getClient().post<SendMessageAPIResponse<StreamChatGenerics>>(
      this.getClient().baseURL + `/messages/${encodeURIComponent(messageID)}/action`,
      {
        message_id: messageID,
        form_data: formData,
        id: this.id,
        type: this.type,
      },
    );
  }

  /**
   * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
   * Call this on every keystroke
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   * @param {string} [parent_id] set this field to `message.id` to indicate that typing event is happening in a thread
   */
  async keystroke(parent_id?: string, options?: { user_id: string }) {
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
        parent_id,
        ...(options || {}),
      } as Event<StreamChatGenerics>);
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
  async updateAIState(messageId: string, state: AIState, options: { ai_message?: string } = {}) {
    await this.sendEvent({
      ...options,
      type: 'ai_indicator.update',
      message_id: messageId,
      ai_state: state,
    } as Event<StreamChatGenerics>);
  }

  /**
   * Sends an event to notify watchers to clear the typing/thinking UI when the AI response starts streaming.
   * Typically used by the server connected to the AI service to inform clients that the AI response has started.
   */
  async clearAIIndicator() {
    await this.sendEvent({
      type: 'ai_indicator.clear',
    } as Event<StreamChatGenerics>);
  }

  /**
   * Sends an event to stop AI response generation, leaving the message in its current state.
   * Triggered by the user to halt the AI response process.
   */
  async stopAIResponse() {
    await this.sendEvent({
      type: 'ai_indicator.stop',
    } as Event<StreamChatGenerics>);
  }

  /**
   * stopTyping - Sets last typing to null and sends the typing.stop event
   * @see {@link https://getstream.io/chat/docs/typing_indicators/?language=js|Docs}
   * @param {string} [parent_id] set this field to `message.id` to indicate that typing event is happening in a thread
   */
  async stopTyping(parent_id?: string, options?: { user_id: string }) {
    if (!this._isTypingIndicatorsEnabled()) {
      return;
    }
    this.lastTypingEvent = null;
    this.isTyping = false;
    await this.sendEvent({
      type: 'typing.stop',
      parent_id,
      ...(options || {}),
    } as Event<StreamChatGenerics>);
  }

  _isTypingIndicatorsEnabled(): boolean {
    if (!this.getConfig()?.typing_events) {
      return false;
    }
    return this.getClient().user?.privacy_settings?.typing_indicators?.enabled ?? true;
  }

  /**
   * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
   *
   * @return {ReturnType<ChannelState<StreamChatGenerics>['formatMessage']> | undefined} Description
   */
  lastMessage(): FormatMessageResponse<StreamChatGenerics> | undefined {
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
   * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled
   *
   * @param {MarkReadOptions<StreamChatGenerics>} data
   * @return {Promise<EventAPIResponse<StreamChatGenerics> | null>} Description
   */
  async markRead(data: MarkReadOptions<StreamChatGenerics> = {}) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events && !this.getClient()._isUsingServerAuth()) {
      return Promise.resolve(null);
    }

    return await this.getClient().post<EventAPIResponse<StreamChatGenerics>>(this._channelURL() + '/read', {
      ...data,
    });
  }

  /**
   * markUnread - Mark the channel as unread from messageID, only works if the `read_events` setting is enabled
   *
   * @param {MarkUnreadOptions<StreamChatGenerics>} data
   * @return {APIResponse} An API response
   */
  async markUnread(data: MarkUnreadOptions<StreamChatGenerics>) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events && !this.getClient()._isUsingServerAuth()) {
      return Promise.resolve(null);
    }

    return await this.getClient().post<APIResponse>(this._channelURL() + '/unread', {
      ...data,
    });
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
   * @param {ChannelQueryOptions<StreamChatGenerics>} options additional options for the query endpoint
   *
   * @return {Promise<QueryChannelAPIResponse<StreamChatGenerics>>} The server response
   */
  async watch(options?: ChannelQueryOptions<StreamChatGenerics>) {
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

    this._client.logger('info', `channel:watch() - started watching channel ${this.cid}`, {
      tags: ['channel'],
      channel: this,
    });
    return state;
  }

  /**
   * stopWatching - Stops watching the channel
   *
   * @return {Promise<APIResponse>} The server response
   */
  async stopWatching() {
    const response = await this.getClient().post<APIResponse>(this._channelURL() + '/stop-watching', {});

    this._client.logger('info', `channel:watch() - stopped watching channel ${this.cid}`, {
      tags: ['channel'],
      channel: this,
    });

    return response;
  }

  /**
   * getReplies - List the message replies for a parent message.
   *
   * The recommended way of working with threads is to use the Thread class.
   *
   * @param {string} parent_id The message parent id, ie the top of the thread
   * @param {MessagePaginationOptions & { user?: UserResponse<StreamChatGenerics>; user_id?: string }} options Pagination params, ie {limit:10, id_lte: 10}
   *
   * @return {Promise<GetRepliesAPIResponse<StreamChatGenerics>>} A response with a list of messages
   */
  async getReplies(
    parent_id: string,
    options: MessagePaginationOptions & { user?: UserResponse<StreamChatGenerics>; user_id?: string },
    sort?: { created_at: AscDesc }[],
  ) {
    const normalizedSort = sort ? normalizeQuerySort(sort) : undefined;
    const data = await this.getClient().get<GetRepliesAPIResponse<StreamChatGenerics>>(
      this.getClient().baseURL + `/messages/${encodeURIComponent(parent_id)}/replies`,
      {
        sort: normalizedSort,
        ...options,
      },
    );

    // add any messages to our thread state
    if (data.messages) {
      this.state.addMessagesSorted(data.messages);
    }

    return data;
  }

  /**
   * getPinnedMessages - List list pinned messages of the channel
   *
   * @param {PinnedMessagePaginationOptions & { user?: UserResponse<StreamChatGenerics>; user_id?: string }} options Pagination params, ie {limit:10, id_lte: 10}
   * @param {PinnedMessagesSort} sort defines sorting direction of pinned messages
   *
   * @return {Promise<GetRepliesAPIResponse<StreamChatGenerics>>} A response with a list of messages
   */
  async getPinnedMessages(
    options: PinnedMessagePaginationOptions & { user?: UserResponse<StreamChatGenerics>; user_id?: string },
    sort: PinnedMessagesSort = [],
  ) {
    return await this.getClient().get<GetRepliesAPIResponse<StreamChatGenerics>>(
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
   * @param {string} message_id The message id
   * @param {{ limit?: number; offset?: number }} options The pagination options
   *
   * @return {Promise<GetReactionsAPIResponse<StreamChatGenerics>>} Server response
   */
  getReactions(message_id: string, options: { limit?: number; offset?: number }) {
    return this.getClient().get<GetReactionsAPIResponse<StreamChatGenerics>>(
      this.getClient().baseURL + `/messages/${encodeURIComponent(message_id)}/reactions`,
      {
        ...options,
      },
    );
  }

  /**
   * getMessagesById - Retrieves a list of messages by ID
   *
   * @param {string[]} messageIds The ids of the messages to retrieve from this channel
   *
   * @return {Promise<GetMultipleMessagesAPIResponse<StreamChatGenerics>>} Server response
   */
  getMessagesById(messageIds: string[]) {
    return this.getClient().get<GetMultipleMessagesAPIResponse<StreamChatGenerics>>(this._channelURL() + '/messages', {
      ids: messageIds.join(','),
    });
  }

  /**
   * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
   * @return {Date | null | undefined}
   */
  lastRead() {
    const { userID } = this.getClient();
    if (userID) {
      return this.state.read[userID] ? this.state.read[userID].last_read : null;
    }
  }

  _countMessageAsUnread(message: FormatMessageResponse<StreamChatGenerics> | MessageResponse<StreamChatGenerics>) {
    if (message.shadowed) return false;
    if (message.silent) return false;
    if (message.parent_id && !message.show_in_channel) return false;
    if (message.user?.id === this.getClient().userID) return false;
    if (message.user?.id && this.getClient().userMuteStatus(message.user.id)) return false;

    // Return false if channel doesn't allow read events.
    if (Array.isArray(this.data?.own_capabilities) && !this.data?.own_capabilities.includes('read-events'))
      return false;

    // FIXME: see #1265, adjust and count new messages even when the channel is muted
    if (this.muteStatus().muted) return false;

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
    const userID = this.getClient().userID;

    let count = 0;
    for (let i = 0; i < this.state.latestMessages.length; i += 1) {
      const message = this.state.latestMessages[i];
      if (
        this._countMessageAsUnread(message) &&
        (!lastRead || message.created_at > lastRead) &&
        message.mentioned_users?.some((user) => user.id === userID)
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * create - Creates a new channel
   *
   * @return {Promise<QueryChannelAPIResponse<StreamChatGenerics>>} The Server Response
   *
   */
  create = async (options?: ChannelQueryOptions<StreamChatGenerics>) => {
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
   * @param {ChannelQueryOptions<StreamChatGenerics>} options The query options
   * @param {MessageSetType} messageSetToAddToIfDoesNotExist It's possible to load disjunct sets of a channel's messages into state, use `current` to load the initial channel state or if you want to extend the currently displayed messages, use `latest` if you want to load/extend the latest messages, `new` is used for loading a specific message and it's surroundings
   *
   * @return {Promise<QueryChannelAPIResponse<StreamChatGenerics>>} Returns a query response
   */
  async query(
    options?: ChannelQueryOptions<StreamChatGenerics>,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'current',
  ) {
    // Make sure we wait for the connect promise if there is a pending one
    await this.getClient().wsPromise;

    let queryURL = `${this.getClient().baseURL}/channels/${encodeURIComponent(this.type)}`;
    if (this.id) {
      queryURL += `/${encodeURIComponent(this.id)}`;
    }

    const state = await this.getClient().post<QueryChannelAPIResponse<StreamChatGenerics>>(queryURL + '/query', {
      data: this._data,
      state: true,
      ...options,
    });

    // update the channel id if it was missing
    if (!this.id) {
      this.id = state.channel.id;
      this.cid = state.channel.cid;
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

      if (!(this.cid in this.getClient().activeChannels) && this.getClient()._cacheEnabled()) {
        this.getClient().activeChannels[this.cid] = this;
      }
    }

    this.getClient()._addChannelConfig(state.channel);

    // add any messages to our channel state
    const { messageSet } = this._initializeState(state, messageSetToAddToIfDoesNotExist);
    messageSet.pagination = {
      ...messageSet.pagination,
      ...messageSetPagination({
        parentSet: messageSet,
        messagePaginationOptions: options?.messages,
        requestedPageSize: options?.messages?.limit ?? DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
        returnedPage: state.messages,
        logger: this.getClient().logger,
      }),
    };

    this.getClient().polls.hydratePollCache(state.messages, true);

    const areCapabilitiesChanged =
      [...(state.channel.own_capabilities || [])].sort().join() !==
      [...(Array.isArray(this.data?.own_capabilities) ? (this.data?.own_capabilities as string[]) : [])].sort().join();
    this.data = state.channel;
    this.offlineMode = false;

    if (areCapabilitiesChanged) {
      this.getClient().dispatchEvent({
        type: 'capabilities.changed',
        cid: this.cid,
        own_capabilities: state.channel.own_capabilities,
      });
    }

    this.getClient().dispatchEvent({
      type: 'channels.queried',
      queriedChannels: {
        channels: [state],
        isLatestMessageSet: messageSet.isLatest,
      },
    });

    return state;
  }

  /**
   * banUser - Bans a user from a channel
   *
   * @param {string} targetUserID
   * @param {BanUserOptions<StreamChatGenerics>} options
   * @returns {Promise<APIResponse>}
   */
  async banUser(targetUserID: string, options: BanUserOptions<StreamChatGenerics>) {
    this._checkInitialized();
    return await this.getClient().banUser(targetUserID, {
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
  async hide(userId: string | null = null, clearHistory = false) {
    this._checkInitialized();

    return await this.getClient().post<APIResponse>(`${this._channelURL()}/hide`, {
      user_id: userId,
      clear_history: clearHistory,
    });
  }

  /**
   * removes the hidden status for a channel
   *
   * @param {string | null} userId
   * @returns {Promise<APIResponse>}
   */
  async show(userId: string | null = null) {
    this._checkInitialized();
    return await this.getClient().post<APIResponse>(`${this._channelURL()}/show`, {
      user_id: userId,
    });
  }

  /**
   * unbanUser - Removes the bans for a user on a channel
   *
   * @param {string} targetUserID
   * @returns {Promise<APIResponse>}
   */
  async unbanUser(targetUserID: string) {
    this._checkInitialized();
    return await this.getClient().unbanUser(targetUserID, {
      type: this.type,
      id: this.id,
    });
  }

  /**
   * shadowBan - Shadow bans a user from a channel
   *
   * @param {string} targetUserID
   * @param {BanUserOptions<StreamChatGenerics>} options
   * @returns {Promise<APIResponse>}
   */
  async shadowBan(targetUserID: string, options: BanUserOptions<StreamChatGenerics>) {
    this._checkInitialized();
    return await this.getClient().shadowBan(targetUserID, {
      ...options,
      type: this.type,
      id: this.id,
    });
  }

  /**
   * removeShadowBan - Removes the shadow ban for a user on a channel
   *
   * @param {string} targetUserID
   * @returns {Promise<APIResponse>}
   */
  async removeShadowBan(targetUserID: string) {
    this._checkInitialized();
    return await this.getClient().removeShadowBan(targetUserID, {
      type: this.type,
      id: this.id,
    });
  }

  /**
   * createCall - creates a call for the current channel
   *
   * @param {CreateCallOptions} options
   * @returns {Promise<CreateCallResponse>}
   */
  async createCall(options: CreateCallOptions) {
    return await this.getClient().post<CreateCallResponse>(this._channelURL() + '/call', options);
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
   * @param {string} channelType The channel type
   * @param {string} channelID The channel ID
   * @param {DraftMessagePayload<StreamChatGenerics>} message The draft message to create or update
   *
   * @return {Promise<CreateDraftResponse<StreamChatGenerics>>} Response containing the created draft
   */
  async createDraft(message: DraftMessagePayload<StreamChatGenerics>) {
    return await this.getClient().post<CreateDraftResponse<StreamChatGenerics>>(this._channelURL() + '/draft', {
      message,
    });
  }

  /**
   * deleteDraft - Deletes a draft message from a channel
   *
   * @param {Object} options
   * @param {string} options.parent_id Optional parent message ID for drafts in threads
   *
   * @return {Promise<APIResponse>} API response
   */
  async deleteDraft({ parent_id }: { parent_id?: string } = {}) {
    return await this.getClient().delete<APIResponse>(this._channelURL() + '/draft', { parent_id });
  }

  /**
   * getDraft - Retrieves a draft message from a channel
   *
   * @param {Object} options
   * @param {string} options.parent_id Optional parent message ID for drafts in threads
   *
   * @return {Promise<GetDraftResponse<StreamChatGenerics>>} Response containing the draft
   */
  async getDraft({ parent_id }: { parent_id?: string } = {}) {
    return await this.getClient().get<GetDraftResponse<StreamChatGenerics>>(this._channelURL() + '/draft', {
      parent_id,
    });
  }

  /**
   * on - Listen to events on this channel.
   *
   * channel.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
   * or
   * channel.on(event => {console.log(event.type)})
   *
   * @param {EventHandler<StreamChatGenerics> | EventTypes} callbackOrString  The event type to listen for (optional)
   * @param {EventHandler<StreamChatGenerics>} [callbackOrNothing] The callback to call
   */
  on(eventType: EventTypes, callback: EventHandler<StreamChatGenerics>): { unsubscribe: () => void };
  on(callback: EventHandler<StreamChatGenerics>): { unsubscribe: () => void };
  on(
    callbackOrString: EventHandler<StreamChatGenerics> | EventTypes,
    callbackOrNothing?: EventHandler<StreamChatGenerics>,
  ): { unsubscribe: () => void } {
    const key = callbackOrNothing ? (callbackOrString as string) : 'all';
    const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
    if (!(key in this.listeners)) {
      this.listeners[key] = [];
    }
    this._client.logger('info', `Attaching listener for ${key} event on channel ${this.cid}`, {
      tags: ['event', 'channel'],
      channel: this,
    });

    this.listeners[key].push(callback);

    return {
      unsubscribe: () => {
        this._client.logger('info', `Removing listener for ${key} event from channel ${this.cid}`, {
          tags: ['event', 'channel'],
          channel: this,
        });

        this.listeners[key] = this.listeners[key].filter((el) => el !== callback);
      },
    };
  }

  /**
   * off - Remove the event handler
   *
   */
  off(eventType: EventTypes, callback: EventHandler<StreamChatGenerics>): void;
  off(callback: EventHandler<StreamChatGenerics>): void;
  off(
    callbackOrString: EventHandler<StreamChatGenerics> | EventTypes,
    callbackOrNothing?: EventHandler<StreamChatGenerics>,
  ): void {
    const key = callbackOrNothing ? (callbackOrString as string) : 'all';
    const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
    if (!(key in this.listeners)) {
      this.listeners[key] = [];
    }

    this._client.logger('info', `Removing listener for ${key} event from channel ${this.cid}`, {
      tags: ['event', 'channel'],
      channel: this,
    });
    this.listeners[key] = this.listeners[key].filter((value) => value !== callback);
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  _handleChannelEvent(event: Event<StreamChatGenerics>) {
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
          channelState.read[event.user.id] = {
            last_read: new Date(event.created_at),
            last_read_message_id: event.last_read_message_id,
            user: event.user,
            unread_messages: 0,
          };

          if (event.user?.id === this.getClient().user?.id) {
            channelState.unreadCount = 0;
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
      case 'message.new':
        if (event.message) {
          /* if message belongs to current user, always assume timestamp is changed to filter it out and add again to avoid duplication */
          const ownMessage = event.user?.id === this.getClient().user?.id;
          const isThreadMessage = event.message.parent_id && !event.message.show_in_channel;

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
          if (preventUnreadCountUpdate) break;

          if (event.user?.id) {
            for (const userId in channelState.read) {
              if (userId === event.user.id) {
                channelState.read[event.user.id] = {
                  last_read: new Date(event.created_at as string),
                  user: event.user,
                  unread_messages: 0,
                };
              } else {
                channelState.read[userId].unread_messages += 1;
              }
            }
          }

          if (this._countMessageAsUnread(event.message)) {
            channelState.unreadCount = channelState.unreadCount + 1;
          }
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
              if (truncatedAt > +createdAt) channelState.removeMessage({ id, messageSetIndex });
            });
          });

          channelState.pinnedMessages.forEach(({ id, created_at: createdAt }) => {
            if (truncatedAt > +createdAt)
              channelState.removePinnedMessage({ id } as MessageResponse<StreamChatGenerics>);
          });
        } else {
          channelState.clearMessages();
        }

        channelState.unreadCount = 0;
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

        const currentUserId = this.getClient().userID;
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
        if (!(ownMessage && event.user)) break;

        const unreadCount = event.unread_messages ?? 0;

        channelState.read[event.user.id] = {
          first_unread_message_id: event.first_unread_message_id,
          last_read: new Date(event.last_read_at as string),
          last_read_message_id: event.last_read_message_id,
          user: event.user,
          unread_messages: unreadCount,
        };

        channelState.unreadCount = unreadCount;
        break;
      }
      case 'channel.updated':
        if (event.channel) {
          const isFrozenChanged = event.channel?.frozen !== undefined && event.channel.frozen !== channel.data?.frozen;
          if (isFrozenChanged) {
            this.query({ state: false, messages: { limit: 0 }, watchers: { limit: 0 } });
          }
          channel.data = {
            ...event.channel,
            hidden: event.channel?.hidden ?? channel.data?.hidden,
            own_capabilities: event.channel?.own_capabilities ?? channel.data?.own_capabilities,
          };
        }
        break;
      case 'reaction.new':
        if (event.message && event.reaction) {
          event.message = channelState.addReaction(event.reaction, event.message);
        }
        break;
      case 'reaction.deleted':
        if (event.reaction) {
          event.message = channelState.removeReaction(event.reaction, event.message);
        }
        break;
      case 'reaction.updated':
        if (event.reaction) {
          // assuming reaction.updated is only called if enforce_unique is true
          event.message = channelState.addReaction(event.reaction, event.message, true);
        }
        break;
      case 'channel.hidden':
        channel.data = { ...channel.data, hidden: true };
        if (event.clear_history) {
          channelState.clearMessages();
        }
        break;
      case 'channel.visible':
        channel.data = { ...channel.data, hidden: false };
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

    // any event can send over the online count
    if (event.watcher_count !== undefined) {
      channel.state.watcher_count = event.watcher_count;
    }
  }

  _callChannelListeners = (event: Event<StreamChatGenerics>) => {
    const channel = this;
    // gather and call the listeners
    const listeners = [];
    if (channel.listeners.all) {
      listeners.push(...channel.listeners.all);
    }
    if (channel.listeners[event.type]) {
      listeners.push(...channel.listeners[event.type]);
    }

    // call the event and send it to the listeners
    for (const listener of listeners) {
      if (typeof listener !== 'string') {
        listener(event);
      }
    }
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
    return `${this.getClient().baseURL}/channels/${encodeURIComponent(this.type)}/${encodeURIComponent(this.id)}`;
  };

  _checkInitialized() {
    if (!this.initialized && !this.offlineMode && !this.getClient()._isUsingServerAuth()) {
      throw Error(
        `Channel ${this.cid} hasn't been initialized yet. Make sure to call .watch() and wait for it to resolve`,
      );
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  _initializeState(
    state: ChannelAPIResponse<StreamChatGenerics>,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'latest',
  ) {
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

    this.state.membership = state.membership || {};

    const messages = state.messages || [];
    if (!this.state.messages) {
      this.state.initMessages();
    }
    const { messageSet } = this.state.addMessagesSorted(messages, false, true, true, messageSetToAddToIfDoesNotExist);

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
    if (userID != null) {
      const last_read = this.state.last_message_at || new Date();
      if (user) {
        this.state.read[user.id] = {
          user,
          last_read,
          unread_messages: 0,
        };
      }
    }

    // apply read state if part of the state
    if (state.read) {
      for (const read of state.read) {
        this.state.read[read.user.id] = {
          last_read: new Date(read.last_read),
          last_read_message_id: read.last_read_message_id,
          unread_messages: read.unread_messages ?? 0,
          user: read.user,
        };

        if (read.user.id === user?.id) {
          this.state.unreadCount = this.state.read[read.user.id].unread_messages;
        }
      }
    }

    return {
      messageSet,
    };
  }

  _extendEventWithOwnReactions(event: Event<StreamChatGenerics>) {
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
    members: ChannelMemberResponse<StreamChatGenerics>[];
    /**
     * If set to `true` then `ChannelState.members` will be overriden with the newly
     * provided `members`, setting this property to `false` will merge current `ChannelState.members`
     * object with the newly provided `members`
     * (new members with the same `userId` will replace the old ones).
     */
    overrideCurrentState?: boolean;
  }) {
    const newMembersById = members.reduce<ChannelState<StreamChatGenerics>['members']>((membersById, member) => {
      if (member.user) {
        membersById[member.user.id] = member;
      }
      return membersById;
    }, {});

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
    this._client.logger('info', `channel:disconnect() - Disconnecting the channel ${this.cid}`, {
      tags: ['connection', 'channel'],
      channel: this,
    });

    this.disconnected = true;
    this.state.setIsUpToDate(false);
  }
}
