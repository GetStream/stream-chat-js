import type { ApiClient, StreamResponse } from '../../gen-imports';
import type {
  AddUserGroupMembersRequest,
  AddUserGroupMembersResponse,
  BlockUsersRequest,
  BlockUsersResponse,
  CastPollVoteRequest,
  ChannelGetOrCreateRequest,
  ChannelStateResponse,
  ChannelStopWatchingRequest,
  CreateBlockListRequest,
  CreateBlockListResponse,
  CreateDeviceRequest,
  CreateDraftRequest,
  CreateDraftResponse,
  CreateGuestRequest,
  CreateGuestResponse,
  CreatePollOptionRequest,
  CreatePollRequest,
  CreateReminderRequest,
  CreateUserGroupRequest,
  CreateUserGroupResponse,
  DeleteChannelResponse,
  DeleteChannelsRequest,
  DeleteChannelsResponse,
  DeleteMessageResponse,
  DeleteReactionResponse,
  DeleteReminderResponse,
  EventResponse,
  FileUploadRequest,
  FileUploadResponse,
  GetApplicationResponse,
  GetBlockedUsersResponse,
  GetDraftResponse,
  GetManyMessagesResponse,
  GetMessageResponse,
  GetOGResponse,
  GetReactionsResponse,
  GetRepliesResponse,
  GetThreadResponse,
  GetUserGroupResponse,
  GroupedQueryChannelsRequest,
  GroupedQueryChannelsResponse,
  HideChannelRequest,
  HideChannelResponse,
  ImageUploadRequest,
  ImageUploadResponse,
  ListBlockListResponse,
  ListDevicesResponse,
  ListUserGroupsResponse,
  MarkChannelsReadRequest,
  MarkDeliveredRequest,
  MarkDeliveredResponse,
  MarkReadRequest,
  MarkReadResponse,
  MarkUnreadRequest,
  MembersResponse,
  MessageActionRequest,
  MessageActionResponse,
  MuteChannelRequest,
  MuteChannelResponse,
  PollOptionResponse,
  PollResponse,
  PollVoteResponse,
  PollVotesResponse,
  QueryBannedUsersPayload,
  QueryBannedUsersResponse,
  QueryChannelsRequest,
  QueryChannelsResponse,
  QueryDraftsRequest,
  QueryDraftsResponse,
  QueryFutureChannelBansPayload,
  QueryFutureChannelBansResponse,
  QueryMembersPayload,
  QueryMessageFlagsPayload,
  QueryMessageFlagsResponse,
  QueryPollsRequest,
  QueryPollsResponse,
  QueryPollVotesRequest,
  QueryReactionsRequest,
  QueryReactionsResponse,
  QueryRemindersRequest,
  QueryRemindersResponse,
  QueryThreadsRequest,
  QueryThreadsResponse,
  QueryUsersPayload,
  QueryUsersResponse,
  ReminderResponseData,
  RemoveUserGroupMembersRequest,
  RemoveUserGroupMembersResponse,
  Response,
  SearchPayload,
  SearchResponse,
  SearchUserGroupsResponse,
  SendEventRequest,
  SendMessageRequest,
  SendMessageResponse,
  SendReactionRequest,
  SendReactionResponse,
  SharedLocationResponse,
  SharedLocationsResponse,
  ShowChannelRequest,
  ShowChannelResponse,
  SortParamRequest,
  SyncRequest,
  SyncResponse,
  TranslateMessageRequest,
  TruncateChannelRequest,
  TruncateChannelResponse,
  UnblockUsersRequest,
  UnblockUsersResponse,
  UnmuteChannelRequest,
  UnmuteResponse,
  UpdateBlockListRequest,
  UpdateBlockListResponse,
  UpdateChannelPartialRequest,
  UpdateChannelPartialResponse,
  UpdateChannelRequest,
  UpdateChannelResponse,
  UpdateLiveLocationRequest,
  UpdateMemberPartialRequest,
  UpdateMemberPartialResponse,
  UpdateMessagePartialRequest,
  UpdateMessagePartialResponse,
  UpdateMessageRequest,
  UpdateMessageResponse,
  UpdatePollOptionRequest,
  UpdatePollPartialRequest,
  UpdatePollRequest,
  UpdateReminderRequest,
  UpdateReminderResponse,
  UpdateThreadPartialRequest,
  UpdateThreadPartialResponse,
  UpdateUserGroupRequest,
  UpdateUserGroupResponse,
  UpdateUsersPartialRequest,
  UpdateUsersRequest,
  UpdateUsersResponse,
  UploadChannelFileRequest,
  UploadChannelFileResponse,
  UploadChannelRequest,
  UploadChannelResponse,
  UpsertPushPreferencesRequest,
  UpsertPushPreferencesResponse,
  WrappedUnreadCountsResponse,
  WSAuthMessage,
} from '../models';
import { decoders } from '../model-decoders/decoders';

export class ChatApi {
  constructor(public readonly apiClient: ApiClient) {}

  async getApp(): Promise<StreamResponse<GetApplicationResponse>> {
    const response = await this.apiClient.sendRequest<
      StreamResponse<GetApplicationResponse>
    >('GET', '/api/v2/app', undefined, undefined);

    decoders['GetApplicationResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async listBlockLists(request?: {
    team?: string;
  }): Promise<StreamResponse<ListBlockListResponse>> {
    const queryParams = {
      team: request?.team,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<ListBlockListResponse>
    >('GET', '/api/v2/blocklists', undefined, queryParams);

    decoders['ListBlockListResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createBlockList(
    request: CreateBlockListRequest,
  ): Promise<StreamResponse<CreateBlockListResponse>> {
    const body = {
      name: request?.name,
      words: request?.words,
      is_leet_check_enabled: request?.is_leet_check_enabled,
      is_plural_check_enabled: request?.is_plural_check_enabled,
      team: request?.team,
      type: request?.type,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<CreateBlockListResponse>
    >('POST', '/api/v2/blocklists', undefined, undefined, body, 'application/json');

    decoders['CreateBlockListResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteBlockList(request: {
    name: string;
    team?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      team: request?.team,
    };
    const pathParams = {
      name: request?.name,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/blocklists/{name}',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateBlockList(
    request: UpdateBlockListRequest & { name: string },
  ): Promise<StreamResponse<UpdateBlockListResponse>> {
    const pathParams = {
      name: request?.name,
    };
    const body = {
      is_leet_check_enabled: request?.is_leet_check_enabled,
      is_plural_check_enabled: request?.is_plural_check_enabled,
      team: request?.team,
      words: request?.words,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateBlockListResponse>
    >(
      'PUT',
      '/api/v2/blocklists/{name}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateBlockListResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryChannels(
    request?: QueryChannelsRequest & { connection_id?: string },
  ): Promise<StreamResponse<QueryChannelsResponse>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const body = {
      limit: request?.limit,
      member_limit: request?.member_limit,
      message_limit: request?.message_limit,
      offset: request?.offset,
      predefined_filter: request?.predefined_filter,
      presence: request?.presence,
      state: request?.state,
      watch: request?.watch,
      sort: request?.sort,
      filter_conditions: request?.filter_conditions,
      filter_values: request?.filter_values,
      sort_values: request?.sort_values,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryChannelsResponse>
    >('POST', '/api/v2/chat/channels', undefined, queryParams, body, 'application/json');

    decoders['QueryChannelsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteChannels(
    request: DeleteChannelsRequest,
  ): Promise<StreamResponse<DeleteChannelsResponse>> {
    const body = {
      cids: request?.cids,
      hard_delete: request?.hard_delete,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<DeleteChannelsResponse>
    >(
      'POST',
      '/api/v2/chat/channels/delete',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['DeleteChannelsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async markDelivered(
    request?: MarkDeliveredRequest,
  ): Promise<StreamResponse<MarkDeliveredResponse>> {
    const body = {
      latest_delivered_messages: request?.latest_delivered_messages,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<MarkDeliveredResponse>
    >(
      'POST',
      '/api/v2/chat/channels/delivered',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['MarkDeliveredResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async groupedQueryChannels(
    request?: GroupedQueryChannelsRequest & { connection_id?: string },
  ): Promise<StreamResponse<GroupedQueryChannelsResponse>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const body = {
      limit: request?.limit,
      presence: request?.presence,
      watch: request?.watch,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<GroupedQueryChannelsResponse>
    >(
      'POST',
      '/api/v2/chat/channels/grouped',
      undefined,
      queryParams,
      body,
      'application/json',
    );

    decoders['GroupedQueryChannelsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async markChannelsRead(
    request?: MarkChannelsReadRequest,
  ): Promise<StreamResponse<MarkReadResponse>> {
    const body = {
      read_by_channel: request?.read_by_channel,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<MarkReadResponse>>(
      'POST',
      '/api/v2/chat/channels/read',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['MarkReadResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getOrCreateDistinctChannel(
    request: ChannelGetOrCreateRequest & { type: string; connection_id?: string },
  ): Promise<StreamResponse<ChannelStateResponse>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const pathParams = {
      type: request?.type,
    };
    const body = {
      hide_for_creator: request?.hide_for_creator,
      presence: request?.presence,
      state: request?.state,
      thread_unread_counts: request?.thread_unread_counts,
      watch: request?.watch,
      data: request?.data,
      members: request?.members,
      messages: request?.messages,
      watchers: request?.watchers,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<ChannelStateResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/query',
      pathParams,
      queryParams,
      body,
      'application/json',
    );

    decoders['ChannelStateResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteChannel(request: {
    type: string;
    id: string;
    hard_delete?: boolean;
  }): Promise<StreamResponse<DeleteChannelResponse>> {
    const queryParams = {
      hard_delete: request?.hard_delete,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<DeleteChannelResponse>
    >('DELETE', '/api/v2/chat/channels/{type}/{id}', pathParams, queryParams);

    decoders['DeleteChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateChannelPartial(
    request: UpdateChannelPartialRequest & { type: string; id: string },
  ): Promise<StreamResponse<UpdateChannelPartialResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateChannelPartialResponse>
    >(
      'PATCH',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateChannelPartialResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateChannel(
    request: UpdateChannelRequest & { type: string; id: string },
  ): Promise<StreamResponse<UpdateChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      accept_invite: request?.accept_invite,
      cooldown: request?.cooldown,
      hide_history: request?.hide_history,
      hide_history_before: request?.hide_history_before,
      reject_invite: request?.reject_invite,
      skip_push: request?.skip_push,
      add_filter_tags: request?.add_filter_tags,
      add_members: request?.add_members,
      add_moderators: request?.add_moderators,
      assign_roles: request?.assign_roles,
      demote_moderators: request?.demote_moderators,
      invites: request?.invites,
      remove_filter_tags: request?.remove_filter_tags,
      remove_members: request?.remove_members,
      data: request?.data,
      message: request?.message,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateChannelResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteDraft(request: {
    type: string;
    id: string;
    parent_id?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      parent_id: request?.parent_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getDraft(request: {
    type: string;
    id: string;
    parent_id?: string;
  }): Promise<StreamResponse<GetDraftResponse>> {
    const queryParams = {
      parent_id: request?.parent_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<GetDraftResponse>>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      queryParams,
    );

    decoders['GetDraftResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createDraft(
    request: CreateDraftRequest & { type: string; id: string },
  ): Promise<StreamResponse<CreateDraftResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message: request?.message,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<CreateDraftResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['CreateDraftResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async sendEvent(
    request: SendEventRequest & { type: string; id: string },
  ): Promise<StreamResponse<EventResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      event: request?.event,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<EventResponse>>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/event',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['EventResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteChannelFile(request: {
    type: string;
    id: string;
    url?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/file',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async uploadChannelFile(
    request: UploadChannelFileRequest & { type: string; id: string },
  ): Promise<StreamResponse<UploadChannelFileResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      file: request?.file,
      user: request?.user,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UploadChannelFileResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/file',
      pathParams,
      undefined,
      body,
      'multipart/form-data',
    );

    decoders['UploadChannelFileResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async hideChannel(
    request: HideChannelRequest & { type: string; id: string },
  ): Promise<StreamResponse<HideChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      clear_history: request?.clear_history,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<HideChannelResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/hide',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['HideChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteChannelImage(request: {
    type: string;
    id: string;
    url?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/image',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async uploadChannelImage(
    request: UploadChannelRequest & { type: string; id: string },
  ): Promise<StreamResponse<UploadChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      file: request?.file,
      upload_sizes: request?.upload_sizes,
      user: request?.user,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UploadChannelResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/image',
      pathParams,
      undefined,
      body,
      'multipart/form-data',
    );

    decoders['UploadChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateMemberPartial(
    request: UpdateMemberPartialRequest & { type: string; id: string },
  ): Promise<StreamResponse<UpdateMemberPartialResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateMemberPartialResponse>
    >(
      'PATCH',
      '/api/v2/chat/channels/{type}/{id}/member',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateMemberPartialResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async sendMessage(
    request: SendMessageRequest & { type: string; id: string },
  ): Promise<StreamResponse<SendMessageResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message: request?.message,
      keep_channel_hidden: request?.keep_channel_hidden,
      skip_enrich_url: request?.skip_enrich_url,
      skip_push: request?.skip_push,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<SendMessageResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/message',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['SendMessageResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getManyMessages(request: {
    type: string;
    id: string;
    ids: Array<string>;
  }): Promise<StreamResponse<GetManyMessagesResponse>> {
    const queryParams = {
      ids: request?.ids,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<GetManyMessagesResponse>
    >('GET', '/api/v2/chat/channels/{type}/{id}/messages', pathParams, queryParams);

    decoders['GetManyMessagesResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getOrCreateChannel(
    request: ChannelGetOrCreateRequest & {
      type: string;
      id: string;
      connection_id?: string;
    },
  ): Promise<StreamResponse<ChannelStateResponse>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      hide_for_creator: request?.hide_for_creator,
      presence: request?.presence,
      state: request?.state,
      thread_unread_counts: request?.thread_unread_counts,
      watch: request?.watch,
      data: request?.data,
      members: request?.members,
      messages: request?.messages,
      watchers: request?.watchers,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<ChannelStateResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/query',
      pathParams,
      queryParams,
      body,
      'application/json',
    );

    decoders['ChannelStateResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async markRead(
    request: MarkReadRequest & { type: string; id: string },
  ): Promise<StreamResponse<MarkReadResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message_id: request?.message_id,
      thread_id: request?.thread_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<MarkReadResponse>>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/read',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['MarkReadResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async showChannel(
    request: ShowChannelRequest & { type: string; id: string },
  ): Promise<StreamResponse<ShowChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {};

    const response = await this.apiClient.sendRequest<
      StreamResponse<ShowChannelResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/show',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['ShowChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async stopWatchingChannel(
    request: ChannelStopWatchingRequest & {
      type: string;
      id: string;
      connection_id?: string;
    },
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {};

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/stop-watching',
      pathParams,
      queryParams,
      body,
      'application/json',
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async truncateChannel(
    request: TruncateChannelRequest & { type: string; id: string },
  ): Promise<StreamResponse<TruncateChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      hard_delete: request?.hard_delete,
      skip_push: request?.skip_push,
      truncated_at: request?.truncated_at,
      member_ids: request?.member_ids,
      message: request?.message,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<TruncateChannelResponse>
    >(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/truncate',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['TruncateChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async markUnread(
    request: MarkUnreadRequest & { type: string; id: string },
  ): Promise<StreamResponse<Response>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message_id: request?.message_id,
      message_timestamp: request?.message_timestamp,
      thread_id: request?.thread_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/unread',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryDrafts(
    request?: QueryDraftsRequest,
  ): Promise<StreamResponse<QueryDraftsResponse>> {
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryDraftsResponse>
    >(
      'POST',
      '/api/v2/chat/drafts/query',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['QueryDraftsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryMembers(request?: {
    payload?: QueryMembersPayload;
  }): Promise<StreamResponse<MembersResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<MembersResponse>>(
      'GET',
      '/api/v2/chat/members',
      undefined,
      queryParams,
    );

    decoders['MembersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteMessage(request: {
    id: string;
    hard?: boolean;
    deleted_by?: string;
    delete_for_me?: boolean;
  }): Promise<StreamResponse<DeleteMessageResponse>> {
    const queryParams = {
      hard: request?.hard,
      deleted_by: request?.deleted_by,
      delete_for_me: request?.delete_for_me,
    };
    const pathParams = {
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<DeleteMessageResponse>
    >('DELETE', '/api/v2/chat/messages/{id}', pathParams, queryParams);

    decoders['DeleteMessageResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getMessage(request: { id: string }): Promise<StreamResponse<GetMessageResponse>> {
    const pathParams = {
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<GetMessageResponse>>(
      'GET',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
    );

    decoders['GetMessageResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateMessage(
    request: UpdateMessageRequest & { id: string },
  ): Promise<StreamResponse<UpdateMessageResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      message: request?.message,
      skip_enrich_url: request?.skip_enrich_url,
      skip_push: request?.skip_push,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateMessageResponse>
    >(
      'POST',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateMessageResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateMessagePartial(
    request: UpdateMessagePartialRequest & { id: string },
  ): Promise<StreamResponse<UpdateMessagePartialResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      skip_enrich_url: request?.skip_enrich_url,
      skip_push: request?.skip_push,
      unset: request?.unset,
      set: request?.set,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateMessagePartialResponse>
    >(
      'PUT',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateMessagePartialResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async runMessageAction(
    request: MessageActionRequest & { id: string },
  ): Promise<StreamResponse<MessageActionResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      form_data: request?.form_data,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<MessageActionResponse>
    >(
      'POST',
      '/api/v2/chat/messages/{id}/action',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['MessageActionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async sendReaction(
    request: SendReactionRequest & { id: string },
  ): Promise<StreamResponse<SendReactionResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      reaction: request?.reaction,
      enforce_unique: request?.enforce_unique,
      skip_push: request?.skip_push,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<SendReactionResponse>
    >(
      'POST',
      '/api/v2/chat/messages/{id}/reaction',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['SendReactionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteReaction(request: {
    id: string;
    type: string;
    user_id?: string;
  }): Promise<StreamResponse<DeleteReactionResponse>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      id: request?.id,
      type: request?.type,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<DeleteReactionResponse>
    >('DELETE', '/api/v2/chat/messages/{id}/reaction/{type}', pathParams, queryParams);

    decoders['DeleteReactionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getReactions(request: {
    id: string;
    limit?: number;
    offset?: number;
  }): Promise<StreamResponse<GetReactionsResponse>> {
    const queryParams = {
      limit: request?.limit,
      offset: request?.offset,
    };
    const pathParams = {
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<GetReactionsResponse>
    >('GET', '/api/v2/chat/messages/{id}/reactions', pathParams, queryParams);

    decoders['GetReactionsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryReactions(
    request: QueryReactionsRequest & { id: string },
  ): Promise<StreamResponse<QueryReactionsResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryReactionsResponse>
    >(
      'POST',
      '/api/v2/chat/messages/{id}/reactions',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['QueryReactionsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async translateMessage(
    request: TranslateMessageRequest & { id: string },
  ): Promise<StreamResponse<MessageActionResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      language: request?.language,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<MessageActionResponse>
    >(
      'POST',
      '/api/v2/chat/messages/{id}/translate',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['MessageActionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async castPollVote(
    request: CastPollVoteRequest & { message_id: string; poll_id: string },
  ): Promise<StreamResponse<PollVoteResponse>> {
    const pathParams = {
      message_id: request?.message_id,
      poll_id: request?.poll_id,
    };
    const body = {
      vote: request?.vote,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollVoteResponse>>(
      'POST',
      '/api/v2/chat/messages/{message_id}/polls/{poll_id}/vote',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['PollVoteResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deletePollVote(request: {
    message_id: string;
    poll_id: string;
    vote_id: string;
    user_id?: string;
  }): Promise<StreamResponse<PollVoteResponse>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      message_id: request?.message_id,
      poll_id: request?.poll_id,
      vote_id: request?.vote_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollVoteResponse>>(
      'DELETE',
      '/api/v2/chat/messages/{message_id}/polls/{poll_id}/vote/{vote_id}',
      pathParams,
      queryParams,
    );

    decoders['PollVoteResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteReminder(request: {
    message_id: string;
  }): Promise<StreamResponse<DeleteReminderResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<DeleteReminderResponse>
    >('DELETE', '/api/v2/chat/messages/{message_id}/reminders', pathParams, undefined);

    decoders['DeleteReminderResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateReminder(
    request: UpdateReminderRequest & { message_id: string },
  ): Promise<StreamResponse<UpdateReminderResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };
    const body = {
      remind_at: request?.remind_at,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateReminderResponse>
    >(
      'PATCH',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateReminderResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createReminder(
    request: CreateReminderRequest & { message_id: string },
  ): Promise<StreamResponse<ReminderResponseData>> {
    const pathParams = {
      message_id: request?.message_id,
    };
    const body = {
      remind_at: request?.remind_at,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<ReminderResponseData>
    >(
      'POST',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['ReminderResponseData']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getReplies(request: {
    parent_id: string;
    limit?: number;
    id_gte?: string;
    id_gt?: string;
    id_lte?: string;
    id_lt?: string;
    id_around?: string;
    sort?: Array<SortParamRequest>;
  }): Promise<StreamResponse<GetRepliesResponse>> {
    const queryParams = {
      limit: request?.limit,
      id_gte: request?.id_gte,
      id_gt: request?.id_gt,
      id_lte: request?.id_lte,
      id_lt: request?.id_lt,
      id_around: request?.id_around,
      sort: request?.sort,
    };
    const pathParams = {
      parent_id: request?.parent_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<GetRepliesResponse>>(
      'GET',
      '/api/v2/chat/messages/{parent_id}/replies',
      pathParams,
      queryParams,
    );

    decoders['GetRepliesResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryMessageFlags(request?: {
    payload?: QueryMessageFlagsPayload;
  }): Promise<StreamResponse<QueryMessageFlagsResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryMessageFlagsResponse>
    >('GET', '/api/v2/chat/moderation/flags/message', undefined, queryParams);

    decoders['QueryMessageFlagsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async muteChannel(
    request?: MuteChannelRequest,
  ): Promise<StreamResponse<MuteChannelResponse>> {
    const body = {
      expiration: request?.expiration,
      channel_cids: request?.channel_cids,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<MuteChannelResponse>
    >(
      'POST',
      '/api/v2/chat/moderation/mute/channel',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['MuteChannelResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async unmuteChannel(
    request?: UnmuteChannelRequest,
  ): Promise<StreamResponse<UnmuteResponse>> {
    const body = {
      expiration: request?.expiration,
      channel_cids: request?.channel_cids,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<UnmuteResponse>>(
      'POST',
      '/api/v2/chat/moderation/unmute/channel',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['UnmuteResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryBannedUsers(request?: {
    payload?: QueryBannedUsersPayload;
  }): Promise<StreamResponse<QueryBannedUsersResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryBannedUsersResponse>
    >('GET', '/api/v2/chat/query_banned_users', undefined, queryParams);

    decoders['QueryBannedUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryFutureChannelBans(request?: {
    payload?: QueryFutureChannelBansPayload;
  }): Promise<StreamResponse<QueryFutureChannelBansResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryFutureChannelBansResponse>
    >('GET', '/api/v2/chat/query_future_channel_bans', undefined, queryParams);

    decoders['QueryFutureChannelBansResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryReminders(
    request?: QueryRemindersRequest,
  ): Promise<StreamResponse<QueryRemindersResponse>> {
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryRemindersResponse>
    >(
      'POST',
      '/api/v2/chat/reminders/query',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['QueryRemindersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async search(request?: {
    payload?: SearchPayload;
  }): Promise<StreamResponse<SearchResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<SearchResponse>>(
      'GET',
      '/api/v2/chat/search',
      undefined,
      queryParams,
    );

    decoders['SearchResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async sync(
    request: SyncRequest & {
      with_inaccessible_cids?: boolean;
      watch?: boolean;
      connection_id?: string;
    },
  ): Promise<StreamResponse<SyncResponse>> {
    const queryParams = {
      with_inaccessible_cids: request?.with_inaccessible_cids,
      watch: request?.watch,
      connection_id: request?.connection_id,
    };
    const body = {
      last_sync_at: request?.last_sync_at,
      channel_cids: request?.channel_cids,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<SyncResponse>>(
      'POST',
      '/api/v2/chat/sync',
      undefined,
      queryParams,
      body,
      'application/json',
    );

    decoders['SyncResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryThreads(
    request?: QueryThreadsRequest & { connection_id?: string },
  ): Promise<StreamResponse<QueryThreadsResponse>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const body = {
      limit: request?.limit,
      member_limit: request?.member_limit,
      next: request?.next,
      participant_limit: request?.participant_limit,
      prev: request?.prev,
      reply_limit: request?.reply_limit,
      watch: request?.watch,
      sort: request?.sort,
      filter: request?.filter,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<QueryThreadsResponse>
    >('POST', '/api/v2/chat/threads', undefined, queryParams, body, 'application/json');

    decoders['QueryThreadsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getThread(request: {
    message_id: string;
    watch?: boolean;
    connection_id?: string;
    reply_limit?: number;
    participant_limit?: number;
    member_limit?: number;
  }): Promise<StreamResponse<GetThreadResponse>> {
    const queryParams = {
      watch: request?.watch,
      connection_id: request?.connection_id,
      reply_limit: request?.reply_limit,
      participant_limit: request?.participant_limit,
      member_limit: request?.member_limit,
    };
    const pathParams = {
      message_id: request?.message_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<GetThreadResponse>>(
      'GET',
      '/api/v2/chat/threads/{message_id}',
      pathParams,
      queryParams,
    );

    decoders['GetThreadResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateThreadPartial(
    request: UpdateThreadPartialRequest & { message_id: string },
  ): Promise<StreamResponse<UpdateThreadPartialResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateThreadPartialResponse>
    >(
      'PATCH',
      '/api/v2/chat/threads/{message_id}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['UpdateThreadPartialResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async unreadCounts(): Promise<StreamResponse<WrappedUnreadCountsResponse>> {
    const response = await this.apiClient.sendRequest<
      StreamResponse<WrappedUnreadCountsResponse>
    >('GET', '/api/v2/chat/unread', undefined, undefined);

    decoders['WrappedUnreadCountsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteDevice(request: { id: string }): Promise<StreamResponse<Response>> {
    const queryParams = {
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/devices',
      undefined,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async listDevices(): Promise<StreamResponse<ListDevicesResponse>> {
    const response = await this.apiClient.sendRequest<
      StreamResponse<ListDevicesResponse>
    >('GET', '/api/v2/devices', undefined, undefined);

    decoders['ListDevicesResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createDevice(request: CreateDeviceRequest): Promise<StreamResponse<Response>> {
    const body = {
      id: request?.id,
      push_provider: request?.push_provider,
      push_provider_name: request?.push_provider_name,
      voip_token: request?.voip_token,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'POST',
      '/api/v2/devices',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createGuest(
    request: CreateGuestRequest,
  ): Promise<StreamResponse<CreateGuestResponse>> {
    const body = {
      user: request?.user,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<CreateGuestResponse>
    >('POST', '/api/v2/guest', undefined, undefined, body, 'application/json');

    decoders['CreateGuestResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async longPoll(request?: {
    connection_id?: string;
    json?: WSAuthMessage;
  }): Promise<StreamResponse<{}>> {
    const queryParams = {
      connection_id: request?.connection_id,
      json: request?.json,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<{}>>(
      'GET',
      '/api/v2/longpoll',
      undefined,
      queryParams,
    );

    decoders['{}']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getOG(request: { url: string }): Promise<StreamResponse<GetOGResponse>> {
    const queryParams = {
      url: request?.url,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<GetOGResponse>>(
      'GET',
      '/api/v2/og',
      undefined,
      queryParams,
    );

    decoders['GetOGResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createPoll(request: CreatePollRequest): Promise<StreamResponse<PollResponse>> {
    const body = {
      name: request?.name,
      allow_answers: request?.allow_answers,
      allow_user_suggested_options: request?.allow_user_suggested_options,
      description: request?.description,
      enforce_unique_vote: request?.enforce_unique_vote,
      id: request?.id,
      is_closed: request?.is_closed,
      max_votes_allowed: request?.max_votes_allowed,
      voting_visibility: request?.voting_visibility,
      options: request?.options,
      custom: request?.custom,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollResponse>>(
      'POST',
      '/api/v2/polls',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['PollResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updatePoll(request: UpdatePollRequest): Promise<StreamResponse<PollResponse>> {
    const body = {
      id: request?.id,
      name: request?.name,
      allow_answers: request?.allow_answers,
      allow_user_suggested_options: request?.allow_user_suggested_options,
      description: request?.description,
      enforce_unique_vote: request?.enforce_unique_vote,
      is_closed: request?.is_closed,
      max_votes_allowed: request?.max_votes_allowed,
      voting_visibility: request?.voting_visibility,
      options: request?.options,
      custom: request?.custom,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollResponse>>(
      'PUT',
      '/api/v2/polls',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['PollResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryPolls(
    request?: QueryPollsRequest & { user_id?: string },
  ): Promise<StreamResponse<QueryPollsResponse>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<QueryPollsResponse>>(
      'POST',
      '/api/v2/polls/query',
      undefined,
      queryParams,
      body,
      'application/json',
    );

    decoders['QueryPollsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deletePoll(request: {
    poll_id: string;
    user_id?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      poll_id: request?.poll_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/polls/{poll_id}',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getPoll(request: {
    poll_id: string;
    user_id?: string;
  }): Promise<StreamResponse<PollResponse>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      poll_id: request?.poll_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollResponse>>(
      'GET',
      '/api/v2/polls/{poll_id}',
      pathParams,
      queryParams,
    );

    decoders['PollResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updatePollPartial(
    request: UpdatePollPartialRequest & { poll_id: string },
  ): Promise<StreamResponse<PollResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollResponse>>(
      'PATCH',
      '/api/v2/polls/{poll_id}',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['PollResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createPollOption(
    request: CreatePollOptionRequest & { poll_id: string },
  ): Promise<StreamResponse<PollOptionResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      text: request?.text,
      custom: request?.custom,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollOptionResponse>>(
      'POST',
      '/api/v2/polls/{poll_id}/options',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['PollOptionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updatePollOption(
    request: UpdatePollOptionRequest & { poll_id: string },
  ): Promise<StreamResponse<PollOptionResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      id: request?.id,
      text: request?.text,
      custom: request?.custom,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollOptionResponse>>(
      'PUT',
      '/api/v2/polls/{poll_id}/options',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['PollOptionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deletePollOption(request: {
    poll_id: string;
    option_id: string;
    user_id?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      poll_id: request?.poll_id,
      option_id: request?.option_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/polls/{poll_id}/options/{option_id}',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getPollOption(request: {
    poll_id: string;
    option_id: string;
    user_id?: string;
  }): Promise<StreamResponse<PollOptionResponse>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      poll_id: request?.poll_id,
      option_id: request?.option_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollOptionResponse>>(
      'GET',
      '/api/v2/polls/{poll_id}/options/{option_id}',
      pathParams,
      queryParams,
    );

    decoders['PollOptionResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryPollVotes(
    request: QueryPollVotesRequest & { poll_id: string; user_id?: string },
  ): Promise<StreamResponse<PollVotesResponse>> {
    const queryParams = {
      user_id: request?.user_id,
    };
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<PollVotesResponse>>(
      'POST',
      '/api/v2/polls/{poll_id}/votes',
      pathParams,
      queryParams,
      body,
      'application/json',
    );

    decoders['PollVotesResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updatePushNotificationPreferences(
    request: UpsertPushPreferencesRequest,
  ): Promise<StreamResponse<UpsertPushPreferencesResponse>> {
    const body = {
      preferences: request?.preferences,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpsertPushPreferencesResponse>
    >('POST', '/api/v2/push_preferences', undefined, undefined, body, 'application/json');

    decoders['UpsertPushPreferencesResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteFile(request?: { url?: string }): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/uploads/file',
      undefined,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async uploadFile(
    request?: FileUploadRequest,
  ): Promise<StreamResponse<FileUploadResponse>> {
    const body = {
      file: request?.file,
      user: request?.user,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<FileUploadResponse>>(
      'POST',
      '/api/v2/uploads/file',
      undefined,
      undefined,
      body,
      'multipart/form-data',
    );

    decoders['FileUploadResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteImage(request?: { url?: string }): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/uploads/image',
      undefined,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async uploadImage(
    request?: ImageUploadRequest,
  ): Promise<StreamResponse<ImageUploadResponse>> {
    const body = {
      file: request?.file,
      upload_sizes: request?.upload_sizes,
      user: request?.user,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<ImageUploadResponse>
    >('POST', '/api/v2/uploads/image', undefined, undefined, body, 'multipart/form-data');

    decoders['ImageUploadResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async listUserGroups(request?: {
    limit?: number;
    id_gt?: string;
    created_at_gt?: string;
    team_id?: string;
  }): Promise<StreamResponse<ListUserGroupsResponse>> {
    const queryParams = {
      limit: request?.limit,
      id_gt: request?.id_gt,
      created_at_gt: request?.created_at_gt,
      team_id: request?.team_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<ListUserGroupsResponse>
    >('GET', '/api/v2/usergroups', undefined, queryParams);

    decoders['ListUserGroupsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async createUserGroup(
    request: CreateUserGroupRequest,
  ): Promise<StreamResponse<CreateUserGroupResponse>> {
    const body = {
      name: request?.name,
      description: request?.description,
      id: request?.id,
      team_id: request?.team_id,
      member_ids: request?.member_ids,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<CreateUserGroupResponse>
    >('POST', '/api/v2/usergroups', undefined, undefined, body, 'application/json');

    decoders['CreateUserGroupResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async searchUserGroups(request: {
    query: string;
    limit?: number;
    name_gt?: string;
    id_gt?: string;
    team_id?: string;
  }): Promise<StreamResponse<SearchUserGroupsResponse>> {
    const queryParams = {
      query: request?.query,
      limit: request?.limit,
      name_gt: request?.name_gt,
      id_gt: request?.id_gt,
      team_id: request?.team_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<SearchUserGroupsResponse>
    >('GET', '/api/v2/usergroups/search', undefined, queryParams);

    decoders['SearchUserGroupsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async deleteUserGroup(request: {
    id: string;
    team_id?: string;
  }): Promise<StreamResponse<Response>> {
    const queryParams = {
      team_id: request?.team_id,
    };
    const pathParams = {
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<Response>>(
      'DELETE',
      '/api/v2/usergroups/{id}',
      pathParams,
      queryParams,
    );

    decoders['Response']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getUserGroup(request: {
    id: string;
    team_id?: string;
  }): Promise<StreamResponse<GetUserGroupResponse>> {
    const queryParams = {
      team_id: request?.team_id,
    };
    const pathParams = {
      id: request?.id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<GetUserGroupResponse>
    >('GET', '/api/v2/usergroups/{id}', pathParams, queryParams);

    decoders['GetUserGroupResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateUserGroup(
    request: UpdateUserGroupRequest & { id: string },
  ): Promise<StreamResponse<UpdateUserGroupResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      description: request?.description,
      name: request?.name,
      team_id: request?.team_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateUserGroupResponse>
    >('PUT', '/api/v2/usergroups/{id}', pathParams, undefined, body, 'application/json');

    decoders['UpdateUserGroupResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async addUserGroupMembers(
    request: AddUserGroupMembersRequest & { id: string },
  ): Promise<StreamResponse<AddUserGroupMembersResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      member_ids: request?.member_ids,
      as_admin: request?.as_admin,
      team_id: request?.team_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<AddUserGroupMembersResponse>
    >(
      'POST',
      '/api/v2/usergroups/{id}/members',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['AddUserGroupMembersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async removeUserGroupMembers(
    request: RemoveUserGroupMembersRequest & { id: string },
  ): Promise<StreamResponse<RemoveUserGroupMembersResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      member_ids: request?.member_ids,
      team_id: request?.team_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<RemoveUserGroupMembersResponse>
    >(
      'POST',
      '/api/v2/usergroups/{id}/members/delete',
      pathParams,
      undefined,
      body,
      'application/json',
    );

    decoders['RemoveUserGroupMembersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async queryUsers(request?: {
    payload?: QueryUsersPayload;
  }): Promise<StreamResponse<QueryUsersResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<QueryUsersResponse>>(
      'GET',
      '/api/v2/users',
      undefined,
      queryParams,
    );

    decoders['QueryUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateUsersPartial(
    request: UpdateUsersPartialRequest,
  ): Promise<StreamResponse<UpdateUsersResponse>> {
    const body = {
      users: request?.users,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateUsersResponse>
    >('PATCH', '/api/v2/users', undefined, undefined, body, 'application/json');

    decoders['UpdateUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateUsers(
    request: UpdateUsersRequest,
  ): Promise<StreamResponse<UpdateUsersResponse>> {
    const body = {
      users: request?.users,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UpdateUsersResponse>
    >('POST', '/api/v2/users', undefined, undefined, body, 'application/json');

    decoders['UpdateUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getBlockedUsers(): Promise<StreamResponse<GetBlockedUsersResponse>> {
    const response = await this.apiClient.sendRequest<
      StreamResponse<GetBlockedUsersResponse>
    >('GET', '/api/v2/users/block', undefined, undefined);

    decoders['GetBlockedUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async blockUsers(
    request: BlockUsersRequest,
  ): Promise<StreamResponse<BlockUsersResponse>> {
    const body = {
      blocked_user_id: request?.blocked_user_id,
    };

    const response = await this.apiClient.sendRequest<StreamResponse<BlockUsersResponse>>(
      'POST',
      '/api/v2/users/block',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['BlockUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async getUserLiveLocations(): Promise<StreamResponse<SharedLocationsResponse>> {
    const response = await this.apiClient.sendRequest<
      StreamResponse<SharedLocationsResponse>
    >('GET', '/api/v2/users/live_locations', undefined, undefined);

    decoders['SharedLocationsResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async updateLiveLocation(
    request: UpdateLiveLocationRequest,
  ): Promise<StreamResponse<SharedLocationResponse>> {
    const body = {
      message_id: request?.message_id,
      end_at: request?.end_at,
      latitude: request?.latitude,
      longitude: request?.longitude,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<SharedLocationResponse>
    >(
      'PUT',
      '/api/v2/users/live_locations',
      undefined,
      undefined,
      body,
      'application/json',
    );

    decoders['SharedLocationResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }

  async unblockUsers(
    request: UnblockUsersRequest,
  ): Promise<StreamResponse<UnblockUsersResponse>> {
    const body = {
      blocked_user_id: request?.blocked_user_id,
    };

    const response = await this.apiClient.sendRequest<
      StreamResponse<UnblockUsersResponse>
    >('POST', '/api/v2/users/unblock', undefined, undefined, body, 'application/json');

    decoders['UnblockUsersResponse']?.(response.body);

    return { ...response.body, metadata: response.metadata };
  }
}
