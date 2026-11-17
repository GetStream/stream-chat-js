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

/**
 * The request lifecycle for a channel's scheduled messages: schedule, update, cancel and send-now.
 *
 * Sibling of `MessageOperations`. It owns everything that is not composition: request-handler
 * resolution (`ChannelConfig.requestHandlers`), attachment sanitizing, the "server no longer has it
 * → cancel it locally" rule, and the single fan-out seam ({@link ScheduledMessageOperations.ingest})
 * into the channel's own list and the registered cross-channel lists. `Channel` keeps only thin
 * delegations to these methods.
 */
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

  /**
   * Ingests an action's result into the channel's list and the registered ones; each decides whether
   * and where it belongs. The event the server echoes carries the same `updated_at`, so the store
   * takes it as a tie and nothing reorders.
   */
  ingest(scheduledMessage: ScheduledMessageResponse) {
    this.channel.scheduledMessagesPaginator.ingestItem(scheduledMessage);
    this.client.scheduledMessagePaginators.ingest(scheduledMessage);
  }

  /** Runs the integrator's handler for the operation when set, else the default request. */
  private runRequest<TParams, TResponse>(
    handler: ScheduledMessageRequestFn<TParams, TResponse> | undefined,
    defaultRequest: DefaultScheduledMessageRequest<TParams, TResponse>,
    params: TParams,
  ) {
    return handler ? handler(params, defaultRequest) : defaultRequest(params);
  }

  /** Removes the message from the lists when the server no longer has it, then rethrows. */
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

  /** Sends a message with `scheduled_at`, through `requestHandlers.scheduleMessageRequest` if set. */
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

  /** Edits a scheduled message, through `requestHandlers.updateScheduledMessageRequest` if set. */
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

  /** Cancels a scheduled message, through `requestHandlers.deleteScheduledMessageRequest` if set. */
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

  /** Sends a scheduled message now, through `requestHandlers.sendScheduledMessageNowRequest` if set. */
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
