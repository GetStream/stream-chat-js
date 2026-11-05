import { StateStore } from '@stream-io/state-store';
import { EntityStore } from '../entityStore/EntityStore';
import { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';
import { sanitizeOutgoingAttachments } from '../utils';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import {
  SCHEDULED_MESSAGE_STATUS,
  ScheduledMessageErrorReason,
  ScheduledMessageEventType,
} from './constants';
import {
  getScheduledMessageErrorReason,
  isScheduledMessageNotFoundError,
} from './errors';
import type { StreamChat } from '../client';
import type {
  ScheduledMessageResponse,
  ScheduledMessageStatus,
  UpdateScheduledMessageRequest,
} from '../gen/models';
import type {
  ScheduledMessageEvent,
  ScheduledMessageManagerOptions,
  ScheduledMessageManagerState,
} from './types';

const UPSERT_EVENT_TYPES = [
  ScheduledMessageEventType.Created,
  ScheduledMessageEventType.Failed,
  ScheduledMessageEventType.Updated,
] as const;

const REMOVE_EVENT_TYPES = [
  ScheduledMessageEventType.Deleted,
  ScheduledMessageEventType.Sent,
] as const;

const FINISHED_STATUSES = new Set<ScheduledMessageStatus>([
  SCHEDULED_MESSAGE_STATUS.Canceled,
  SCHEDULED_MESSAGE_STATUS.Sent,
]);

const isFinished = ({ status }: ScheduledMessageResponse) =>
  FINISHED_STATUSES.has(status);

const isNewerThan = (
  current: ScheduledMessageResponse,
  incoming: ScheduledMessageResponse,
) => current.updated_at > incoming.updated_at;

const isDisabledError = (error: Error | undefined) =>
  !!error &&
  getScheduledMessageErrorReason(error) === ScheduledMessageErrorReason.Disabled;

const createInitialState = (): ScheduledMessageManagerState => ({
  isDisabled: false,
});

export class ScheduledMessageManager extends WithSubscriptions {
  private client: StreamChat;
  private removedIds = new Set<string>();
  private receivedVersion = 0;
  private receivedVersions = new Map<string, number>();
  private hydratedCids = new Set<string>();
  private channelPaginators = new Map<string, ScheduledMessagePaginator>();
  private paginatorUnsubscribeFunctions: Array<() => void> = [];

  public readonly store = new EntityStore<ScheduledMessageResponse>({
    getEntityId: ({ id }) => id,
    releaseOnLastUnlink: false,
  });
  public paginator: ScheduledMessagePaginator;
  public state: StateStore<ScheduledMessageManagerState>;

  constructor({ client }: ScheduledMessageManagerOptions) {
    super();

    this.client = client;
    this.state = new StateStore<ScheduledMessageManagerState>(createInitialState());
    this.paginator = this.createPaginator();
    this.watchQueryErrors(this.paginator);
  }

  private resolveLatest = (incoming: ScheduledMessageResponse) => {
    if (this.removedIds.has(incoming.id)) return undefined;

    const current = this.store.get(incoming.id);

    const latest = current && isNewerThan(current, incoming) ? current : incoming;

    return latest;
  };

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

  private handleUpsertEvent = (event: ScheduledMessageEvent) => {
    if (!event.scheduled_message) return;

    this.upsertToState(event.scheduled_message);
  };

  private handleRemoveEvent = (event: ScheduledMessageEvent) => {
    if (!event.scheduled_message) return;

    this.removeFromState(event.scheduled_message.id);
  };

  private subscribeToEvents = (
    eventTypes: ReadonlyArray<ScheduledMessageEventType>,
    handleEvent: (event: ScheduledMessageEvent) => void,
  ) => {
    const unsubscribeFunctions = eventTypes.map(
      (eventType) => this.client.on(eventType, handleEvent).unsubscribe,
    );

    const unsubscribeAll = () =>
      unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());

    return unsubscribeAll;
  };

  private reloadWhenRecovered = () =>
    this.client.on('connection.recovered', () => {
      const loadedPaginators = this.paginators.filter(
        ({ isInitialized }) => isInitialized,
      );

      loadedPaginators.forEach((paginator) => paginator.reload());
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

  public getChannelPaginator = (cid: string) => {
    const existingPaginator = this.channelPaginators.get(cid);

    if (existingPaginator) return existingPaginator;

    const paginator = this.createPaginator(cid);
    this.channelPaginators.set(cid, paginator);
    this.watchQueryErrors(paginator);

    if (this.hydratedCids.has(cid)) paginator.setCompleteList(this.store.values());

    return paginator;
  };

  public getFromState = (id: string) => this.store.get(id);

  public upsertToState = (scheduledMessage: ScheduledMessageResponse) => {
    if (isFinished(scheduledMessage)) {
      this.removeFromState(scheduledMessage.id);
      return;
    }

    if (this.resolveLatest(scheduledMessage) !== scheduledMessage) return;

    this.ingest(scheduledMessage);
  };

  public removeFromState = (id: string) => {
    this.removedIds.add(id);
    this.store.remove(id);
  };

  public hydrateChannelState = (
    cid: string,
    scheduledMessages?: ScheduledMessageResponse[],
    requestedAtVersion?: number,
  ) => {
    if (!Array.isArray(scheduledMessages)) return;

    const snapshotMessages = scheduledMessages
      .filter((scheduledMessage) => !isFinished(scheduledMessage))
      .map(this.resolveLatest)
      .filter((scheduledMessage) => scheduledMessage !== undefined);
    const snapshotIds = new Set(snapshotMessages.map(({ id }) => id));

    const isMissingFromSnapshot = ({ cid: messageCid, id }: ScheduledMessageResponse) =>
      messageCid === cid &&
      !snapshotIds.has(id) &&
      !this.isReceivedSince(id, requestedAtVersion);

    const missingMessages = this.store.values().filter(isMissingFromSnapshot);

    this.store.transaction(() => {
      missingMessages.forEach(({ id }) => this.store.remove(id));
      snapshotMessages.forEach(this.ingest);
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

    this.removedIds.clear();
    this.receivedVersions.clear();
    this.hydratedCids.clear();
    this.store.clear();

    this.paginator = this.createPaginator();
    this.watchQueryErrors(this.paginator);
    this.state.next(createInitialState());
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(
      this.subscribeToEvents(UPSERT_EVENT_TYPES, this.handleUpsertEvent),
    );
    this.addUnsubscribeFunction(
      this.subscribeToEvents(REMOVE_EVENT_TYPES, this.handleRemoveEvent),
    );
    this.addUnsubscribeFunction(this.reloadWhenRecovered());
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

    this.removeFromState(id);

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
