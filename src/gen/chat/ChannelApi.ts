import type { ChatApi, StreamResponse } from '../../gen-imports';
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

  delete(request?: {
    hard_delete?: boolean;
  }): Promise<StreamResponse<DeleteChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteChannel({ id: this.id, type: this.type, ...request });
  }

  updateChannelPartial(
    request?: UpdateChannelPartialRequest,
  ): Promise<StreamResponse<UpdateChannelPartialResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.updateChannelPartial({
      id: this.id,
      type: this.type,
      ...request,
    });
  }

  update(request?: UpdateChannelRequest): Promise<StreamResponse<UpdateChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.updateChannel({ id: this.id, type: this.type, ...request });
  }

  deleteDraft(request?: { parent_id?: string }): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteDraft({ id: this.id, type: this.type, ...request });
  }

  getDraft(request?: { parent_id?: string }): Promise<StreamResponse<GetDraftResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getDraft({ id: this.id, type: this.type, ...request });
  }

  createDraft(request: CreateDraftRequest): Promise<StreamResponse<CreateDraftResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.createDraft({ id: this.id, type: this.type, ...request });
  }

  sendEvent(request: SendEventRequest): Promise<StreamResponse<EventResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.sendEvent({ id: this.id, type: this.type, ...request });
  }

  deleteChannelFile(request?: { url?: string }): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteChannelFile({ id: this.id, type: this.type, ...request });
  }

  uploadChannelFile(
    request?: UploadChannelFileRequest,
  ): Promise<StreamResponse<UploadChannelFileResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.uploadChannelFile({ id: this.id, type: this.type, ...request });
  }

  hide(request?: HideChannelRequest): Promise<StreamResponse<HideChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.hideChannel({ id: this.id, type: this.type, ...request });
  }

  deleteChannelImage(request?: { url?: string }): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.deleteChannelImage({ id: this.id, type: this.type, ...request });
  }

  uploadChannelImage(
    request?: UploadChannelRequest,
  ): Promise<StreamResponse<UploadChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.uploadChannelImage({ id: this.id, type: this.type, ...request });
  }

  updateMemberPartial(
    request?: UpdateMemberPartialRequest,
  ): Promise<StreamResponse<UpdateMemberPartialResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.updateMemberPartial({ id: this.id, type: this.type, ...request });
  }

  sendMessage(request: SendMessageRequest): Promise<StreamResponse<SendMessageResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.sendMessage({ id: this.id, type: this.type, ...request });
  }

  getManyMessages(request: {
    ids: Array<string>;
  }): Promise<StreamResponse<GetManyMessagesResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getManyMessages({ id: this.id, type: this.type, ...request });
  }

  getOrCreate(
    request?: ChannelGetOrCreateRequest & { connection_id?: string },
  ): Promise<StreamResponse<ChannelStateResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.getOrCreateChannel({ id: this.id, type: this.type, ...request });
  }

  markRead(request?: MarkReadRequest): Promise<StreamResponse<MarkReadResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.markRead({ id: this.id, type: this.type, ...request });
  }

  show(request?: ShowChannelRequest): Promise<StreamResponse<ShowChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.showChannel({ id: this.id, type: this.type, ...request });
  }

  stopWatching(
    request?: ChannelStopWatchingRequest & { connection_id?: string },
  ): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.stopWatchingChannel({ id: this.id, type: this.type, ...request });
  }

  truncate(
    request?: TruncateChannelRequest,
  ): Promise<StreamResponse<TruncateChannelResponse>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.truncateChannel({ id: this.id, type: this.type, ...request });
  }

  markUnread(request?: MarkUnreadRequest): Promise<StreamResponse<Response>> {
    if (!this.id) {
      throw new Error(
        `Channel isn't yet created, call getOrCreateDistinctChannel() before this operation`,
      );
    }

    return this.chatApi.markUnread({ id: this.id, type: this.type, ...request });
  }
}
