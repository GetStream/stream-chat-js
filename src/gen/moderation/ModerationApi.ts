import type { ApiClient, StreamRequestOptions, StreamResponse } from '../../gen-imports';
import type {
  AppealRequest,
  AppealResponse,
  BanRequest,
  BulkActionAppealsRequest,
  BulkActionAppealsResponse,
  BulkDeleteActionConfigRequest,
  BulkDeleteActionConfigResponse,
  BulkUpsertActionConfigRequest,
  BulkUpsertActionConfigResponse,
  CreateQueueRequest,
  DeleteActionConfigResponse,
  DeleteModerationConfigResponse,
  DeleteQueueRequest,
  FlagItemResponse,
  FlagRequest,
  GetActionConfigResponse,
  GetAppealResponse,
  GetConfigResponse,
  GetConfigVersionResponse,
  ListConfigVersionsResponse,
  ListQueuesResponse,
  ModerationBanResponse,
  MuteRequest,
  MuteResponse,
  PublishConfigVersionRequest,
  PublishConfigVersionResponse,
  QueryAppealsRequest,
  QueryAppealsResponse,
  QueryModerationConfigsRequest,
  QueryModerationConfigsResponse,
  QueryReviewQueueRequest,
  QueryReviewQueueResponse,
  QueueResponse,
  RevealMediaRequest,
  RevealMediaResponse,
  SaveConfigVersionRequest,
  SaveConfigVersionResponse,
  SubmitActionRequest,
  SubmitActionResponse,
  UnbanRequest,
  UnbanResponse,
  UnmuteRequest,
  UnmuteResponse,
  UpdateQueueRequest,
  UpsertActionConfigRequest,
  UpsertActionConfigResponse,
  UpsertConfigRequest,
  UpsertConfigResponse,
} from '../models';

export class ModerationApi {
  constructor(public readonly apiClient: ApiClient) {}

  getActionConfig(
    request?: {
      queue_type?: string;
      entity_type?: string;
      exclude_defaults?: boolean;
      only_defaults?: boolean;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetActionConfigResponse>> {
    return this.apiClient.sendRequest<GetActionConfigResponse>(
      'GET',
      '/api/v2/moderation/action_config',
      undefined,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  upsertActionConfig(
    request: UpsertActionConfigRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpsertActionConfigResponse>> {
    return this.apiClient.sendRequest<UpsertActionConfigResponse>(
      'POST',
      '/api/v2/moderation/action_config',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  bulkUpsertActionConfig(
    request: BulkUpsertActionConfigRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<BulkUpsertActionConfigResponse>> {
    return this.apiClient.sendRequest<BulkUpsertActionConfigResponse>(
      'POST',
      '/api/v2/moderation/action_config/bulk',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  bulkDeleteActionConfig(
    request: BulkDeleteActionConfigRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<BulkDeleteActionConfigResponse>> {
    return this.apiClient.sendRequest<BulkDeleteActionConfigResponse>(
      'POST',
      '/api/v2/moderation/action_config/bulk_delete',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  deleteActionConfig(
    pathParams: { id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteActionConfigResponse>> {
    return this.apiClient.sendRequest<DeleteActionConfigResponse>(
      'DELETE',
      '/api/v2/moderation/action_config/{id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  appeal(
    request: AppealRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<AppealResponse>> {
    return this.apiClient.sendRequest<AppealResponse>(
      'POST',
      '/api/v2/moderation/appeal',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  getAppeal(
    pathParams: { id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetAppealResponse>> {
    return this.apiClient.sendRequest<GetAppealResponse>(
      'GET',
      '/api/v2/moderation/appeal/{id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  queryAppeals(
    request?: QueryAppealsRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryAppealsResponse>> {
    return this.apiClient.sendRequest<QueryAppealsResponse>(
      'POST',
      '/api/v2/moderation/appeals',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  bulkActionAppeals(
    request: BulkActionAppealsRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<BulkActionAppealsResponse>> {
    return this.apiClient.sendRequest<BulkActionAppealsResponse>(
      'POST',
      '/api/v2/moderation/appeals/bulk_action',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  ban(
    request: BanRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ModerationBanResponse>> {
    return this.apiClient.sendRequest<ModerationBanResponse>(
      'POST',
      '/api/v2/moderation/ban',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  upsertConfig(
    request: UpsertConfigRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpsertConfigResponse>> {
    return this.apiClient.sendRequest<UpsertConfigResponse>(
      'POST',
      '/api/v2/moderation/config',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  saveConfigVersion(
    request: SaveConfigVersionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SaveConfigVersionResponse>> {
    return this.apiClient.sendRequest<SaveConfigVersionResponse>(
      'POST',
      '/api/v2/moderation/config/versions',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  deleteConfig(
    pathParams: { key: string },
    request?: { team?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteModerationConfigResponse>> {
    return this.apiClient.sendRequest<DeleteModerationConfigResponse>(
      'DELETE',
      '/api/v2/moderation/config/{key}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getConfig(
    pathParams: { key: string },
    request?: { team?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetConfigResponse>> {
    return this.apiClient.sendRequest<GetConfigResponse>(
      'GET',
      '/api/v2/moderation/config/{key}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  listConfigVersions(
    pathParams: { key: string },
    request?: { team?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ListConfigVersionsResponse>> {
    return this.apiClient.sendRequest<ListConfigVersionsResponse>(
      'GET',
      '/api/v2/moderation/config/{key}/versions',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  getConfigVersion(
    pathParams: { key: string; version: number },
    request?: { team?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetConfigVersionResponse>> {
    return this.apiClient.sendRequest<GetConfigVersionResponse>(
      'GET',
      '/api/v2/moderation/config/{key}/versions/{version}',
      pathParams,
      request,
      undefined,
      undefined,
      requestOptions,
    );
  }

  publishConfigVersion(
    pathParams: { key: string; version: number },
    request?: PublishConfigVersionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<PublishConfigVersionResponse>> {
    return this.apiClient.sendRequest<PublishConfigVersionResponse>(
      'POST',
      '/api/v2/moderation/config/{key}/versions/{version}/publish',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  queryModerationConfigs(
    request?: QueryModerationConfigsRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryModerationConfigsResponse>> {
    return this.apiClient.sendRequest<QueryModerationConfigsResponse>(
      'POST',
      '/api/v2/moderation/configs',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  flag(
    request: FlagRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<FlagItemResponse>> {
    return this.apiClient.sendRequest<FlagItemResponse>(
      'POST',
      '/api/v2/moderation/flag',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  mute(
    request: MuteRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MuteResponse>> {
    return this.apiClient.sendRequest<MuteResponse>(
      'POST',
      '/api/v2/moderation/mute',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  listQueues(
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ListQueuesResponse>> {
    return this.apiClient.sendRequest<ListQueuesResponse>(
      'GET',
      '/api/v2/moderation/queues',
      undefined,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  createQueue(
    request: CreateQueueRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueueResponse>> {
    return this.apiClient.sendRequest<QueueResponse>(
      'POST',
      '/api/v2/moderation/queues',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  getQueue(
    pathParams: { id: string },
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueueResponse>> {
    return this.apiClient.sendRequest<QueueResponse>(
      'GET',
      '/api/v2/moderation/queues/{id}',
      pathParams,
      undefined,
      undefined,
      undefined,
      requestOptions,
    );
  }

  updateQueue(
    pathParams: { id: string },
    request?: UpdateQueueRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueueResponse>> {
    return this.apiClient.sendRequest<QueueResponse>(
      'PATCH',
      '/api/v2/moderation/queues/{id}',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  deleteQueue(
    pathParams: { id: string },
    request?: DeleteQueueRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueueResponse>> {
    return this.apiClient.sendRequest<QueueResponse>(
      'POST',
      '/api/v2/moderation/queues/{id}/delete',
      pathParams,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  revealMedia(
    request: RevealMediaRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<RevealMediaResponse>> {
    return this.apiClient.sendRequest<RevealMediaResponse>(
      'POST',
      '/api/v2/moderation/reveal_media',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  queryReviewQueue(
    request?: QueryReviewQueueRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<QueryReviewQueueResponse>> {
    return this.apiClient.sendRequest<QueryReviewQueueResponse>(
      'POST',
      '/api/v2/moderation/review_queue',
      undefined,
      undefined,
      request ?? {},
      'application/json',
      requestOptions,
    );
  }

  submitAction(
    request: SubmitActionRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SubmitActionResponse>> {
    return this.apiClient.sendRequest<SubmitActionResponse>(
      'POST',
      '/api/v2/moderation/submit_action',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }

  unban(
    request: UnbanRequest & {
      target_user_id: string;
      channel_cid?: string;
      remove_future_channels_ban?: boolean;
    },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UnbanResponse>> {
    const { target_user_id, channel_cid, remove_future_channels_ban, ...body } = request;
    const queryParams = { target_user_id, channel_cid, remove_future_channels_ban };

    return this.apiClient.sendRequest<UnbanResponse>(
      'POST',
      '/api/v2/moderation/unban',
      undefined,
      queryParams,
      body,
      'application/json',
      requestOptions,
    );
  }

  unmute(
    request: UnmuteRequest,
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UnmuteResponse>> {
    return this.apiClient.sendRequest<UnmuteResponse>(
      'POST',
      '/api/v2/moderation/unmute',
      undefined,
      undefined,
      request,
      'application/json',
      requestOptions,
    );
  }
}
