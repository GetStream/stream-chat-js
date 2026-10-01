import type { ApiClient, StreamRequestOptions, StreamResponse } from '../../gen-imports';
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
  CreateReminderResponse,
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
  GetPinnedMessagesResponse,
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
  ImportBlockListRequest,
  ImportBlockListResponse,
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
  RemoveUserGroupMembersRequest,
  RemoveUserGroupMembersResponse,
  Response,
  SearchPayload,
  SearchResponse,
  SearchRolesResponse,
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
  TranslateMessageResponse,
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

export class ChatApi {
  constructor(public readonly apiClient: ApiClient) {}

  getApp(
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetApplicationResponse>> {
    return this.apiClient.sendRequest<GetApplicationResponse>(
      'GET',
      '/api/v2/app',
      undefined,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  listBlockLists(
    request?: { team?: string; cursor?: string; limit?: number },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ListBlockListResponse>> {
    const queryParams = {
      team: request?.team,
      cursor: request?.cursor,
      limit: request?.limit,
    };

    return this.apiClient.sendRequest<ListBlockListResponse>(
      'GET',
      '/api/v2/blocklists',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createBlockList(
    request: CreateBlockListRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateBlockListResponse>> {
    const body = {
      name: request?.name,
      words: request?.words,
      is_confusable_folding_enabled: request?.is_confusable_folding_enabled,
      is_leet_check_enabled: request?.is_leet_check_enabled,
      is_plural_check_enabled: request?.is_plural_check_enabled,
      is_substring_matching_enabled: request?.is_substring_matching_enabled,
      team: request?.team,
      type: request?.type,
    };

    return this.apiClient.sendRequest<CreateBlockListResponse>(
      'POST',
      '/api/v2/blocklists',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  importBlockList(
    request: ImportBlockListRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ImportBlockListResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      items: request?.items,
      chunk_size: request?.chunk_size,
    };

    return this.apiClient.sendRequest<ImportBlockListResponse>(
      'POST',
      '/api/v2/blocklists/{id}/import',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteBlockList(
    request: { name: string; team?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      team: request?.team,
    };
    const pathParams = {
      name: request?.name,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/blocklists/{name}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateBlockList(
    request: UpdateBlockListRequest & { name: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateBlockListResponse>> {
    const pathParams = {
      name: request?.name,
    };
    const body = {
      is_confusable_folding_enabled: request?.is_confusable_folding_enabled,
      is_leet_check_enabled: request?.is_leet_check_enabled,
      is_plural_check_enabled: request?.is_plural_check_enabled,
      is_substring_matching_enabled: request?.is_substring_matching_enabled,
      team: request?.team,
      words: request?.words,
    };

    return this.apiClient.sendRequest<UpdateBlockListResponse>(
      'PUT',
      '/api/v2/blocklists/{name}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryChannels(
    request?: QueryChannelsRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
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
      member_custom_include: request?.member_custom_include,
      sort: request?.sort,
      filter_conditions: request?.filter_conditions,
      filter_values: request?.filter_values,
      sort_values: request?.sort_values,
    };

    return this.apiClient.sendRequest<QueryChannelsResponse>(
      'POST',
      '/api/v2/chat/channels',
      undefined,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteChannels(
    request: DeleteChannelsRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteChannelsResponse>> {
    const body = {
      cids: request?.cids,
      hard_delete: request?.hard_delete,
    };

    return this.apiClient.sendRequest<DeleteChannelsResponse>(
      'POST',
      '/api/v2/chat/channels/delete',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  markDelivered(
    request?: MarkDeliveredRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MarkDeliveredResponse>> {
    const body = {
      latest_delivered_messages: request?.latest_delivered_messages,
    };

    return this.apiClient.sendRequest<MarkDeliveredResponse>(
      'POST',
      '/api/v2/chat/channels/delivered',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  groupedQueryChannels(
    request?: GroupedQueryChannelsRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GroupedQueryChannelsResponse>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const body = {
      limit: request?.limit,
      presence: request?.presence,
      watch: request?.watch,
      groups: request?.groups,
    };

    return this.apiClient.sendRequest<GroupedQueryChannelsResponse>(
      'POST',
      '/api/v2/chat/channels/grouped',
      undefined,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  markChannelsRead(
    request?: MarkChannelsReadRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MarkReadResponse>> {
    const body = {
      read_by_channel: request?.read_by_channel,
    };

    return this.apiClient.sendRequest<MarkReadResponse>(
      'POST',
      '/api/v2/chat/channels/read',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  getOrCreateDistinctChannel(
    request: ChannelGetOrCreateRequest & { type: string; connection_id?: string },
    requestOptions?: StreamRequestOptions,
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
      member_custom_include: request?.member_custom_include,
      data: request?.data,
      members: request?.members,
      messages: request?.messages,
      watchers: request?.watchers,
    };

    return this.apiClient.sendRequest<ChannelStateResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/query',
      pathParams,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteChannel(
    request: { type: string; id: string; hard_delete?: boolean },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteChannelResponse>> {
    const queryParams = {
      hard_delete: request?.hard_delete,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<DeleteChannelResponse>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getChannel(
    request: {
      type: string;
      id: string;
      state?: boolean;
      messages_limit?: number;
      members_limit?: number;
      watchers_limit?: number;
      messages_id_lt?: string;
      messages_id_lte?: string;
      messages_id_gt?: string;
      messages_id_gte?: string;
      messages_id_around?: string;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ChannelStateResponse>> {
    const queryParams = {
      state: request?.state,
      messages_limit: request?.messages_limit,
      members_limit: request?.members_limit,
      watchers_limit: request?.watchers_limit,
      messages_id_lt: request?.messages_id_lt,
      messages_id_lte: request?.messages_id_lte,
      messages_id_gt: request?.messages_id_gt,
      messages_id_gte: request?.messages_id_gte,
      messages_id_around: request?.messages_id_around,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<ChannelStateResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateChannelPartial(
    request: UpdateChannelPartialRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateChannelPartialResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    return this.apiClient.sendRequest<UpdateChannelPartialResponse>(
      'PATCH',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  updateChannel(
    request: UpdateChannelRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
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
      invites: request?.invites,
      remove_filter_tags: request?.remove_filter_tags,
      remove_members: request?.remove_members,
      data: request?.data,
      message: request?.message,
    };

    return this.apiClient.sendRequest<UpdateChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteDraft(
    request: { type: string; id: string; parent_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      parent_id: request?.parent_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getDraft(
    request: { type: string; id: string; parent_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetDraftResponse>> {
    const queryParams = {
      parent_id: request?.parent_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<GetDraftResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createDraft(
    request: CreateDraftRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateDraftResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message: request?.message,
    };

    return this.apiClient.sendRequest<CreateDraftResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  sendEvent(
    request: SendEventRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<EventResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      event: request?.event,
    };

    return this.apiClient.sendRequest<EventResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/event',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteChannelFile(
    request: { type: string; id: string; url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/file',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadChannelFile(
    request: UploadChannelFileRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UploadChannelFileResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      file: request?.file,
      user: request?.user,
    };

    return this.apiClient.sendRequest<UploadChannelFileResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/file',
      pathParams,
      undefined,
      body,
      'multipart/form-data',
      requestOptions,
    );
  }

  hideChannel(
    request: HideChannelRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<HideChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      clear_history: request?.clear_history,
    };

    return this.apiClient.sendRequest<HideChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/hide',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteChannelImage(
    request: { type: string; id: string; url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/image',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadChannelImage(
    request: UploadChannelRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<UploadChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/image',
      pathParams,
      undefined,
      body,
      'multipart/form-data',
      requestOptions,
    );
  }

  updateMemberPartial(
    request: UpdateMemberPartialRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateMemberPartialResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    return this.apiClient.sendRequest<UpdateMemberPartialResponse>(
      'PATCH',
      '/api/v2/chat/channels/{type}/{id}/member',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  sendMessage(
    request: SendMessageRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SendMessageResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message: request?.message,
      include_channel_context: request?.include_channel_context,
      include_mentioned_members: request?.include_mentioned_members,
      keep_channel_hidden: request?.keep_channel_hidden,
      skip_enrich_url: request?.skip_enrich_url,
      skip_push: request?.skip_push,
    };

    return this.apiClient.sendRequest<SendMessageResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/message',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  getManyMessages(
    request: {
      type: string;
      id: string;
      ids: Array<string>;
      member_custom_include?: Array<string>;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetManyMessagesResponse>> {
    const queryParams = {
      ids: request?.ids,
      member_custom_include: request?.member_custom_include,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<GetManyMessagesResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/messages',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getPinnedMessages(
    request: {
      type: string;
      id: string;
      limit?: number;
      offset?: number;
      id_gte?: string;
      id_gt?: string;
      id_lte?: string;
      id_lt?: string;
      pinned_at_after_or_equal?: Date;
      pinned_at_after?: Date;
      pinned_at_before_or_equal?: Date;
      pinned_at_before?: Date;
      id_around?: string;
      pinned_at_around?: Date;
      sort?: Array<SortParamRequest>;
      member_custom_include?: Array<string>;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetPinnedMessagesResponse>> {
    const queryParams = {
      limit: request?.limit,
      offset: request?.offset,
      id_gte: request?.id_gte,
      id_gt: request?.id_gt,
      id_lte: request?.id_lte,
      id_lt: request?.id_lt,
      pinned_at_after_or_equal: request?.pinned_at_after_or_equal,
      pinned_at_after: request?.pinned_at_after,
      pinned_at_before_or_equal: request?.pinned_at_before_or_equal,
      pinned_at_before: request?.pinned_at_before,
      id_around: request?.id_around,
      pinned_at_around: request?.pinned_at_around,
      sort: request?.sort,
      member_custom_include: request?.member_custom_include,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };

    return this.apiClient.sendRequest<GetPinnedMessagesResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/pinned_messages',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getOrCreateChannel(
    request: ChannelGetOrCreateRequest & {
      type: string;
      id: string;
      connection_id?: string;
    },
    requestOptions?: StreamRequestOptions,
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
      member_custom_include: request?.member_custom_include,
      data: request?.data,
      members: request?.members,
      messages: request?.messages,
      watchers: request?.watchers,
    };

    return this.apiClient.sendRequest<ChannelStateResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/query',
      pathParams,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  markRead(
    request: MarkReadRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MarkReadResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {
      message_id: request?.message_id,
      thread_id: request?.thread_id,
    };

    return this.apiClient.sendRequest<MarkReadResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/read',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  showChannel(
    request: ShowChannelRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ShowChannelResponse>> {
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {};

    return this.apiClient.sendRequest<ShowChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/show',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  stopWatchingChannel(
    request: ChannelStopWatchingRequest & {
      type: string;
      id: string;
      connection_id?: string;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      connection_id: request?.connection_id,
    };
    const pathParams = {
      type: request?.type,
      id: request?.id,
    };
    const body = {};

    return this.apiClient.sendRequest<Response>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/stop-watching',
      pathParams,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  truncateChannel(
    request: TruncateChannelRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<TruncateChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/truncate',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  markUnread(
    request: MarkUnreadRequest & { type: string; id: string },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<Response>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/unread',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryDrafts(
    request?: QueryDraftsRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryDraftsResponse>> {
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    return this.apiClient.sendRequest<QueryDraftsResponse>(
      'POST',
      '/api/v2/chat/drafts/query',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryMembers(
    request?: { payload?: QueryMembersPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MembersResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    return this.apiClient.sendRequest<MembersResponse>(
      'GET',
      '/api/v2/chat/members',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteMessage(
    request: { id: string; hard?: boolean; delete_for_me?: boolean },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteMessageResponse>> {
    const queryParams = {
      hard: request?.hard,
      delete_for_me: request?.delete_for_me,
    };
    const pathParams = {
      id: request?.id,
    };

    return this.apiClient.sendRequest<DeleteMessageResponse>(
      'DELETE',
      '/api/v2/chat/messages/{id}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getMessage(
    request: { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetMessageResponse>> {
    const pathParams = {
      id: request?.id,
    };

    return this.apiClient.sendRequest<GetMessageResponse>(
      'GET',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateMessage(
    request: UpdateMessageRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateMessageResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      message: request?.message,
      skip_enrich_url: request?.skip_enrich_url,
      skip_push: request?.skip_push,
    };

    return this.apiClient.sendRequest<UpdateMessageResponse>(
      'POST',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  updateMessagePartial(
    request: UpdateMessagePartialRequest & { id: string },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<UpdateMessagePartialResponse>(
      'PUT',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  runMessageAction(
    request: MessageActionRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MessageActionResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      form_data: request?.form_data,
    };

    return this.apiClient.sendRequest<MessageActionResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/action',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  sendReaction(
    request: SendReactionRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SendReactionResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      reaction: request?.reaction,
      enforce_unique: request?.enforce_unique,
      skip_push: request?.skip_push,
    };

    return this.apiClient.sendRequest<SendReactionResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/reaction',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deleteReaction(
    request: { id: string; type: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteReactionResponse>> {
    const pathParams = {
      id: request?.id,
      type: request?.type,
    };

    return this.apiClient.sendRequest<DeleteReactionResponse>(
      'DELETE',
      '/api/v2/chat/messages/{id}/reaction/{type}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getReactions(
    request: { id: string; limit?: number; offset?: number },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetReactionsResponse>> {
    const queryParams = {
      limit: request?.limit,
      offset: request?.offset,
    };
    const pathParams = {
      id: request?.id,
    };

    return this.apiClient.sendRequest<GetReactionsResponse>(
      'GET',
      '/api/v2/chat/messages/{id}/reactions',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryReactions(
    request: QueryReactionsRequest & { id: string },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<QueryReactionsResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/reactions',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  translateMessage(
    request: TranslateMessageRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<TranslateMessageResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      language: request?.language,
    };

    return this.apiClient.sendRequest<TranslateMessageResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/translate',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  castPollVote(
    request: CastPollVoteRequest & { message_id: string; poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollVoteResponse>> {
    const pathParams = {
      message_id: request?.message_id,
      poll_id: request?.poll_id,
    };
    const body = {
      vote: request?.vote,
    };

    return this.apiClient.sendRequest<PollVoteResponse>(
      'POST',
      '/api/v2/chat/messages/{message_id}/polls/{poll_id}/vote',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deletePollVote(
    request: { message_id: string; poll_id: string; vote_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollVoteResponse>> {
    const pathParams = {
      message_id: request?.message_id,
      poll_id: request?.poll_id,
      vote_id: request?.vote_id,
    };

    return this.apiClient.sendRequest<PollVoteResponse>(
      'DELETE',
      '/api/v2/chat/messages/{message_id}/polls/{poll_id}/vote/{vote_id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteReminder(
    request: { message_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteReminderResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };

    return this.apiClient.sendRequest<DeleteReminderResponse>(
      'DELETE',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateReminder(
    request: UpdateReminderRequest & { message_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateReminderResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };
    const body = {
      expires_at: request?.expires_at,
      remind_at: request?.remind_at,
    };

    return this.apiClient.sendRequest<UpdateReminderResponse>(
      'PATCH',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  createReminder(
    request: CreateReminderRequest & { message_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateReminderResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };
    const body = {
      expires_at: request?.expires_at,
      remind_at: request?.remind_at,
    };

    return this.apiClient.sendRequest<CreateReminderResponse>(
      'POST',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  getReplies(
    request: {
      parent_id: string;
      limit?: number;
      id_gte?: string;
      id_gt?: string;
      id_lte?: string;
      id_lt?: string;
      id_around?: string;
      sort?: Array<SortParamRequest>;
      member_custom_include?: Array<string>;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetRepliesResponse>> {
    const queryParams = {
      limit: request?.limit,
      id_gte: request?.id_gte,
      id_gt: request?.id_gt,
      id_lte: request?.id_lte,
      id_lt: request?.id_lt,
      id_around: request?.id_around,
      sort: request?.sort,
      member_custom_include: request?.member_custom_include,
    };
    const pathParams = {
      parent_id: request?.parent_id,
    };

    return this.apiClient.sendRequest<GetRepliesResponse>(
      'GET',
      '/api/v2/chat/messages/{parent_id}/replies',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryMessageFlags(
    request?: { payload?: QueryMessageFlagsPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryMessageFlagsResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    return this.apiClient.sendRequest<QueryMessageFlagsResponse>(
      'GET',
      '/api/v2/chat/moderation/flags/message',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  muteChannel(
    request?: MuteChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MuteChannelResponse>> {
    const body = {
      expiration: request?.expiration,
      channel_cids: request?.channel_cids,
    };

    return this.apiClient.sendRequest<MuteChannelResponse>(
      'POST',
      '/api/v2/chat/moderation/mute/channel',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  unmuteChannel(
    request?: UnmuteChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UnmuteResponse>> {
    const body = {
      expiration: request?.expiration,
      channel_cids: request?.channel_cids,
    };

    return this.apiClient.sendRequest<UnmuteResponse>(
      'POST',
      '/api/v2/chat/moderation/unmute/channel',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryBannedUsers(
    request?: { payload?: QueryBannedUsersPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryBannedUsersResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    return this.apiClient.sendRequest<QueryBannedUsersResponse>(
      'GET',
      '/api/v2/chat/query_banned_users',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryFutureChannelBans(
    request?: { payload?: QueryFutureChannelBansPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryFutureChannelBansResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    return this.apiClient.sendRequest<QueryFutureChannelBansResponse>(
      'GET',
      '/api/v2/chat/query_future_channel_bans',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryReminders(
    request?: QueryRemindersRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryRemindersResponse>> {
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    return this.apiClient.sendRequest<QueryRemindersResponse>(
      'POST',
      '/api/v2/chat/reminders/query',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  search(
    request?: { payload?: SearchPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SearchResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    return this.apiClient.sendRequest<SearchResponse>(
      'GET',
      '/api/v2/chat/search',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  sync(
    request: SyncRequest & {
      with_inaccessible_cids?: boolean;
      watch?: boolean;
      connection_id?: string;
    },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<SyncResponse>(
      'POST',
      '/api/v2/chat/sync',
      undefined,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryThreads(
    request?: QueryThreadsRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
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

    return this.apiClient.sendRequest<QueryThreadsResponse>(
      'POST',
      '/api/v2/chat/threads',
      undefined,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  getThread(
    request: {
      message_id: string;
      watch?: boolean;
      connection_id?: string;
      reply_limit?: number;
      participant_limit?: number;
      member_limit?: number;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetThreadResponse>> {
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

    return this.apiClient.sendRequest<GetThreadResponse>(
      'GET',
      '/api/v2/chat/threads/{message_id}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateThreadPartial(
    request: UpdateThreadPartialRequest & { message_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateThreadPartialResponse>> {
    const pathParams = {
      message_id: request?.message_id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    return this.apiClient.sendRequest<UpdateThreadPartialResponse>(
      'PATCH',
      '/api/v2/chat/threads/{message_id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  unreadCounts(
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<WrappedUnreadCountsResponse>> {
    return this.apiClient.sendRequest<WrappedUnreadCountsResponse>(
      'GET',
      '/api/v2/chat/unread',
      undefined,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteDevice(
    request: { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      id: request?.id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/devices',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  listDevices(
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ListDevicesResponse>> {
    return this.apiClient.sendRequest<ListDevicesResponse>(
      'GET',
      '/api/v2/devices',
      undefined,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createDevice(
    request: CreateDeviceRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const body = {
      id: request?.id,
      push_provider: request?.push_provider,
      hardware_id: request?.hardware_id,
      push_provider_name: request?.push_provider_name,
      voip_token: request?.voip_token,
    };

    return this.apiClient.sendRequest<Response>(
      'POST',
      '/api/v2/devices',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  createGuest(
    request: CreateGuestRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateGuestResponse>> {
    const body = {
      user: request?.user,
    };

    return this.apiClient.sendRequest<CreateGuestResponse>(
      'POST',
      '/api/v2/guest',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  longPoll(
    request?: { connection_id?: string; close?: boolean; json?: WSAuthMessage },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<{}>> {
    const queryParams = {
      connection_id: request?.connection_id,
      close: request?.close,
      json: request?.json,
    };

    return this.apiClient.sendRequest<{}>(
      'GET',
      '/api/v2/longpoll',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getOG(
    request: { url: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetOGResponse>> {
    const queryParams = {
      url: request?.url,
    };

    return this.apiClient.sendRequest<GetOGResponse>(
      'GET',
      '/api/v2/og',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createPoll(
    request: CreatePollRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
    const body = {
      name: request?.name,
      allow_answers: request?.allow_answers,
      allow_user_suggested_options: request?.allow_user_suggested_options,
      description: request?.description,
      enforce_unique_vote: request?.enforce_unique_vote,
      id: request?.id,
      is_closed: request?.is_closed,
      max_votes_allowed: request?.max_votes_allowed,
      team: request?.team,
      voting_visibility: request?.voting_visibility,
      options: request?.options,
      custom: request?.custom,
    };

    return this.apiClient.sendRequest<PollResponse>(
      'POST',
      '/api/v2/polls',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  updatePoll(
    request: UpdatePollRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
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

    return this.apiClient.sendRequest<PollResponse>(
      'PUT',
      '/api/v2/polls',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryPolls(
    request?: QueryPollsRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryPollsResponse>> {
    const body = {
      limit: request?.limit,
      next: request?.next,
      prev: request?.prev,
      sort: request?.sort,
      filter: request?.filter,
    };

    return this.apiClient.sendRequest<QueryPollsResponse>(
      'POST',
      '/api/v2/polls/query',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deletePoll(
    request: { poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/polls/{poll_id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getPoll(
    request: { poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };

    return this.apiClient.sendRequest<PollResponse>(
      'GET',
      '/api/v2/polls/{poll_id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updatePollPartial(
    request: UpdatePollPartialRequest & { poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      unset: request?.unset,
      set: request?.set,
    };

    return this.apiClient.sendRequest<PollResponse>(
      'PATCH',
      '/api/v2/polls/{poll_id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  createPollOption(
    request: CreatePollOptionRequest & { poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollOptionResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      text: request?.text,
      custom: request?.custom,
    };

    return this.apiClient.sendRequest<PollOptionResponse>(
      'POST',
      '/api/v2/polls/{poll_id}/options',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  updatePollOption(
    request: UpdatePollOptionRequest & { poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollOptionResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
    };
    const body = {
      id: request?.id,
      text: request?.text,
      custom: request?.custom,
    };

    return this.apiClient.sendRequest<PollOptionResponse>(
      'PUT',
      '/api/v2/polls/{poll_id}/options',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  deletePollOption(
    request: { poll_id: string; option_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const pathParams = {
      poll_id: request?.poll_id,
      option_id: request?.option_id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/polls/{poll_id}/options/{option_id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getPollOption(
    request: { poll_id: string; option_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollOptionResponse>> {
    const pathParams = {
      poll_id: request?.poll_id,
      option_id: request?.option_id,
    };

    return this.apiClient.sendRequest<PollOptionResponse>(
      'GET',
      '/api/v2/polls/{poll_id}/options/{option_id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryPollVotes(
    request: QueryPollVotesRequest & { poll_id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollVotesResponse>> {
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

    return this.apiClient.sendRequest<PollVotesResponse>(
      'POST',
      '/api/v2/polls/{poll_id}/votes',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  updatePushNotificationPreferences(
    request: UpsertPushPreferencesRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpsertPushPreferencesResponse>> {
    const body = {
      preferences: request?.preferences,
    };

    return this.apiClient.sendRequest<UpsertPushPreferencesResponse>(
      'POST',
      '/api/v2/push_preferences',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  searchRoles(
    request: {
      query: string;
      limit?: number;
      name_gt?: string;
      role_type?: string;
      include_global_roles?: boolean;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SearchRolesResponse>> {
    const queryParams = {
      query: request?.query,
      limit: request?.limit,
      name_gt: request?.name_gt,
      role_type: request?.role_type,
      include_global_roles: request?.include_global_roles,
    };

    return this.apiClient.sendRequest<SearchRolesResponse>(
      'GET',
      '/api/v2/roles/search',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteFile(
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/uploads/file',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadFile(
    request?: FileUploadRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<FileUploadResponse>> {
    const body = {
      file: request?.file,
      user: request?.user,
    };

    return this.apiClient.sendRequest<FileUploadResponse>(
      'POST',
      '/api/v2/uploads/file',
      undefined,
      undefined,
      body,
      'multipart/form-data',
      requestOptions,
    );
  }

  deleteImage(
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      url: request?.url,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/uploads/image',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadImage(
    request?: ImageUploadRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ImageUploadResponse>> {
    const body = {
      file: request?.file,
      upload_sizes: request?.upload_sizes,
      user: request?.user,
    };

    return this.apiClient.sendRequest<ImageUploadResponse>(
      'POST',
      '/api/v2/uploads/image',
      undefined,
      undefined,
      body,
      'multipart/form-data',
      requestOptions,
    );
  }

  listUserGroups(
    request?: {
      limit?: number;
      id_gt?: string;
      created_at_gt?: string;
      team_id?: string;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ListUserGroupsResponse>> {
    const queryParams = {
      limit: request?.limit,
      id_gt: request?.id_gt,
      created_at_gt: request?.created_at_gt,
      team_id: request?.team_id,
    };

    return this.apiClient.sendRequest<ListUserGroupsResponse>(
      'GET',
      '/api/v2/usergroups',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createUserGroup(
    request: CreateUserGroupRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateUserGroupResponse>> {
    const body = {
      name: request?.name,
      description: request?.description,
      id: request?.id,
      team_id: request?.team_id,
      member_ids: request?.member_ids,
    };

    return this.apiClient.sendRequest<CreateUserGroupResponse>(
      'POST',
      '/api/v2/usergroups',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  searchUserGroups(
    request: {
      query: string;
      limit?: number;
      name_gt?: string;
      id_gt?: string;
      team_id?: string;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SearchUserGroupsResponse>> {
    const queryParams = {
      query: request?.query,
      limit: request?.limit,
      name_gt: request?.name_gt,
      id_gt: request?.id_gt,
      team_id: request?.team_id,
    };

    return this.apiClient.sendRequest<SearchUserGroupsResponse>(
      'GET',
      '/api/v2/usergroups/search',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteUserGroup(
    request: { id: string; team_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const queryParams = {
      team_id: request?.team_id,
    };
    const pathParams = {
      id: request?.id,
    };

    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/usergroups/{id}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getUserGroup(
    request: { id: string; team_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetUserGroupResponse>> {
    const queryParams = {
      team_id: request?.team_id,
    };
    const pathParams = {
      id: request?.id,
    };

    return this.apiClient.sendRequest<GetUserGroupResponse>(
      'GET',
      '/api/v2/usergroups/{id}',
      pathParams,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateUserGroup(
    request: UpdateUserGroupRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateUserGroupResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      description: request?.description,
      name: request?.name,
      team_id: request?.team_id,
    };

    return this.apiClient.sendRequest<UpdateUserGroupResponse>(
      'PUT',
      '/api/v2/usergroups/{id}',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  addUserGroupMembers(
    request: AddUserGroupMembersRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<AddUserGroupMembersResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      member_ids: request?.member_ids,
      as_admin: request?.as_admin,
      team_id: request?.team_id,
    };

    return this.apiClient.sendRequest<AddUserGroupMembersResponse>(
      'POST',
      '/api/v2/usergroups/{id}/members',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  removeUserGroupMembers(
    request: RemoveUserGroupMembersRequest & { id: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<RemoveUserGroupMembersResponse>> {
    const pathParams = {
      id: request?.id,
    };
    const body = {
      member_ids: request?.member_ids,
      team_id: request?.team_id,
    };

    return this.apiClient.sendRequest<RemoveUserGroupMembersResponse>(
      'POST',
      '/api/v2/usergroups/{id}/members/delete',
      pathParams,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  queryUsers(
    request?: { payload?: QueryUsersPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryUsersResponse>> {
    const queryParams = {
      payload: request?.payload,
    };

    return this.apiClient.sendRequest<QueryUsersResponse>(
      'GET',
      '/api/v2/users',
      undefined,
      queryParams,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateUsersPartial(
    request: UpdateUsersPartialRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateUsersResponse>> {
    const body = {
      users: request?.users,
    };

    return this.apiClient.sendRequest<UpdateUsersResponse>(
      'PATCH',
      '/api/v2/users',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  updateUsers(
    request: UpdateUsersRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateUsersResponse>> {
    const body = {
      users: request?.users,
    };

    return this.apiClient.sendRequest<UpdateUsersResponse>(
      'POST',
      '/api/v2/users',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  getBlockedUsers(
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetBlockedUsersResponse>> {
    return this.apiClient.sendRequest<GetBlockedUsersResponse>(
      'GET',
      '/api/v2/users/block',
      undefined,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  blockUsers(
    request: BlockUsersRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<BlockUsersResponse>> {
    const body = {
      blocked_user_id: request?.blocked_user_id,
    };

    return this.apiClient.sendRequest<BlockUsersResponse>(
      'POST',
      '/api/v2/users/block',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  getUserLiveLocations(
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SharedLocationsResponse>> {
    return this.apiClient.sendRequest<SharedLocationsResponse>(
      'GET',
      '/api/v2/users/live_locations',
      undefined,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateLiveLocation(
    request: UpdateLiveLocationRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SharedLocationResponse>> {
    const body = {
      message_id: request?.message_id,
      end_at: request?.end_at,
      latitude: request?.latitude,
      longitude: request?.longitude,
    };

    return this.apiClient.sendRequest<SharedLocationResponse>(
      'PUT',
      '/api/v2/users/live_locations',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }

  unblockUsers(
    request: UnblockUsersRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UnblockUsersResponse>> {
    const body = {
      blocked_user_id: request?.blocked_user_id,
    };

    return this.apiClient.sendRequest<UnblockUsersResponse>(
      'POST',
      '/api/v2/users/unblock',
      undefined,
      undefined,
      body,
      'application/json',
      requestOptions,
    );
  }
}
