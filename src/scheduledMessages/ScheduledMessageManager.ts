import { StateStore } from '../store';
import { withCancellation } from '../utils/concurrency';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import {
  ScheduledMessageErrorReason,
  ScheduledMessageEventType,
  ScheduledMessageStatus,
} from '../types';
import {
  getScheduledMessageErrorReason,
  isScheduledMessageNotFoundError,
} from './errors';
import type { StreamChat } from '../client';
import type {
  Event,
  EventHandler,
  EventTypes,
  QueryScheduledMessagesOptions,
  QueryScheduledMessagesResponse,
  ScheduledMessageResponse,
  UpdateScheduledMessageOptions,
} from '../types';
import type {
  ScheduledMessageEvent,
  ScheduledMessageManagerOptions,
  ScheduledMessageManagerState,
  ScheduledMessageMap,
  ScheduledMessageQueryResultHandler,
} from './types';

export const SCHEDULED_MESSAGES_LOAD_LIMIT = 100;

const CANCELED = 'canceled';

const UPSERT_EVENT_TYPES: EventTypes[] = [
  ScheduledMessageEventType.Created,
  ScheduledMessageEventType.Failed,
  ScheduledMessageEventType.Updated,
];

const REMOVE_EVENT_TYPES: EventTypes[] = [
  ScheduledMessageEventType.Deleted,
  ScheduledMessageEventType.Sent,
];

const FINISHED_STATUSES = new Set<ScheduledMessageStatus>([
  ScheduledMessageStatus.Canceled,
  ScheduledMessageStatus.Sent,
]);

const isFinished = ({ status }: ScheduledMessageResponse) =>
  FINISHED_STATUSES.has(status);

const isNewerThan = (
  current: ScheduledMessageResponse,
  incoming: ScheduledMessageResponse,
) => Date.parse(current.updated_at) > Date.parse(incoming.updated_at);

const byScheduledAt = (a: ScheduledMessageResponse, b: ScheduledMessageResponse) =>
  Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || a.id.localeCompare(b.id);

const isChannelMessage = (scheduledMessage: ScheduledMessageResponse, cid: string) => {
  const { cid: messageCid, message } = scheduledMessage;

  return messageCid === cid && !message.parent_id;
};

const isThreadReply = (scheduledMessage: ScheduledMessageResponse, parentId: string) => {
  const { message } = scheduledMessage;

  return message.parent_id === parentId;
};

const isInSnapshotScope = (scheduledMessage: ScheduledMessageResponse, cid?: string) =>
  !cid || scheduledMessage.cid === cid;

type SnapshotScope = {
  cid?: string;
  requestedAtVersion?: number;
};

const createInitialState = (): ScheduledMessageManagerState => ({
  isDisabled: false,
  isLoaded: false,
  isLoading: false,
  lastQueryError: undefined,
  next: undefined,
  scheduledMessages: new Map(),
});

export class ScheduledMessageManager extends WithSubscriptions {
  private client: StreamChat;
  private removedIds = new Set<string>();
  private receivedVersion = 0;
  private receivedVersions = new Map<string, number>();
  private loadTag = Symbol('ScheduledMessageManager.load');

  public state: StateStore<ScheduledMessageManagerState>;

  constructor({ client }: ScheduledMessageManagerOptions) {
    super();

    this.client = client;
    this.state = new StateStore<ScheduledMessageManagerState>(createInitialState());
  }

  private isOutdated = (
    incoming: ScheduledMessageResponse,
    scheduledMessages: ScheduledMessageMap,
  ) => {
    const { id } = incoming;
    const current = scheduledMessages.get(id);

    const isRemoved = this.removedIds.has(id);
    const isOlderThanCurrent = !!current && isNewerThan(current, incoming);

    return isRemoved || isOlderThanCurrent;
  };

  private isReceivedSince = (id: string, requestedAtVersion?: number) => {
    if (requestedAtVersion === undefined) return false;

    const receivedVersion = this.receivedVersions.get(id);

    return receivedVersion !== undefined && receivedVersion > requestedAtVersion;
  };

  private applySnapshot = (
    snapshotMessages: ScheduledMessageResponse[],
    { cid, requestedAtVersion }: SnapshotScope = {},
  ) => {
    if (!this.client._cacheEnabled()) return;

    const currentMessages = Array.from(this.scheduledMessages.values());

    const isKept = (scheduledMessage: ScheduledMessageResponse) =>
      !isInSnapshotScope(scheduledMessage, cid) ||
      this.isReceivedSince(scheduledMessage.id, requestedAtVersion);

    const isActive = (scheduledMessage: ScheduledMessageResponse) =>
      !isFinished(scheduledMessage) && !this.removedIds.has(scheduledMessage.id);

    const pickNewest = (incoming: ScheduledMessageResponse) => {
      const current = this.scheduledMessages.get(incoming.id);

      return current && isNewerThan(current, incoming) ? current : incoming;
    };

    const keptMessages = currentMessages.filter(isKept);
    const snapshotMessagesToStore = snapshotMessages.filter(isActive).map(pickNewest);

    const nextScheduledMessages: ScheduledMessageMap = new Map();
    [...keptMessages, ...snapshotMessagesToStore].forEach((scheduledMessage) =>
      nextScheduledMessages.set(scheduledMessage.id, scheduledMessage),
    );

    this.state.partialNext({ scheduledMessages: nextScheduledMessages });
  };

  private upsertManyToState = (incomingMessages: ScheduledMessageResponse[]) => {
    if (!this.client._cacheEnabled()) return;

    const nextScheduledMessages = new Map(this.scheduledMessages);
    let hasChanges = false;

    for (const scheduledMessage of incomingMessages) {
      const { id } = scheduledMessage;

      if (isFinished(scheduledMessage)) {
        this.removedIds.add(id);
        hasChanges = nextScheduledMessages.delete(id) || hasChanges;
        continue;
      }

      if (this.isOutdated(scheduledMessage, nextScheduledMessages)) continue;

      nextScheduledMessages.set(id, scheduledMessage);
      this.receivedVersion += 1;
      this.receivedVersions.set(id, this.receivedVersion);
      hasChanges = true;
    }

    if (hasChanges) this.state.partialNext({ scheduledMessages: nextScheduledMessages });
  };

  private handleUpsertEvent = (event: Event) => {
    if (!ScheduledMessageManager.isScheduledMessageEvent(event)) return;

    this.upsertToState(event.scheduled_message);
  };

  private handleRemoveEvent = (event: Event) => {
    if (!ScheduledMessageManager.isScheduledMessageEvent(event)) return;

    this.removeFromState(event.scheduled_message.id);
  };

  private subscribeToEvents = (eventTypes: EventTypes[], handleEvent: EventHandler) => {
    const unsubscribeFunctions = eventTypes.map(
      (eventType) => this.client.on(eventType, handleEvent).unsubscribe,
    );

    const unsubscribeAll = () =>
      unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());

    return unsubscribeAll;
  };

  private subscribeConnectionRecovered = () => {
    const reloadAfterRecovery = () => {
      const { isLoaded } = this.state.getLatestValue();

      if (!isLoaded) return;

      this.load().catch((error) =>
        this.client.logger('warn', 'scheduledMessages: reload after recovery failed', {
          error,
          tags: ['scheduled_messages'],
        }),
      );
    };

    return this.client.on('connection.recovered', reloadAfterRecovery).unsubscribe;
  };

  private query = async (
    options: QueryScheduledMessagesOptions,
    handleResult: ScheduledMessageQueryResultHandler,
    signal?: AbortSignal,
  ): Promise<QueryScheduledMessagesResponse> => {
    this.state.partialNext({ isLoading: true });

    try {
      const response = await this.client.queryScheduledMessages(options);

      if (signal?.aborted) return response;

      const { next } = response;

      const resultState = handleResult(response);

      this.state.partialNext({
        ...resultState,
        isDisabled: false,
        lastQueryError: undefined,
        next,
      });

      return response;
    } catch (error) {
      if (signal?.aborted) throw error;

      const lastQueryError = error as Error;
      const errorReason = getScheduledMessageErrorReason(lastQueryError);

      const isDisabled = errorReason === ScheduledMessageErrorReason.Disabled;

      this.state.partialNext({ isDisabled, lastQueryError });

      throw error;
    } finally {
      if (!signal?.aborted) this.state.partialNext({ isLoading: false });
    }
  };

  private removeWhenNotFound = async <TResult>(
    id: string,
    request: () => Promise<TResult>,
  ): Promise<TResult> => {
    try {
      return await request();
    } catch (error) {
      if (isScheduledMessageNotFoundError(error as Error)) this.removeFromState(id);

      throw error;
    }
  };

  private loadSnapshot = async (signal: AbortSignal) => {
    const options = { limit: SCHEDULED_MESSAGES_LOAD_LIMIT };
    const requestedAtVersion = this.receivedVersion;

    const replaceStore = ({
      scheduled_messages = [],
    }: QueryScheduledMessagesResponse) => {
      this.applySnapshot(scheduled_messages, { requestedAtVersion });

      return { isLoaded: true };
    };

    const response = await this.query(options, replaceStore, signal);

    return signal.aborted ? CANCELED : response;
  };

  public static isScheduledMessageEvent = (
    event: Event,
  ): event is ScheduledMessageEvent => !!event.scheduled_message;

  public get version() {
    return this.receivedVersion;
  }

  public get scheduledMessages() {
    return this.state.getLatestValue().scheduledMessages;
  }

  public getFromState = (id: string) => this.scheduledMessages.get(id);

  public getForChannel = (cid: string) => {
    const allScheduledMessages = Array.from(this.scheduledMessages.values());

    const channelScheduledMessages = allScheduledMessages
      .filter((scheduledMessage) => isChannelMessage(scheduledMessage, cid))
      .sort(byScheduledAt);

    return channelScheduledMessages;
  };

  public getCountForChannel = (cid: string) => {
    const allScheduledMessages = Array.from(this.scheduledMessages.values());

    const channelScheduledMessageCount = allScheduledMessages.filter((scheduledMessage) =>
      isChannelMessage(scheduledMessage, cid),
    ).length;

    return channelScheduledMessageCount;
  };

  public getForThread = (parentId: string) => {
    const allScheduledMessages = Array.from(this.scheduledMessages.values());

    const threadScheduledMessages = allScheduledMessages
      .filter((scheduledMessage) => isThreadReply(scheduledMessage, parentId))
      .sort(byScheduledAt);

    return threadScheduledMessages;
  };

  public upsertToState = (scheduledMessage: ScheduledMessageResponse) =>
    this.upsertManyToState([scheduledMessage]);

  public removeFromState = (id: string) => {
    this.removedIds.add(id);

    if (!this.scheduledMessages.has(id)) return;

    const nextScheduledMessages = new Map(this.scheduledMessages);
    nextScheduledMessages.delete(id);

    this.state.partialNext({ scheduledMessages: nextScheduledMessages });
  };

  public hydrateChannelState = (
    cid: string,
    scheduledMessages?: ScheduledMessageResponse[],
    requestedAtVersion?: number,
  ) => {
    if (!Array.isArray(scheduledMessages)) return;

    this.applySnapshot(scheduledMessages, { cid, requestedAtVersion });
  };

  public resetState = () => {
    this.removedIds.clear();
    this.receivedVersions.clear();
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
    this.addUnsubscribeFunction(this.subscribeConnectionRecovered());
  };

  public load = async (): Promise<QueryScheduledMessagesResponse | undefined> => {
    const result = await withCancellation(this.loadTag, this.loadSnapshot);

    return result === CANCELED ? undefined : result;
  };

  public loadMore = async (): Promise<QueryScheduledMessagesResponse | undefined> => {
    const { isLoading, next } = this.state.getLatestValue();

    if (!next || isLoading) return;

    const options = { limit: SCHEDULED_MESSAGES_LOAD_LIMIT, next };

    const addPage = ({ scheduled_messages = [] }: QueryScheduledMessagesResponse) =>
      this.upsertManyToState(scheduled_messages);

    return await this.query(options, addPage);
  };

  public updateScheduledMessage = async (
    id: string,
    options: UpdateScheduledMessageOptions,
  ) => {
    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.client.updateScheduledMessage(id, options),
    );

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };

  public deleteScheduledMessage = async (id: string) => {
    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.client.deleteScheduledMessage(id),
    );

    this.removeFromState(id);

    return scheduledMessage;
  };

  public sendScheduledMessageNow = async (id: string) => {
    const { scheduled_message: scheduledMessage } = await this.removeWhenNotFound(
      id,
      () => this.client.sendScheduledMessageNow(id),
    );

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };
}
