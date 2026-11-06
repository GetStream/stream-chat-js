import { StateStore } from '@stream-io/state-store';
import { EntityStore } from '../entityStore/EntityStore';
import { EventHandlerPipeline } from '../EventHandlerPipeline';
import { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';
import { sanitizeOutgoingAttachments } from '../utils';
import type { DeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import { SCHEDULED_MESSAGE_STATUS, ScheduledMessageErrorReason } from './constants';
import {
  getScheduledMessageErrorReason,
  isScheduledMessageNotFoundError,
} from './errors';
import { DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS } from './eventHandlers';
import type { Unsubscribe } from '@stream-io/state-store';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type {
  ScheduledMessageResponse,
  ScheduledMessageStatus,
  SendMessageRequest,
  UpdateScheduledMessageRequest,
} from '../gen/models';
import type {
  AddScheduledMessageEventHandlerParams,
  DefaultScheduledMessageRequest,
  RemoveScheduledMessageEventHandlersParams,
  ScheduledMessageIdRequestParams,
  ScheduledMessageManagerConfig,
  ScheduledMessageManagerEventHandlerContext,
  ScheduledMessageManagerEventHandlers,
  ScheduledMessageManagerEventType,
  ScheduledMessageManagerOptions,
  ScheduledMessageManagerState,
  ScheduledMessageRequestFn,
  ScheduledMessageRequestHandlers,
  SetScheduledMessageEventHandlersParams,
  UpdateScheduledMessageRequestParams,
} from './types';

type ScheduledMessageEventHandlerPipeline =
  EventHandlerPipeline<ScheduledMessageManagerEventHandlerContext>;

const FINISHED_STATUSES = new Set<ScheduledMessageStatus>([
  SCHEDULED_MESSAGE_STATUS.Canceled,
  SCHEDULED_MESSAGE_STATUS.Sent,
]);

const isFinished = ({ status }: ScheduledMessageResponse) =>
  FINISHED_STATUSES.has(status);

const isAtLeastAsNewAs = (
  incoming: ScheduledMessageResponse,
  current: ScheduledMessageResponse,
) => incoming.updated_at >= current.updated_at;

const isDisabledError = (error: Error | undefined) =>
  !!error &&
  getScheduledMessageErrorReason(error) === ScheduledMessageErrorReason.Disabled;

const createInitialState = (): ScheduledMessageManagerState => ({
  isDisabled: false,
});

export class ScheduledMessageManager extends WithSubscriptions {
  private client: StreamChat;
  private receivedVersion = 0;
  private receivedVersions = new Map<string, number>();
  private hydratedCids = new Set<string>();
  private paginatorConfig: DeclarativePaginatorConfig | undefined;
  private channelPaginators = new Map<string, ScheduledMessagePaginator>();
  private paginatorUnsubscribeFunctions: Array<() => void> = [];
  private eventHandlerPipelines = new Map<
    ScheduledMessageManagerEventType,
    ScheduledMessageEventHandlerPipeline
  >();

  public readonly store = new EntityStore<ScheduledMessageResponse>({
    getEntityId: ({ id }) => id,
    releaseOnLastUnlink: false,
  });
  public paginator: ScheduledMessagePaginator;
  public state: StateStore<ScheduledMessageManagerState>;

  constructor({
    client,
    eventHandlers = ScheduledMessageManager.getDefaultHandlers(),
  }: ScheduledMessageManagerOptions) {
    super();

    this.client = client;
    this.state = new StateStore<ScheduledMessageManagerState>(createInitialState());
    this.paginator = this.createPaginator();
    this.watchQueryErrors(this.paginator);

    Object.entries(eventHandlers).forEach(([eventType, handlers = []]) =>
      this.ensurePipeline(eventType).replaceAll(handlers),
    );
  }

  private resolveLatest = (incoming: ScheduledMessageResponse) => {
    const current = this.store.get(incoming.id);

    if (!current) return incoming;

    if (isFinished(current)) return current;

    if (isFinished(incoming)) return incoming;

    const latest = isAtLeastAsNewAs(incoming, current) ? incoming : current;

    return latest;
  };

  private finish = (
    scheduledMessage: ScheduledMessageResponse,
    status: ScheduledMessageStatus,
  ) => this.upsertToState({ ...scheduledMessage, status });

  private isReceivedSince = (id: string, requestedAtVersion?: number) => {
    if (requestedAtVersion === undefined) return false;

    const receivedVersion = this.receivedVersions.get(id);

    return receivedVersion !== undefined && receivedVersion > requestedAtVersion;
  };

  private updateIsDisabled = () => {
    const isDisabled = this.paginators.some(({ lastQueryError }) =>
      isDisabledError(lastQueryError),
    );

    this.state.partialNext({ isDisabled });
  };

  private createPaginator = (cid?: string) =>
    new ScheduledMessagePaginator({
      cid,
      client: this.client,
      paginatorOptions: { declarativeConfig: this.paginatorConfig },
      resolveLatest: this.resolveLatest,
      store: this.store,
    });

  private watchQueryErrors = (paginator: ScheduledMessagePaginator) => {
    const unsubscribe = paginator.state.subscribeWithSelector(
      ({ lastQueryError }) => ({ lastQueryError }),
      this.updateIsDisabled,
    );

    this.paginatorUnsubscribeFunctions.push(unsubscribe);
  };

  private ingest = (scheduledMessage: ScheduledMessageResponse) => {
    this.paginators.forEach((paginator) => paginator.ingestItem(scheduledMessage));
    this.store.upsert(scheduledMessage);

    this.receivedVersion += 1;
    this.receivedVersions.set(scheduledMessage.id, this.receivedVersion);
  };

  private get eventHandlerContext(): ScheduledMessageManagerEventHandlerContext {
    return { scheduledMessageManager: this };
  }

  private runEventHandlers = () =>
    this.client.on((event) => {
      const pipeline = this.eventHandlerPipelines.get(event.type);

      pipeline?.run(event, this.eventHandlerContext);
    }).unsubscribe;

  private forgetHydrationWhenDisconnected = () =>
    this.client.wsConnection.state.subscribeWithSelector(
      ({ isHealthy }) => ({ isHealthy }),
      ({ isHealthy }) => {
        if (!isHealthy) this.hydratedCids.clear();
      },
    );

  private isRefreshedByHydration = ({ cid }: ScheduledMessagePaginator) =>
    !!cid && this.hydratedCids.has(cid);

  private reloadPaginators = async (paginators: ScheduledMessagePaginator[]) => {
    await Promise.allSettled(paginators.map((paginator) => paginator.reload()));
  };

  private getRequestHandlers = (cid?: string): ScheduledMessageRequestHandlers => {
    const channel = cid ? this.client.channelManager.get(cid) : undefined;

    const requestHandlers =
      channel?.configState.getLatestValue().requestHandlers ??
      this.client.config.getConfig('channel')?.requestHandlers ??
      {};

    return requestHandlers;
  };

  private getRequestHandlersFor = (id: string) =>
    this.getRequestHandlers(this.store.get(id)?.cid);

  private sendRequest = <TParams, TResponse>(
    handler: ScheduledMessageRequestFn<TParams, TResponse> | undefined,
    defaultRequest: DefaultScheduledMessageRequest<TParams, TResponse>,
    params: TParams,
  ) => (handler ? handler(params, defaultRequest) : defaultRequest(params));

  private requestUpdate = ({ id, request }: UpdateScheduledMessageRequestParams) =>
    this.client.updateScheduledMessage({ id }, request);

  private requestDelete = ({ id }: ScheduledMessageIdRequestParams) =>
    this.client.deleteScheduledMessage({ id });

  private requestSendNow = ({ id }: ScheduledMessageIdRequestParams) =>
    this.client.sendScheduledMessageNow({ id });

  private removeWhenNotFound = async <TResult>(
    id: string,
    request: () => Promise<TResult>,
  ): Promise<TResult> => {
    try {
      return await request();
    } catch (error) {
      if (isScheduledMessageNotFoundError(error)) this.removeFromState(id);

      throw error;
    }
  };

  public get version() {
    return this.receivedVersion;
  }

  public get paginators() {
    return [this.paginator, ...this.channelPaginators.values()];
  }

  public get pipelines() {
    return this.eventHandlerPipelines;
  }

  public static getDefaultHandlers(): ScheduledMessageManagerEventHandlers {
    const defaultHandlers = Object.fromEntries(
      Object.entries(DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS).map(
        ([eventType, handlers = []]) => [eventType, [...handlers]],
      ),
    );

    return defaultHandlers;
  }

  public ensurePipeline = (eventType: ScheduledMessageManagerEventType) => {
    const existingPipeline = this.eventHandlerPipelines.get(eventType);

    if (existingPipeline) return existingPipeline;

    const pipeline: ScheduledMessageEventHandlerPipeline = new EventHandlerPipeline({
      id: `ScheduledMessageManager:${eventType}`,
    });
    this.eventHandlerPipelines.set(eventType, pipeline);

    return pipeline;
  };

  public addEventHandler = ({
    eventType,
    ...payload
  }: AddScheduledMessageEventHandlerParams): Unsubscribe =>
    this.ensurePipeline(eventType).insert(payload);

  public setEventHandlers = ({
    eventType,
    handlers,
  }: SetScheduledMessageEventHandlersParams) =>
    this.ensurePipeline(eventType).replaceAll(handlers);

  public removeEventHandlers = ({
    eventType,
    handlers,
  }: RemoveScheduledMessageEventHandlersParams) => {
    const pipeline = this.eventHandlerPipelines.get(eventType);

    handlers.forEach((params) => pipeline?.remove(params));
  };

  public initializeConfig = (config?: ScheduledMessageManagerConfig) => {
    this.paginatorConfig = config?.paginator;

    this.paginators.forEach((paginator) =>
      paginator.initializeConfig(this.paginatorConfig),
    );
  };

  public reload = async () => {
    const loadedPaginators = this.paginators.filter(({ isInitialized }) => isInitialized);

    await this.reloadPaginators(loadedPaginators);
  };

  public recover = async () => {
    const stalePaginators = this.paginators.filter(
      (paginator) => paginator.isInitialized && !this.isRefreshedByHydration(paginator),
    );

    await this.reloadPaginators(stalePaginators);
  };

  public getChannelPaginator = (cid: string) => {
    const existingPaginator = this.channelPaginators.get(cid);

    if (existingPaginator) return existingPaginator;

    const paginator = this.createPaginator(cid);
    this.channelPaginators.set(cid, paginator);
    this.watchQueryErrors(paginator);

    if (this.hydratedCids.has(cid)) paginator.setCompleteList(this.store.values());

    return paginator;
  };

  public getFromState = (id: string) => {
    const scheduledMessage = this.store.get(id);

    return scheduledMessage && !isFinished(scheduledMessage)
      ? scheduledMessage
      : undefined;
  };

  public upsertToState = (scheduledMessage: ScheduledMessageResponse) => {
    if (this.resolveLatest(scheduledMessage) !== scheduledMessage) return;

    this.ingest(scheduledMessage);
  };

  public removeFromState = (id: string) => {
    const scheduledMessage = this.store.get(id);

    if (scheduledMessage)
      this.finish(scheduledMessage, SCHEDULED_MESSAGE_STATUS.Canceled);
  };

  public hydrateChannelState = (
    cid: string,
    scheduledMessages?: ScheduledMessageResponse[],
    requestedAtVersion?: number,
  ) => {
    if (!Array.isArray(scheduledMessages)) return;

    const snapshotIds = new Set(scheduledMessages.map(({ id }) => id));

    const isMissingFromSnapshot = (scheduledMessage: ScheduledMessageResponse) =>
      scheduledMessage.cid === cid &&
      !isFinished(scheduledMessage) &&
      !snapshotIds.has(scheduledMessage.id) &&
      !this.isReceivedSince(scheduledMessage.id, requestedAtVersion);

    const missingMessages = this.store.values().filter(isMissingFromSnapshot);

    this.store.transaction(() => {
      missingMessages.forEach((scheduledMessage) =>
        this.finish(scheduledMessage, SCHEDULED_MESSAGE_STATUS.Canceled),
      );
      scheduledMessages.forEach(this.upsertToState);
    });

    this.hydratedCids.add(cid);
    this.channelPaginators.get(cid)?.setCompleteList(this.store.values());
  };

  public resetState = () => {
    this.paginatorUnsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
    this.paginatorUnsubscribeFunctions = [];
    this.channelPaginators.forEach((paginator) => paginator.dispose());
    this.channelPaginators.clear();
    this.paginator.dispose();

    this.receivedVersions.clear();
    this.hydratedCids.clear();
    this.store.clear();

    this.paginator = this.createPaginator();
    this.watchQueryErrors(this.paginator);
    this.state.next(createInitialState());
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(this.runEventHandlers());
    this.addUnsubscribeFunction(this.forgetHydrationWhenDisconnected());
  };

  public scheduleMessage = async (channel: Channel, request: SendMessageRequest) => {
    const { scheduleMessageRequest } = this.getRequestHandlers(channel.cid);
    const sanitizedRequest = {
      ...request,
      message: sanitizeOutgoingAttachments(request.message),
    };

    const response = await this.sendRequest(
      scheduleMessageRequest,
      (params) => channel.sendMessage(params),
      sanitizedRequest,
    );

    if (response.scheduled_message) this.upsertToState(response.scheduled_message);

    return response;
  };

  public updateScheduledMessage = async (
    id: string,
    request: UpdateScheduledMessageRequest,
  ) => {
    const { updateScheduledMessageRequest } = this.getRequestHandlersFor(id);
    const { message } = request;
    const sanitizedRequest = message
      ? { ...request, message: sanitizeOutgoingAttachments(message) }
      : request;

    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () =>
        this.sendRequest(updateScheduledMessageRequest, this.requestUpdate, {
          id,
          request: sanitizedRequest,
        }),
    );

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };

  public deleteScheduledMessage = async (id: string) => {
    const { deleteScheduledMessageRequest } = this.getRequestHandlersFor(id);

    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.sendRequest(deleteScheduledMessageRequest, this.requestDelete, { id }),
    );

    this.finish(scheduledMessage, SCHEDULED_MESSAGE_STATUS.Canceled);

    return scheduledMessage;
  };

  public sendScheduledMessageNow = async (id: string) => {
    const { sendScheduledMessageNowRequest } = this.getRequestHandlersFor(id);

    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.sendRequest(sendScheduledMessageNowRequest, this.requestSendNow, { id }),
    );

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };
}
