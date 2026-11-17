import { SCHEDULED_MESSAGE_STATUS } from './constants';
import { isScheduledMessageNotFoundError } from './errors';
import { sanitizeOutgoingAttachments } from '../utils';
import type { Channel } from '../channel';
import type {
  ScheduledMessageResponse,
  SendMessageRequest,
  SendMessageResponse,
  UpdateScheduledMessageRequest,
} from '../gen/models';
import type { StreamResponse } from '../types';
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

export class ScheduledMessageOperations {
  private readonly channel: Channel;

  constructor({ channel }: ScheduledMessageOperationsOptions) {
    this.channel = channel;
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

  private runRequest<TParams, TResponse>(
    handler: ScheduledMessageRequestFn<TParams, TResponse> | undefined,
    defaultRequest: DefaultScheduledMessageRequest<TParams, TResponse>,
    params: TParams,
  ) {
    return handler ? handler(params, defaultRequest) : defaultRequest(params);
  }

  private async cancelWhenNotFound<TResult>(
    id: string,
    request: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await request();
    } catch (error) {
      const stored = this.client.scheduledMessageStore.get(id);
      if (isScheduledMessageNotFoundError(error) && stored) {
        this.ingest({ ...stored, status: SCHEDULED_MESSAGE_STATUS.Canceled });
      }
      throw error;
    }
  }

  private requestUpdate = ({ id, request }: UpdateScheduledMessageRequestParams) =>
    this.client.updateScheduledMessage({ id }, request);

  private requestDelete = ({ id }: ScheduledMessageIdRequestParams) =>
    this.client.deleteScheduledMessage({ id });

  private requestSendNow = ({ id }: ScheduledMessageIdRequestParams) =>
    this.client.sendScheduledMessageNow({ id });

  async schedule(
    request: SendMessageRequest,
  ): Promise<StreamResponse<SendMessageResponse>> {
    const sanitizedRequest = {
      ...request,
      message: sanitizeOutgoingAttachments(request.message),
    };

    const response = await this.runRequest(
      this.requestHandlers.scheduleMessageRequest,
      (params) => this.channel.sendMessage(params),
      sanitizedRequest,
    );

    if (response.scheduled_message) this.ingest(response.scheduled_message);

    return response;
  }

  async update(
    id: string,
    request: UpdateScheduledMessageRequest,
  ): Promise<ScheduledMessageResponse> {
    const { message } = request;
    const sanitizedRequest = message
      ? { ...request, message: sanitizeOutgoingAttachments(message) }
      : request;

    const { scheduled_message: scheduledMessage } = await this.cancelWhenNotFound(
      id,
      () =>
        this.runRequest(
          this.requestHandlers.updateScheduledMessageRequest,
          this.requestUpdate,
          {
            id,
            request: sanitizedRequest,
          },
        ),
    );

    this.ingest(scheduledMessage);

    return scheduledMessage;
  }

  async cancel(id: string): Promise<ScheduledMessageResponse> {
    const { scheduled_message: scheduledMessage } = await this.cancelWhenNotFound(
      id,
      () =>
        this.runRequest(
          this.requestHandlers.deleteScheduledMessageRequest,
          this.requestDelete,
          {
            id,
          },
        ),
    );

    this.ingest({ ...scheduledMessage, status: SCHEDULED_MESSAGE_STATUS.Canceled });

    return scheduledMessage;
  }

  async sendNow(id: string): Promise<ScheduledMessageResponse> {
    const { scheduled_message: scheduledMessage } = await this.cancelWhenNotFound(
      id,
      () =>
        this.runRequest(
          this.requestHandlers.sendScheduledMessageNowRequest,
          this.requestSendNow,
          { id },
        ),
    );

    this.ingest(scheduledMessage);

    return scheduledMessage;
  }
}
