import { ScheduledMessageStatePolicy } from './ScheduledMessageStatePolicy';
import { sanitizeOutgoingAttachments } from '../utils';
import { settlePendingAttachmentUploads } from '../messageOperations/settlePendingAttachmentUploads';
import type { ScheduledMessageOperationKind } from './ScheduledMessageStatePolicy';
import type { Channel } from '../channel';
import type {
  MessageRequest,
  ScheduledMessageResponse,
  SendMessageRequest,
  SendMessageResponse,
  UpdateScheduledMessageRequest,
} from '../gen/models';
import type { LocalMessage, SendMessageOptions, StreamResponse } from '../types';
import type {
  DefaultScheduledMessageRequest,
  ScheduledMessageIdRequestParams,
  ScheduledMessageRequestFn,
  ScheduledMessageRequestHandlers,
  UpdateScheduledMessageRequestParams,
} from './types';

export type ScheduledMessageOperationsOptions = {
  channel: Channel;
};

export type ScheduleMessageParams = {
  message: MessageRequest;
  options?: SendMessageOptions;
  localMessage?: LocalMessage;
};

export type UpdateScheduledMessageParams = {
  request: UpdateScheduledMessageRequest;
  localMessage?: LocalMessage;
};

export class ScheduledMessageOperations {
  private readonly channel: Channel;
  private readonly policy: ScheduledMessageStatePolicy;

  constructor({ channel }: ScheduledMessageOperationsOptions) {
    this.channel = channel;
    this.policy = new ScheduledMessageStatePolicy({
      ingest: (scheduledMessage) => this.ingest(scheduledMessage),
      get: (id) => this.client.scheduledMessageStore.get(id),
    });
  }

  private get client() {
    return this.channel.getClient();
  }

  private get requestHandlers(): ScheduledMessageRequestHandlers {
    return this.channel.configState.getLatestValue().requestHandlers ?? {};
  }

  ingest(scheduledMessage: ScheduledMessageResponse) {
    this.channel.scheduledMessagesPaginator.ingestItem(scheduledMessage);
    this.client.scheduledMessagePaginators.ingest(scheduledMessage);
  }

  private resolveRequest<TParams, TResponse>(
    handler: ScheduledMessageRequestFn<TParams, TResponse> | undefined,
    defaultRequest: DefaultScheduledMessageRequest<TParams, TResponse>,
    params: TParams,
  ) {
    return handler ? handler(params, defaultRequest) : defaultRequest(params);
  }

  private async withSettledUploads(
    localMessage: LocalMessage,
    message: MessageRequest,
  ): Promise<MessageRequest> {
    const attachments = localMessage.attachments;
    if (!attachments?.length) return message;

    const { attachments: settled, failureReason } = await settlePendingAttachmentUploads({
      attachments,
      channelCid: this.channel.cid,
      client: this.client,
    });
    if (failureReason) throw failureReason;
    if (settled === attachments) return message;

    return { ...message, attachments: settled };
  }

  private async run<R extends { scheduled_message?: ScheduledMessageResponse }>(
    kind: ScheduledMessageOperationKind,
    id: string | undefined,
    doRequest: () => Promise<R>,
  ): Promise<R> {
    try {
      const response = await doRequest();
      this.policy.success(kind, response.scheduled_message);
      return response;
    } catch (error) {
      this.policy.failure(kind, id, error);
      throw error;
    }
  }

  private requestUpdate = ({ id, request }: UpdateScheduledMessageRequestParams) =>
    this.client.updateScheduledMessage({ id }, request);

  private requestDelete = ({ id }: ScheduledMessageIdRequestParams) =>
    this.client.deleteScheduledMessage({ id });

  private requestSendNow = ({ id }: ScheduledMessageIdRequestParams) =>
    this.client.sendScheduledMessageNow({ id });

  async schedule({
    localMessage,
    message,
    options,
  }: ScheduleMessageParams): Promise<StreamResponse<SendMessageResponse>> {
    const settledMessage = localMessage
      ? await this.withSettledUploads(localMessage, message)
      : message;

    const request: SendMessageRequest = {
      ...options,
      message: sanitizeOutgoingAttachments(settledMessage),
    };

    return this.run('schedule', undefined, () =>
      this.resolveRequest(
        this.requestHandlers.scheduleMessageRequest,
        (params) => this.channel.sendMessage(params),
        request,
      ),
    );
  }

  async update(
    id: string,
    { localMessage, request }: UpdateScheduledMessageParams,
  ): Promise<ScheduledMessageResponse> {
    const settledMessage =
      localMessage && request.message
        ? await this.withSettledUploads(localMessage, request.message)
        : request.message;

    const sanitizedRequest = settledMessage
      ? { ...request, message: sanitizeOutgoingAttachments(settledMessage) }
      : request;

    const { scheduled_message: scheduledMessage } = await this.run('update', id, () =>
      this.resolveRequest(
        this.requestHandlers.updateScheduledMessageRequest,
        this.requestUpdate,
        { id, request: sanitizedRequest },
      ),
    );

    return scheduledMessage;
  }

  async cancel(id: string): Promise<ScheduledMessageResponse> {
    const { scheduled_message: scheduledMessage } = await this.run('cancel', id, () =>
      this.resolveRequest(
        this.requestHandlers.deleteScheduledMessageRequest,
        this.requestDelete,
        { id },
      ),
    );

    return scheduledMessage;
  }

  async sendNow(id: string): Promise<ScheduledMessageResponse> {
    const { scheduled_message: scheduledMessage } = await this.run('sendNow', id, () =>
      this.resolveRequest(
        this.requestHandlers.sendScheduledMessageNowRequest,
        this.requestSendNow,
        { id },
      ),
    );

    return scheduledMessage;
  }
}
