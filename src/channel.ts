import Immutable from 'seamless-immutable';
import { ChannelState } from './channel_state';
import { isValidEventType } from './events';
import { logChatPromiseExecution } from './utils';
import { StreamChat } from './client';
import {
  APIResponse,
  BanUserOptions,
  ChannelAPIResponse,
  ChannelData,
  ChannelMemberAPIResponse,
  ChannelMemberResponse,
  ChannelQueryOptions,
  ChannelResponse,
  DeleteChannelAPIResponse,
  Event,
  EventAPIResponse,
  EventHandler,
  EventTypes,
  GetMultipleMessagesAPIResponse,
  GetReactionsAPIResponse,
  GetRepliesAPIResponse,
  InviteOptions,
  LiteralStringForUnion,
  MarkReadOptions,
  Message,
  MessageFilters,
  MuteChannelAPIResponse,
  PaginationOptions,
  Reaction,
  ReactionAPIResponse,
  SearchAPIResponse,
  SendMessageAPIResponse,
  TruncateChannelAPIResponse,
  UnknownType,
  UpdateChannelAPIResponse,
  UserFilters,
  UserResponse,
  UserSort,
} from './types';

/**
 * Channel - The Channel class manages it's own state.
 */
export class Channel<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> {
  _client: StreamChat<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  type: string;
  id: string | undefined;
  data:
    | ChannelData<ChannelType>
    | ChannelResponse<ChannelType, CommandType, UserType>
    | Immutable.Immutable<ChannelResponse<ChannelType, CommandType, UserType>>
    | undefined;
  _data: ChannelData<ChannelType> | ChannelResponse<ChannelType, CommandType, UserType>;
  cid: string;
  listeners: {
    [key: string]: (
      | string
      | EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >
    )[];
  };
  state: ChannelState<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  initialized: boolean;
  lastKeyStroke?: Date;
  lastTypingEvent: Date | null;
  isTyping: boolean;
  disconnected: boolean;

  /**
   * constructor - Create a channel
   *
   * @param {StreamChat<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>} client the chat client
   * @param {string} type  the type of channel
   * @param {string} [id]  the id of the chat
   * @param {ChannelData<ChannelType>} data any additional custom params
   *
   * @return {Channel<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>} Returns a new uninitialized channel
   */
  constructor(
    client: StreamChat<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
    type: string,
    id: string | undefined,
    data: ChannelData<ChannelType>,
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
    this.state = new ChannelState<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >(this);
    this.initialized = false;
    this.lastTypingEvent = null;
    this.isTyping = false;
    this.disconnected = false;
  }

  /**
   * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
   *
   * @return {StreamChat<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>}
   */
  getClient(): StreamChat<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  > {
    if (this.disconnected === true) {
      throw Error(`You can't use a channel after client.disconnect() was called`);
    }
    return this._client;
  }

  /**
   * getConfig - Get the configs for this channel type
   *
   * @return {Record<string, unknown>}
   */
  getConfig() {
    const client = this.getClient();
    return client.configs[this.type];
  }

  /**
   * sendMessage - Send a message to this channel
   *
   * @param {Message<AttachmentType, MessageType, UserType>} message The Message object
   *
   * @return {Promise<SendMessageAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The Server Response
   */
  async sendMessage(message: Message<AttachmentType, MessageType, UserType>) {
    return await this.getClient().post<
      SendMessageAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL() + '/message', {
      message,
    });
  }

  sendFile(
    uri: string | NodeJS.ReadableStream | File,
    name?: string,
    contentType?: string,
    user?: UserResponse<UserType>,
  ) {
    return this.getClient().sendFile(
      `${this._channelURL()}/file`,
      uri,
      name,
      contentType,
      user,
    );
  }

  sendImage(
    uri: string | NodeJS.ReadableStream | File,
    name?: string,
    contentType?: string,
    user?: UserResponse<UserType>,
  ) {
    return this.getClient().sendFile(
      `${this._channelURL()}/image`,
      uri,
      name,
      contentType,
      user,
    );
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
   * @param {Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>} event for example {type: 'message.read'}
   *
   * @return {Promise<EventAPIResponse<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>>} The Server Response
   */
  async sendEvent(
    event: Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    this._checkInitialized();
    return await this.getClient().post<
      EventAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL() + '/event', {
      event,
    });
  }

  /**
   * search - Query messages
   *
   * @param {MessageFilters<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> | string}  query search query or object MongoDB style filters
   * @param {{client_id?: string; connection_id?: string; limit?: number; offset?: number; query?: string; message_filter_conditions?: MessageFilters<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>}} options Option object, {user_id: 'tommaso'}
   *
   * @return {Promise<SearchAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} search messages response
   */
  async search(
    query:
      | MessageFilters<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >
      | string,
    options: {
      client_id?: string;
      connection_id?: string;
      limit?: number;
      message_filter_conditions?: MessageFilters<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >;
      offset?: number;
      query?: string;
    } = {},
  ) {
    // Return a list of channels
    const payload = {
      filter_conditions: { cid: this.cid },
      ...options,
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

    return await this.getClient().get<
      SearchAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.getClient().baseURL + '/search', {
      payload,
    });
  }

  /**
   * search - Query Members
   *
   * @param {UserFilters<UserType>}  filterConditions object MongoDB style filters
   * @param {UserSort<UserType>} [sort] Sort options, for instance {created_at: -1}
   * @param {{ limit?: number; offset?: number }} [options] Option object, {limit: 10, offset:10}
   *
   * @return {Promise<ChannelMemberAPIResponse<UserType>>} search members response
   */
  async queryMembers(
    filterConditions: UserFilters<UserType>,
    sort: UserSort<UserType> = {},
    options: { limit?: number; offset?: number } = {},
  ) {
    const sortFields = [];
    for (const [k, v] of Object.entries(sort)) {
      sortFields.push({ field: k, direction: v });
    }
    let id: string | undefined;
    const type = this.type;
    let members: string[] | ChannelMemberResponse<UserType>[] | undefined;
    if (this.id) {
      id = this.id;
    } else if (this.data?.members && Array.isArray(this.data.members)) {
      members = this.data.members;
    }
    // Return a list of members
    return await this.getClient().get<ChannelMemberAPIResponse<UserType>>(
      this.getClient().baseURL + '/members',
      {
        payload: {
          type,
          id,
          members,
          sort: sortFields,
          filter_conditions: filterConditions,
          ...options,
        },
      },
    );
  }

  /**
   * sendReaction - Send a reaction about a message
   *
   * @param {string} messageID the message id
   * @param {Reaction<ReactionType, UserType>} reaction the reaction object for instance {type: 'love'}
   * @param {string} [user_id] the id of the user (used only for server side request) default null
   *
   * @return {Promise<ReactionAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The Server Response
   */
  async sendReaction(
    messageID: string,
    reaction: Reaction<ReactionType, UserType>,
    user_id?: string,
  ) {
    if (!messageID) {
      throw Error(`Message id is missing`);
    }
    if (!reaction || Object.keys(reaction).length === 0) {
      throw Error(`Reaction object is missing`);
    }
    const body = {
      reaction,
    };
    if (user_id != null) {
      body.reaction = { ...reaction, user: { id: user_id } as UserResponse<UserType> };
    }
    return await this.getClient().post<
      ReactionAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.getClient().baseURL + `/messages/${messageID}/reaction`, body);
  }

  /**
   * deleteReaction - Delete a reaction by user and type
   *
   * @param {string} messageID the id of the message from which te remove the reaction
   * @param {string} reactionType the type of reaction that should be removed
   * @param {string} [user_id] the id of the user (used only for server side request) default null
   *
   * @return {Promise<ReactionAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The Server Response
   */
  deleteReaction(messageID: string, reactionType: string, user_id?: string) {
    this._checkInitialized();
    if (!reactionType || !messageID) {
      throw Error(
        'Deleting a reaction requires specifying both the message and reaction type',
      );
    }

    const url =
      this.getClient().baseURL + `/messages/${messageID}/reaction/${reactionType}`;
    //provided when server side request
    if (user_id) {
      return this.getClient().delete<
        ReactionAPIResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >
      >(url, { user_id });
    }

    return this.getClient().delete<
      ReactionAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(url, {});
  }

  /**
   * update - Edit the channel's custom properties
   *
   * @param {ChannelData<ChannelType>} channelData The object to update the custom properties of this channel with
   * @param {Message<AttachmentType, MessageType, UserType>} [updateMessage] Optional message object for channel members notification
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async update(
    channelData: ChannelData<ChannelType>,
    updateMessage?: Message<AttachmentType, MessageType, UserType>,
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      message: updateMessage,
      data: channelData,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * enableSlowMode - enable slow mode
   *
   * @param {number} coolDownInterval the cooldown interval in seconds
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async enableSlowMode(coolDownInterval: number) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      cooldown: coolDownInterval,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * disableSlowMode - disable slow mode
   *
   * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
   */
  async disableSlowMode() {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      cooldown: 0,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * delete - Delete the channel. Messages are permanently removed.
   *
   * @return {Promise<DeleteChannelAPIResponse<ChannelType, CommandType, UserType>>} The server response
   */
  async delete() {
    return await this.getClient().delete<
      DeleteChannelAPIResponse<ChannelType, CommandType, UserType>
    >(this._channelURL(), {});
  }

  /**
   * truncate - Removes all messages from the channel
   *
   * @return {Promise<TruncateChannelAPIResponse<ChannelType, CommandType, UserType>>} The server response
   */
  async truncate() {
    return await this.getClient().post<
      TruncateChannelAPIResponse<ChannelType, CommandType, UserType>
    >(this._channelURL() + '/truncate', {});
  }

  /**
   * acceptInvite - accept invitation to the channel
   *
   * @param {InviteOptions<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} [options] The object to update the custom properties of this channel with
   *
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async acceptInvite(
    options: InviteOptions<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    > = {},
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      accept_invite: true,
      ...options,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * rejectInvite - reject invitation to the channel
   *
   * @param {InviteOptions<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} [options] The object to update the custom properties of this channel with
   *
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async rejectInvite(
    options: InviteOptions<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    > = {},
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      reject_invite: true,
      ...options,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * addMembers - add members to the channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<AttachmentType, MessageType, UserType>} [message] Optional message object for channel members notification
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async addMembers(
    members: string[],
    message?: Message<AttachmentType, MessageType, UserType>,
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      add_members: members,
      message,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * addModerators - add moderators to the channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<AttachmentType, MessageType, UserType>} [message] Optional message object for channel members notification
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async addModerators(
    members: string[],
    message?: Message<AttachmentType, MessageType, UserType>,
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      add_moderators: members,
      message,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * inviteMembers - invite members to the channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<AttachmentType, MessageType, UserType>} [message] Optional message object for channel members notification
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async inviteMembers(
    members: string[],
    message?: Message<AttachmentType, MessageType, UserType>,
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      invites: members,
      message,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * removeMembers - remove members from channel
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<AttachmentType, MessageType, UserType>} [message] Optional message object for channel members notification
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async removeMembers(
    members: string[],
    message?: Message<AttachmentType, MessageType, UserType>,
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      remove_members: members,
      message,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * demoteModerators - remove moderator role from channel members
   *
   * @param {string[]} members An array of member identifiers
   * @param {Message<AttachmentType, MessageType, UserType>} [message] Optional message object for channel members notification
   * @return {Promise<UpdateChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async demoteModerators(
    members: string[],
    message?: Message<AttachmentType, MessageType, UserType>,
  ) {
    const data = await this.getClient().post<
      UpdateChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL(), {
      demote_moderators: members,
      message,
    });
    this.data = data.channel;
    return data;
  }

  /**
   * mute - mutes the current channel
   * @param {{ user_id?: string, expiration?: string }} opts expiration in minutes or user_id
   * @return {Promise<MuteChannelAPIResponse<ChannelType, CommandType, UserType>>} The server response
   *
   * example with expiration:
   * await channel.mute({expiration: moment.duration(2, 'weeks')});
   *
   * example server side:
   * await channel.mute({user_id: userId});
   *
   */
  async mute(opts: { expiration?: number; user_id?: string } = {}) {
    return await this.getClient().post<
      MuteChannelAPIResponse<ChannelType, CommandType, UserType>
    >(this.getClient().baseURL + '/moderation/mute/channel', {
      channel_cid: this.cid,
      ...opts,
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
    return await this.getClient().post<APIResponse>(
      this.getClient().baseURL + '/moderation/unmute/channel',
      {
        channel_cid: this.cid,
        ...opts,
      },
    );
  }

  /**
   * muteStatus - returns the mute status for the current channel
   * @return {{ muted: boolean; createdAt?: string | null; expiresAt?: string | null }} { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
   */
  muteStatus(): {
    muted: boolean;
    createdAt?: string | null;
    expiresAt?: string | null;
  } {
    this._checkInitialized();
    return this.getClient()._muteStatus(this.cid);
  }

  sendAction(messageID: string, formData: Record<string, string>) {
    this._checkInitialized();
    if (!messageID) {
      throw Error(`Message id is missing`);
    }
    return this.getClient().post<
      SendMessageAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.getClient().baseURL + `/messages/${messageID}/action`, {
      message_id: messageID,
      form_data: formData,
      id: this.id,
      type: this.type,
    });
  }

  /**
   * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
   *  Call this on every keystroke
   */
  async keystroke() {
    if (!this.getConfig()?.typing_events) {
      return;
    }
    const now = new Date();
    const diff = this.lastTypingEvent && now.getTime() - this.lastTypingEvent?.getTime();
    this.lastKeyStroke = now;
    this.isTyping = true;
    // send a typing.start every 2 seconds
    if (diff && diff > 2000) {
      this.lastTypingEvent = new Date();
      await this.sendEvent({
        type: 'typing.start',
      } as Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>);
    }
  }

  /**
   * stopTyping - Sets last typing to null and sends the typing.stop event
   */
  async stopTyping() {
    if (!this.getConfig()?.typing_events) {
      return;
    }
    this.lastTypingEvent = null;
    this.isTyping = false;
    await this.sendEvent({
      type: 'typing.stop',
    } as Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>);
  }

  /**
   * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
   *
   * @return {Immutable.Immutable<ReturnType<ChannelState<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>> | undefined} Description
   */
  lastMessage() {
    // get last 5 messages, sort, return the latest
    // get a slice of the last 5
    let min = this.state.messages.length - 5;
    if (min < 0) {
      min = 0;
    }
    const max = this.state.messages.length + 1;
    const messageSlice = this.state.messages.slice(min, max).asMutable();

    // sort by pk desc
    messageSlice.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    let lastMessage;
    if (messageSlice.length > 0) {
      lastMessage = messageSlice[0];
    }
    return lastMessage;
  }

  /**
   * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled
   *
   * @param {MarkReadOptions<UserType>} data
   * @return {Promise<EventAPIResponse<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType> | null>} Description
   */
  async markRead(data: MarkReadOptions<UserType> = {}) {
    this._checkInitialized();

    if (!this.getConfig()?.read_events) {
      return Promise.resolve(null);
    }

    return await this.getClient().post<
      EventAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL() + '/read', {
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
   * @param {ChannelQueryOptions<ChannelType, CommandType, UserType>} options additional options for the query endpoint
   *
   * @return {Promise<ChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The server response
   */
  async watch(options?: ChannelQueryOptions<ChannelType, CommandType, UserType>) {
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
    const state = await this.query(combined);
    this.initialized = true;
    this._initializeState(state);
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
    const response = await this.getClient().post<APIResponse>(
      this._channelURL() + '/stop-watching',
      {},
    );

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
   * getReplies - List the message replies for a parent message
   *
   * @param {string} parent_id The message parent id, ie the top of the thread
   * @param {PaginationOptions & { user?: UserResponse<UserType>; user_id?: string }} options Pagination params, ie {limit:10, id_lte: 10}
   *
   * @return {Promise<GetRepliesAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} A response with a list of messages
   */
  async getReplies(
    parent_id: string,
    options: PaginationOptions & { user?: UserResponse<UserType>; user_id?: string },
  ) {
    const data = await this.getClient().get<
      GetRepliesAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.getClient().baseURL + `/messages/${parent_id}/replies`, {
      ...options,
    });

    // add any messages to our thread state
    if (data.messages) {
      this.state.addMessagesSorted(data.messages);
    }

    return data;
  }

  /**
   * getReactions - List the reactions, supports pagination
   *
   * @param {string} message_id The message id
   * @param {{ limit?: number; offset?: number }} options The pagination options
   *
   * @return {Promise<GetReactionsAPIResponse<ReactionType, UserType>>} Server response
   */
  getReactions(message_id: string, options: { limit?: number; offset?: number }) {
    return this.getClient().get<GetReactionsAPIResponse<ReactionType, UserType>>(
      this.getClient().baseURL + `/messages/${message_id}/reactions`,
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
   * @return {Promise<GetMultipleMessagesAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} Server response
   */
  getMessagesById(messageIds: string[]) {
    return this.getClient().get<
      GetMultipleMessagesAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this._channelURL() + '/messages', {
      ids: messageIds.join(','),
    });
  }

  /**
   * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
   * @return {Immutable.ImmutableDate | null | undefined}
   */
  lastRead() {
    this._checkInitialized();
    const { userID } = this.getClient();
    if (userID) {
      return this.state.read[userID] ? this.state.read[userID].last_read : null;
    }
  }

  /**
   * countUnread - Count the number of messages with a date thats newer than the last read timestamp
   *
   * @param {Date | Immutable.ImmutableDate | null} [lastRead] lastRead the time that the user read a message, defaults to current user's read state
   *
   * @return {number} Unread count
   */
  countUnread(lastRead?: Date | Immutable.ImmutableDate | null) {
    if (lastRead == null) {
      lastRead = this.lastRead();
    }
    let count = 0;
    for (const m of this.state.messages.asMutable()) {
      const message = m.asMutable({ deep: true });
      if (this.getClient().userID === message.user?.id) {
        continue;
      }
      if (m.silent) {
        continue;
      }
      if (lastRead == null) {
        count++;
        continue;
      }
      if (m.created_at > lastRead) {
        count++;
      }
    }
    return count;
  }

  /**
   * countUnread - Count the number of unread messages mentioning the current user
   *
   * @return {number} Unread mentions count
   */
  countUnreadMentions() {
    const lastRead = this.lastRead();
    let count = 0;
    for (const m of this.state.messages.asMutable()) {
      const message = m.asMutable({ deep: true });
      if (this.getClient().userID === message.user?.id) {
        continue;
      }
      if (m.silent) {
        continue;
      }
      if (lastRead == null) {
        count++;
        continue;
      }
      if (m.created_at > lastRead) {
        const userID = this.getClient().userID;
        if (m.mentioned_users?.findIndex(u => u.id === userID) !== -1) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * create - Creates a new channel
   *
   * @return {Promise<ChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} The Server Response
   */
  create = async () => {
    const options = {
      watch: false,
      state: false,
      presence: false,
    };
    return await this.query(options);
  };

  /**
   * query - Query the API, get messages, members or other channel fields
   *
   * @param {ChannelQueryOptions<ChannelType, CommandType, UserType>} options The query options
   *
   * @return {Promise<ChannelAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} Returns a query response
   */
  async query(options: ChannelQueryOptions<ChannelType, CommandType, UserType>) {
    // Make sure we wait for the connect promise if there is a pending one
    await this.getClient().wsPromise;

    let queryURL = `${this.getClient().baseURL}/channels/${this.type}`;
    if (this.id) {
      queryURL += `/${this.id}`;
    }

    const state = await this.getClient().post<
      ChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(queryURL + '/query', {
      data: this._data,
      state: true,
      ...options,
    });

    // update the channel id if it was missing
    if (!this.id) {
      this.id = state.channel.id;
      this.cid = state.channel.cid;
      // set the channel as active...
      if (!(this.cid in this.getClient().activeChannels)) {
        this.getClient().activeChannels[this.cid] = this;
      }
    }

    this.getClient()._addChannelConfig(state);

    // add any messages to our channel state
    this._initializeState(state);

    return state;
  }

  /**
   * banUser - Bans a user from a channel
   *
   * @param {string} targetUserID
   * @param {BanUserOptions<UserType>} options
   * @returns {Promise<APIResponse>}
   */
  async banUser(targetUserID: string, options: BanUserOptions<UserType>) {
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
   * on - Listen to events on this channel.
   *
   * channel.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
   * or
   * channel.on(event => {console.log(event.type)})
   *
   * @param {EventHandler<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType> | EventTypes} callbackOrString  The event type to listen for (optional)
   * @param {EventHandler<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>} [callbackOrNothing] The callback to call
   */
  on(
    eventType: EventTypes,
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void;
  on(
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void;
  on(
    callbackOrString:
      | EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >
      | EventTypes,
    callbackOrNothing?: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void {
    const key = callbackOrNothing ? (callbackOrString as string) : 'all';
    const valid = isValidEventType(key);
    if (!valid) {
      throw Error(`Invalid event type ${key}`);
    }
    const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
    if (!(key in this.listeners)) {
      this.listeners[key] = [];
    }
    this._client.logger(
      'info',
      `Attaching listener for ${key} event on channel ${this.cid}`,
      {
        tags: ['event', 'channel'],
        channel: this,
      },
    );

    this.listeners[key].push(callback);
  }

  /**
   * off - Remove the event handler
   *
   */
  off(
    eventType: EventTypes,
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void;
  off(
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void;
  off(
    callbackOrString:
      | EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >
      | EventTypes,
    callbackOrNothing?: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void {
    const key = callbackOrNothing ? (callbackOrString as string) : 'all';
    const valid = isValidEventType(key);
    if (!valid) {
      throw Error(`Invalid event type ${key}`);
    }
    const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
    if (!(key in this.listeners)) {
      this.listeners[key] = [];
    }

    this._client.logger(
      'info',
      `Removing listener for ${key} event from channel ${this.cid}`,
      { tags: ['event', 'channel'], channel: this },
    );
    this.listeners[key] = this.listeners[key].filter(value => value !== callback);
  }

  _handleChannelEvent(
    event: Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    const channel = this;
    this._client.logger(
      'info',
      `channel:_handleChannelEvent - Received event of type { ${event.type} } on ${this.cid}`,
      {
        tags: ['event', 'channel'],
        channel: this,
      },
    );

    const s = channel.state;
    switch (event.type) {
      case 'typing.start':
        if (event.user?.id) {
          s.typing = s.typing.set(event.user.id, Immutable(event));
        }
        break;
      case 'typing.stop':
        if (event.user?.id) {
          s.typing = s.typing.without(event.user.id);
        }
        break;
      case 'message.read':
        if (event.user?.id) {
          s.read = s.read.set(
            event.user.id,
            Immutable({ user: { ...event.user }, last_read: event.received_at }),
          );
        }
        break;
      case 'user.watching.start':
      case 'user.updated':
        if (event.user?.id) {
          s.watchers = s.watchers.set(event.user.id, Immutable(event.user));
        }
        break;
      case 'user.watching.stop':
        if (event.user?.id) {
          s.watchers = s.watchers.without(event.user.id);
        }
        break;
      case 'message.new':
      case 'message.updated':
      case 'message.deleted':
        if (event.message) {
          s.addMessageSorted(event.message);
        }
        break;
      case 'channel.truncated':
        s.clearMessages();
        break;
      case 'member.added':
      case 'member.updated':
        if (event.member?.user_id) {
          s.members = s.members.set(event.member?.user_id, Immutable(event.member));
        }
        break;
      case 'member.removed':
        if (event.user?.id) {
          s.members = s.members.without(event.user.id);
        }
        break;
      case 'channel.updated':
        if (event.channel) {
          channel.data = Immutable(event.channel);
        }
        break;
      case 'reaction.new':
        if (event.reaction) {
          s.addReaction(event.reaction, event.message);
        }
        break;
      case 'reaction.deleted':
        if (event.reaction) {
          s.removeReaction(event.reaction, event.message);
        }
        break;
      case 'channel.hidden':
        if (event.clear_history) {
          s.clearMessages();
        }
        break;
      default:
    }

    // any event can send over the online count
    if (event.watcher_count !== undefined) {
      channel.state.watcher_count = event.watcher_count;
    }
  }

  _callChannelListeners = (
    event: Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) => {
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
    return `${this.getClient().baseURL}/channels/${this.type}/${this.id}`;
  };

  _checkInitialized() {
    if (!this.initialized && !this.getClient()._isUsingServerAuth()) {
      throw Error(
        `Channel ${this.cid} hasn't been initialized yet. Make sure to call .watch() and wait for it to resolve`,
      );
    }
  }

  _initializeState(
    state: ChannelAPIResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    // add the Users
    if (state.members) {
      for (const m of state.members) {
        if (m.user) {
          this.getClient().state.updateUserReference(m.user, this.cid);
        }
      }
    }

    this.state.membership = Immutable(state.membership ? state.membership : {});

    // TODO: CHECK WATCHERS TYPE!!!!!!
    // if (state.watchers) {
    //   for (const watcher of state.watchers) {
    //     if (watcher) {
    //       this.getClient().state.updateUserReference(watcher, this.cid);
    //     }
    //   }
    // }

    // immutable list of maps
    const messages = state.messages || [];
    if (!this.state.messages) {
      this.state.messages = Immutable([]);
    }
    this.state.addMessagesSorted(messages, true);
    this.state.watcher_count = state.watcher_count ? state.watcher_count : 0;
    // convert the arrays into objects for easier syncing...
    if (state.watchers) {
      for (const watcher of state.watchers) {
        if (watcher) {
          this.getClient().state.updateUserReference(watcher, this.cid);
          this.state.watchers = this.state.watchers.set(watcher.id, watcher);
        }
      }
    }

    // initialize read state to last message or current time if the channel is empty
    // if the user is a member, this value will be overwritten later on otherwise this ensures
    // that everything up to this point is not marked as unread
    if (this.getClient().userID != null) {
      const last_read =
        this.state.last_message_at != null ? this.state.last_message_at : new Date();
      const { user } = this.getClient();
      if (user) {
        this.state.read = this.state.read.set(user.id, {
          user: this.getClient().user,
          last_read,
        });
      }
    }

    // apply read state if part of the state
    if (state.read) {
      for (const read of state.read) {
        const parsedRead = Object.assign({ ...read });
        parsedRead.last_read = new Date(read.last_read);
        this.state.read = this.state.read.set(read.user.id, parsedRead);
      }
    }

    if (state.members) {
      for (const m of state.members) {
        if (m.user) {
          this.state.members = this.state.members.set(m.user.id, m);
        }
      }
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
  }
}
