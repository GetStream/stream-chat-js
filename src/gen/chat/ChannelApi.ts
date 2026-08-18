import type { ChatApi, StreamRequestOptions, StreamResponse } from '../../gen-imports';
import type {
  ChannelGetOrCreateRequest,
  ChannelStateResponse,
  ChannelStopWatchingRequest,
  CreateDraftRequest,
  CreateDraftResponse,
  DeleteChannelResponse,
  EventResponse,
  GetDraftResponse,
  GetManyMessagesResponse,
  HideChannelRequest,
  HideChannelResponse,
  MarkReadRequest,
  MarkReadResponse,
  MarkUnreadRequest,
  Response,
  SendEventRequest,
  SendMessageRequest,
  SendMessageResponse,
  ShowChannelRequest,
  ShowChannelResponse,
  TruncateChannelRequest,
  TruncateChannelResponse,
  UpdateChannelPartialRequest,
  UpdateChannelPartialResponse,
  UpdateChannelRequest,
  UpdateChannelResponse,
  UpdateMemberPartialRequest,
  UpdateMemberPartialResponse,
  UploadChannelFileRequest,
  UploadChannelFileResponse,
  UploadChannelRequest,
  UploadChannelResponse,
} from '../models';

export class ChannelApi {
  constructor(
    protected chatApi: ChatApi,
    public readonly type: string,
    public id: string | undefined,
  ) {}

  delete(
    request?: { hard_delete?: boolean },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<DeleteChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  get(
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
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  updateChannelPartial(
    request?: UpdateChannelPartialRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateChannelPartialResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.updateChannelPartial(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  update(
    request?: UpdateChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.updateChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  deleteDraft(
    request?: { parent_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteDraft(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  getDraft(
    request?: { parent_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetDraftResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getDraft(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  createDraft(
    request: CreateDraftRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<CreateDraftResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.createDraft(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  sendEvent(
    request: SendEventRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<EventResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.sendEvent(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  deleteChannelFile(
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteChannelFile(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  uploadChannelFile(
    request?: UploadChannelFileRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UploadChannelFileResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.uploadChannelFile(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  hide(
    request?: HideChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<HideChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.hideChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  deleteChannelImage(
    request?: { url?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteChannelImage(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  uploadChannelImage(
    request?: UploadChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UploadChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.uploadChannelImage(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  updateMemberPartial(
    request?: UpdateMemberPartialRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<UpdateMemberPartialResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.updateMemberPartial(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  sendMessage(
    request: SendMessageRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<SendMessageResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.sendMessage(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  getManyMessages(
    request: { ids: Array<string>; member_custom_include?: Array<string> },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<GetManyMessagesResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getManyMessages(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  getOrCreate(
    request?: ChannelGetOrCreateRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ChannelStateResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getOrCreateChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  markRead(
    request?: MarkReadRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<MarkReadResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.markRead(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  show(
    request?: ShowChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<ShowChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.showChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  stopWatching(
    request?: ChannelStopWatchingRequest & { connection_id?: string },
    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.stopWatchingChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  truncate(
    request?: TruncateChannelRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<TruncateChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.truncateChannel(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }

  markUnread(
    request?: MarkUnreadRequest,

    requestOptions?: StreamRequestOptions,
  ): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.markUnread(
      { id: this.id, type: this.type, ...request },
      requestOptions,
    );
  }
}
