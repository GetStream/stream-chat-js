import { StateStore } from '@stream-io/state-store';
import { EntityStore } from '../entityStore/EntityStore';
import { EventHandlerPipeline } from '../EventHandlerPipeline';
import { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';
import { sanitizeOutgoingAttachments } from '../utils';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import { SCHEDULED_MESSAGE_STATUS, ScheduledMessageErrorReason } from './constants';
import {
  getScheduledMessageErrorReason,
  isScheduledMessageNotFoundError,
} from './errors';
import { DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS } from './eventHandlers';
import type { Unsubscribe } from '@stream-io/state-store';
import type { StreamChat } from '../client';
import type {
  ScheduledMessageResponse,
  ScheduledMessageStatus,
  UpdateScheduledMessageRequest,
} from '../gen/models';
import type {
  AddScheduledMessageEventHandlerParams,
  RemoveScheduledMessageEventHandlersParams,
  ScheduledMessageManagerEventHandlerContext,
  ScheduledMessageManagerEventHandlers,
  ScheduledMessageManagerEventType,
  ScheduledMessageManagerOptions,
  ScheduledMessageManagerState,
  SetScheduledMessageEventHandlersParams,
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

  public reload = async () => {
    const loadedPaginators = this.paginators.filter(({ isInitialized }) => isInitialized);

    await Promise.allSettled(loadedPaginators.map((paginator) => paginator.reload()));
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

  public updateScheduledMessage = async (
    id: string,
    request: UpdateScheduledMessageRequest,
  ) => {
    const { message } = request;
    const sanitizedRequest = message
      ? { ...request, message: sanitizeOutgoingAttachments(message) }
      : request;

    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.client.updateScheduledMessage({ id }, sanitizedRequest),
    );

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };

  public deleteScheduledMessage = async (id: string) => {
    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.client.deleteScheduledMessage({ id }),
    );

    this.finish(scheduledMessage, SCHEDULED_MESSAGE_STATUS.Canceled);

    return scheduledMessage;
  };

  public sendScheduledMessageNow = async (id: string) => {
    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.client.sendScheduledMessageNow({ id }),
    );

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };
}
