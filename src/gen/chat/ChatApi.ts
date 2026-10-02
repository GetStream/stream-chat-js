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
    _request?: Record<string, never>,
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
    return this.apiClient.sendRequest<ListBlockListResponse>(
      'GET',
      '/api/v2/blocklists',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createBlockList(
    request: CreateBlockListRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateBlockListResponse>> {
    return this.apiClient.sendRequest<CreateBlockListResponse>(
      'POST',
      '/api/v2/blocklists',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  importBlockList(
    pathParams: { id: string },
    request: ImportBlockListRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ImportBlockListResponse>> {
    return this.apiClient.sendRequest<ImportBlockListResponse>(
      'POST',
      '/api/v2/blocklists/{id}/import',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  deleteBlockList(
    pathParams: { name: string },
    request?: { team?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/blocklists/{name}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateBlockList(
    pathParams: { name: string },
    request?: UpdateBlockListRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateBlockListResponse>> {
    return this.apiClient.sendRequest<UpdateBlockListResponse>(
      'PUT',
      '/api/v2/blocklists/{name}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  queryChannels(
    request?: QueryChannelsRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryChannelsResponse>> {
    const { connection_id, ...body } = request ?? {};
    const queryParams = { connection_id };

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
    return this.apiClient.sendRequest<DeleteChannelsResponse>(
      'POST',
      '/api/v2/chat/channels/delete',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  markDelivered(
    request?: MarkDeliveredRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MarkDeliveredResponse>> {
    return this.apiClient.sendRequest<MarkDeliveredResponse>(
      'POST',
      '/api/v2/chat/channels/delivered',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  groupedQueryChannels(
    request?: GroupedQueryChannelsRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GroupedQueryChannelsResponse>> {
    const { connection_id, ...body } = request ?? {};
    const queryParams = { connection_id };

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
    return this.apiClient.sendRequest<MarkReadResponse>(
      'POST',
      '/api/v2/chat/channels/read',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  getOrCreateDistinctChannel(
    pathParams: { type: string },
    request?: ChannelGetOrCreateRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ChannelStateResponse>> {
    const { connection_id, ...body } = request ?? {};
    const queryParams = { connection_id };

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
    pathParams: { type: string; id: string },
    request?: { hard_delete?: boolean },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteChannelResponse>> {
    return this.apiClient.sendRequest<DeleteChannelResponse>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getChannel(
    pathParams: { type: string; id: string },
    request?: {
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
    return this.apiClient.sendRequest<ChannelStateResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateChannelPartial(
    pathParams: { type: string; id: string },
    request?: UpdateChannelPartialRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateChannelPartialResponse>> {
    return this.apiClient.sendRequest<UpdateChannelPartialResponse>(
      'PATCH',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  updateChannel(
    pathParams: { type: string; id: string },
    request?: UpdateChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateChannelResponse>> {
    return this.apiClient.sendRequest<UpdateChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  deleteDraft(
    pathParams: { type: string; id: string },
    request?: { parent_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getDraft(
    pathParams: { type: string; id: string },
    request?: { parent_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetDraftResponse>> {
    return this.apiClient.sendRequest<GetDraftResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createDraft(
    pathParams: { type: string; id: string },
    request: CreateDraftRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateDraftResponse>> {
    return this.apiClient.sendRequest<CreateDraftResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/draft',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  sendEvent(
    pathParams: { type: string; id: string },
    request: SendEventRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<EventResponse>> {
    return this.apiClient.sendRequest<EventResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/event',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  deleteChannelFile(
    pathParams: { type: string; id: string },
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/file',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadChannelFile(
    pathParams: { type: string; id: string },
    request?: UploadChannelFileRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UploadChannelFileResponse>> {
    return this.apiClient.sendRequest<UploadChannelFileResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/file',
      pathParams,
      undefined,
      request ?? {},
      'multipart/form-data',
      requestOptions,
    );
  }

  hideChannel(
    pathParams: { type: string; id: string },
    request?: HideChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<HideChannelResponse>> {
    return this.apiClient.sendRequest<HideChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/hide',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  deleteChannelImage(
    pathParams: { type: string; id: string },
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/chat/channels/{type}/{id}/image',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadChannelImage(
    pathParams: { type: string; id: string },
    request?: UploadChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UploadChannelResponse>> {
    return this.apiClient.sendRequest<UploadChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/image',
      pathParams,
      undefined,
      request ?? {},
      'multipart/form-data',
      requestOptions,
    );
  }

  updateMemberPartial(
    pathParams: { type: string; id: string },
    request?: UpdateMemberPartialRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateMemberPartialResponse>> {
    return this.apiClient.sendRequest<UpdateMemberPartialResponse>(
      'PATCH',
      '/api/v2/chat/channels/{type}/{id}/member',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  sendMessage(
    pathParams: { type: string; id: string },
    request: SendMessageRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SendMessageResponse>> {
    return this.apiClient.sendRequest<SendMessageResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/message',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  getManyMessages(
    pathParams: { type: string; id: string },
    request: { ids: Array<string>; member_custom_include?: Array<string> },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetManyMessagesResponse>> {
    return this.apiClient.sendRequest<GetManyMessagesResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/messages',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getPinnedMessages(
    pathParams: { type: string; id: string },
    request?: {
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
    return this.apiClient.sendRequest<GetPinnedMessagesResponse>(
      'GET',
      '/api/v2/chat/channels/{type}/{id}/pinned_messages',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getOrCreateChannel(
    pathParams: { type: string; id: string },
    request?: ChannelGetOrCreateRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ChannelStateResponse>> {
    const { connection_id, ...body } = request ?? {};
    const queryParams = { connection_id };

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
    pathParams: { type: string; id: string },
    request?: MarkReadRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MarkReadResponse>> {
    return this.apiClient.sendRequest<MarkReadResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/read',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  showChannel(
    pathParams: { type: string; id: string },
    request?: ShowChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ShowChannelResponse>> {
    return this.apiClient.sendRequest<ShowChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/show',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  stopWatchingChannel(
    pathParams: { type: string; id: string },
    request?: ChannelStopWatchingRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    const { connection_id, ...body } = request ?? {};
    const queryParams = { connection_id };

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
    pathParams: { type: string; id: string },
    request?: TruncateChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<TruncateChannelResponse>> {
    return this.apiClient.sendRequest<TruncateChannelResponse>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/truncate',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  markUnread(
    pathParams: { type: string; id: string },
    request?: MarkUnreadRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'POST',
      '/api/v2/chat/channels/{type}/{id}/unread',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  queryDrafts(
    request?: QueryDraftsRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryDraftsResponse>> {
    return this.apiClient.sendRequest<QueryDraftsResponse>(
      'POST',
      '/api/v2/chat/drafts/query',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  queryMembers(
    request?: { payload?: QueryMembersPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MembersResponse>> {
    return this.apiClient.sendRequest<MembersResponse>(
      'GET',
      '/api/v2/chat/members',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteMessage(
    pathParams: { id: string },
    request?: { hard?: boolean; delete_for_me?: boolean },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteMessageResponse>> {
    return this.apiClient.sendRequest<DeleteMessageResponse>(
      'DELETE',
      '/api/v2/chat/messages/{id}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getMessage(
    pathParams: { id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetMessageResponse>> {
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
    pathParams: { id: string },
    request: UpdateMessageRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateMessageResponse>> {
    return this.apiClient.sendRequest<UpdateMessageResponse>(
      'POST',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  updateMessagePartial(
    pathParams: { id: string },
    request?: UpdateMessagePartialRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateMessagePartialResponse>> {
    return this.apiClient.sendRequest<UpdateMessagePartialResponse>(
      'PUT',
      '/api/v2/chat/messages/{id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  runMessageAction(
    pathParams: { id: string },
    request: MessageActionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MessageActionResponse>> {
    return this.apiClient.sendRequest<MessageActionResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/action',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  sendReaction(
    pathParams: { id: string },
    request: SendReactionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SendReactionResponse>> {
    return this.apiClient.sendRequest<SendReactionResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/reaction',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  deleteReaction(
    pathParams: { id: string; type: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteReactionResponse>> {
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
    pathParams: { id: string },
    request?: { limit?: number; offset?: number },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetReactionsResponse>> {
    return this.apiClient.sendRequest<GetReactionsResponse>(
      'GET',
      '/api/v2/chat/messages/{id}/reactions',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryReactions(
    pathParams: { id: string },
    request?: QueryReactionsRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryReactionsResponse>> {
    return this.apiClient.sendRequest<QueryReactionsResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/reactions',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  translateMessage(
    pathParams: { id: string },
    request: TranslateMessageRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<TranslateMessageResponse>> {
    return this.apiClient.sendRequest<TranslateMessageResponse>(
      'POST',
      '/api/v2/chat/messages/{id}/translate',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  castPollVote(
    pathParams: { message_id: string; poll_id: string },
    request?: CastPollVoteRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollVoteResponse>> {
    return this.apiClient.sendRequest<PollVoteResponse>(
      'POST',
      '/api/v2/chat/messages/{message_id}/polls/{poll_id}/vote',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  deletePollVote(
    pathParams: { message_id: string; poll_id: string; vote_id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollVoteResponse>> {
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
    pathParams: { message_id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteReminderResponse>> {
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
    pathParams: { message_id: string },
    request?: UpdateReminderRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateReminderResponse>> {
    return this.apiClient.sendRequest<UpdateReminderResponse>(
      'PATCH',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  createReminder(
    pathParams: { message_id: string },
    request?: CreateReminderRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateReminderResponse>> {
    return this.apiClient.sendRequest<CreateReminderResponse>(
      'POST',
      '/api/v2/chat/messages/{message_id}/reminders',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  getReplies(
    pathParams: { parent_id: string },
    request?: {
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
    return this.apiClient.sendRequest<GetRepliesResponse>(
      'GET',
      '/api/v2/chat/messages/{parent_id}/replies',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryMessageFlags(
    request?: { payload?: QueryMessageFlagsPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryMessageFlagsResponse>> {
    return this.apiClient.sendRequest<QueryMessageFlagsResponse>(
      'GET',
      '/api/v2/chat/moderation/flags/message',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  muteChannel(
    request?: MuteChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MuteChannelResponse>> {
    return this.apiClient.sendRequest<MuteChannelResponse>(
      'POST',
      '/api/v2/chat/moderation/mute/channel',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  unmuteChannel(
    request?: UnmuteChannelRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UnmuteResponse>> {
    return this.apiClient.sendRequest<UnmuteResponse>(
      'POST',
      '/api/v2/chat/moderation/unmute/channel',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  queryBannedUsers(
    request?: { payload?: QueryBannedUsersPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryBannedUsersResponse>> {
    return this.apiClient.sendRequest<QueryBannedUsersResponse>(
      'GET',
      '/api/v2/chat/query_banned_users',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryFutureChannelBans(
    request?: { payload?: QueryFutureChannelBansPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryFutureChannelBansResponse>> {
    return this.apiClient.sendRequest<QueryFutureChannelBansResponse>(
      'GET',
      '/api/v2/chat/query_future_channel_bans',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryReminders(
    request?: QueryRemindersRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryRemindersResponse>> {
    return this.apiClient.sendRequest<QueryRemindersResponse>(
      'POST',
      '/api/v2/chat/reminders/query',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  search(
    request?: { payload?: SearchPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SearchResponse>> {
    return this.apiClient.sendRequest<SearchResponse>(
      'GET',
      '/api/v2/chat/search',
      undefined,
      request,
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
    const { with_inaccessible_cids, watch, connection_id, ...body } = request;
    const queryParams = { with_inaccessible_cids, watch, connection_id };

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
    const { connection_id, ...body } = request ?? {};
    const queryParams = { connection_id };

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
    pathParams: { message_id: string },
    request?: {
      watch?: boolean;
      connection_id?: string;
      reply_limit?: number;
      participant_limit?: number;
      member_limit?: number;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetThreadResponse>> {
    return this.apiClient.sendRequest<GetThreadResponse>(
      'GET',
      '/api/v2/chat/threads/{message_id}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateThreadPartial(
    pathParams: { message_id: string },
    request?: UpdateThreadPartialRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateThreadPartialResponse>> {
    return this.apiClient.sendRequest<UpdateThreadPartialResponse>(
      'PATCH',
      '/api/v2/chat/threads/{message_id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  unreadCounts(
    _request?: Record<string, never>,
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
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/devices',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  listDevices(
    _request?: Record<string, never>,
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
    return this.apiClient.sendRequest<Response>(
      'POST',
      '/api/v2/devices',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  createGuest(
    request: CreateGuestRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateGuestResponse>> {
    return this.apiClient.sendRequest<CreateGuestResponse>(
      'POST',
      '/api/v2/guest',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  longPoll(
    request?: { connection_id?: string; close?: boolean; json?: WSAuthMessage },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<{}>> {
    return this.apiClient.sendRequest<{}>(
      'GET',
      '/api/v2/longpoll',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getOG(
    request: { url: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetOGResponse>> {
    return this.apiClient.sendRequest<GetOGResponse>(
      'GET',
      '/api/v2/og',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createPoll(
    request: CreatePollRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
    return this.apiClient.sendRequest<PollResponse>(
      'POST',
      '/api/v2/polls',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  updatePoll(
    request: UpdatePollRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
    return this.apiClient.sendRequest<PollResponse>(
      'PUT',
      '/api/v2/polls',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  queryPolls(
    request?: QueryPollsRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryPollsResponse>> {
    return this.apiClient.sendRequest<QueryPollsResponse>(
      'POST',
      '/api/v2/polls/query',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  deletePoll(
    pathParams: { poll_id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
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
    pathParams: { poll_id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
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
    pathParams: { poll_id: string },
    request?: UpdatePollPartialRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollResponse>> {
    return this.apiClient.sendRequest<PollResponse>(
      'PATCH',
      '/api/v2/polls/{poll_id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  createPollOption(
    pathParams: { poll_id: string },
    request: CreatePollOptionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollOptionResponse>> {
    return this.apiClient.sendRequest<PollOptionResponse>(
      'POST',
      '/api/v2/polls/{poll_id}/options',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  updatePollOption(
    pathParams: { poll_id: string },
    request: UpdatePollOptionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollOptionResponse>> {
    return this.apiClient.sendRequest<PollOptionResponse>(
      'PUT',
      '/api/v2/polls/{poll_id}/options',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  deletePollOption(
    pathParams: { poll_id: string; option_id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
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
    pathParams: { poll_id: string; option_id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollOptionResponse>> {
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
    pathParams: { poll_id: string },
    request?: QueryPollVotesRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PollVotesResponse>> {
    return this.apiClient.sendRequest<PollVotesResponse>(
      'POST',
      '/api/v2/polls/{poll_id}/votes',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  updatePushNotificationPreferences(
    request: UpsertPushPreferencesRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpsertPushPreferencesResponse>> {
    return this.apiClient.sendRequest<UpsertPushPreferencesResponse>(
      'POST',
      '/api/v2/push_preferences',
      undefined,
      undefined,
      request,
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
    return this.apiClient.sendRequest<SearchRolesResponse>(
      'GET',
      '/api/v2/roles/search',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteFile(
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/uploads/file',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadFile(
    request?: FileUploadRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<FileUploadResponse>> {
    return this.apiClient.sendRequest<FileUploadResponse>(
      'POST',
      '/api/v2/uploads/file',
      undefined,
      undefined,
      request ?? {},
      'multipart/form-data',
      requestOptions,
    );
  }

  deleteImage(
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/uploads/image',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  uploadImage(
    request?: ImageUploadRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ImageUploadResponse>> {
    return this.apiClient.sendRequest<ImageUploadResponse>(
      'POST',
      '/api/v2/uploads/image',
      undefined,
      undefined,
      request ?? {},
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
    return this.apiClient.sendRequest<ListUserGroupsResponse>(
      'GET',
      '/api/v2/usergroups',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createUserGroup(
    request: CreateUserGroupRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateUserGroupResponse>> {
    return this.apiClient.sendRequest<CreateUserGroupResponse>(
      'POST',
      '/api/v2/usergroups',
      undefined,
      undefined,
      request,
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
    return this.apiClient.sendRequest<SearchUserGroupsResponse>(
      'GET',
      '/api/v2/usergroups/search',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  deleteUserGroup(
    pathParams: { id: string },
    request?: { team_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    return this.apiClient.sendRequest<Response>(
      'DELETE',
      '/api/v2/usergroups/{id}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getUserGroup(
    pathParams: { id: string },
    request?: { team_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetUserGroupResponse>> {
    return this.apiClient.sendRequest<GetUserGroupResponse>(
      'GET',
      '/api/v2/usergroups/{id}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateUserGroup(
    pathParams: { id: string },
    request?: UpdateUserGroupRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateUserGroupResponse>> {
    return this.apiClient.sendRequest<UpdateUserGroupResponse>(
      'PUT',
      '/api/v2/usergroups/{id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  addUserGroupMembers(
    pathParams: { id: string },
    request: AddUserGroupMembersRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<AddUserGroupMembersResponse>> {
    return this.apiClient.sendRequest<AddUserGroupMembersResponse>(
      'POST',
      '/api/v2/usergroups/{id}/members',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  removeUserGroupMembers(
    pathParams: { id: string },
    request: RemoveUserGroupMembersRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<RemoveUserGroupMembersResponse>> {
    return this.apiClient.sendRequest<RemoveUserGroupMembersResponse>(
      'POST',
      '/api/v2/usergroups/{id}/members/delete',
      pathParams,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  queryUsers(
    request?: { payload?: QueryUsersPayload },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryUsersResponse>> {
    return this.apiClient.sendRequest<QueryUsersResponse>(
      'GET',
      '/api/v2/users',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateUsersPartial(
    request: UpdateUsersPartialRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateUsersResponse>> {
    return this.apiClient.sendRequest<UpdateUsersResponse>(
      'PATCH',
      '/api/v2/users',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  updateUsers(
    request: UpdateUsersRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateUsersResponse>> {
    return this.apiClient.sendRequest<UpdateUsersResponse>(
      'POST',
      '/api/v2/users',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  getBlockedUsers(
    _request?: Record<string, never>,
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
    return this.apiClient.sendRequest<BlockUsersResponse>(
      'POST',
      '/api/v2/users/block',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  getUserLiveLocations(
    _request?: Record<string, never>,
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
    return this.apiClient.sendRequest<SharedLocationResponse>(
      'PUT',
      '/api/v2/users/live_locations',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  unblockUsers(
    request: UnblockUsersRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UnblockUsersResponse>> {
    return this.apiClient.sendRequest<UnblockUsersResponse>(
      'POST',
      '/api/v2/users/unblock',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }
}
