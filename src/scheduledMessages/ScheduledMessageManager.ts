import { StateStore } from '../store';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import {
  ScheduledMessageErrorReason,
  ScheduledMessageEventType,
  ScheduledMessageStatus,
} from '../types';
import { getScheduledMessageErrorReason } from './errors';
import type { StreamChat } from '../client';
import type {
  Event,
  EventTypes,
  QueryScheduledMessagesOptions,
  QueryScheduledMessagesResponse,
  ScheduledMessageResponse,
  UpdateScheduledMessageOptions,
} from '../types';
import type {
  ScheduledMessageEvent,
  ScheduledMessageHandler,
  ScheduledMessageManagerOptions,
  ScheduledMessageManagerState,
  ScheduledMessageMap,
  ScheduledMessagePredicate,
  ScheduledMessageQueryResultHandler,
} from './types';

export const SCHEDULED_MESSAGES_LOAD_LIMIT = 100;

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

  private applySnapshot = (
    snapshotMessages: ScheduledMessageResponse[],
    isInScope: ScheduledMessagePredicate,
  ) => {
    if (!this.client._cacheEnabled()) return;

    const currentMessages = Array.from(this.scheduledMessages.values());

    const isOutOfScope = (scheduledMessage: ScheduledMessageResponse) =>
      !isInScope(scheduledMessage);
    const isActive = (scheduledMessage: ScheduledMessageResponse) =>
      !isFinished(scheduledMessage) && !this.removedIds.has(scheduledMessage.id);
    const pickNewest = (incoming: ScheduledMessageResponse) => {
      const current = this.scheduledMessages.get(incoming.id);

      return current && isNewerThan(current, incoming) ? current : incoming;
    };

    const keptMessages = currentMessages.filter(isOutOfScope);
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
      hasChanges = true;
    }

    if (hasChanges) this.state.partialNext({ scheduledMessages: nextScheduledMessages });
  };

  private subscribeToEvents = (
    eventTypes: EventTypes[],
    handleScheduledMessage: ScheduledMessageHandler,
  ) => {
    const handleEvent = (event: Event) => {
      if (!ScheduledMessageManager.isScheduledMessageEvent(event)) return;

      handleScheduledMessage(event.scheduled_message);
    };

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
  ): Promise<QueryScheduledMessagesResponse> => {
    this.state.partialNext({ isLoading: true });

    try {
      const response = await this.client.queryScheduledMessages(options);
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
      const lastQueryError = error as Error;
      const errorReason = getScheduledMessageErrorReason(lastQueryError);

      const isDisabled = errorReason === ScheduledMessageErrorReason.Disabled;

      this.state.partialNext({ isDisabled, lastQueryError });

      throw error;
    } finally {
      this.state.partialNext({ isLoading: false });
    }
  };

  public static isScheduledMessageEvent = (
    event: Event,
  ): event is ScheduledMessageEvent => !!event.scheduled_message;

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
  ) => {
    if (!Array.isArray(scheduledMessages)) return;

    const isInChannel = (scheduledMessage: ScheduledMessageResponse) =>
      scheduledMessage.cid === cid;

    this.applySnapshot(scheduledMessages, isInChannel);
  };

  public resetState = () => {
    this.removedIds.clear();
    this.state.next(createInitialState());
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;

    const removeScheduledMessage = ({ id }: ScheduledMessageResponse) =>
      this.removeFromState(id);

    this.addUnsubscribeFunction(
      this.subscribeToEvents(UPSERT_EVENT_TYPES, this.upsertToState),
    );
    this.addUnsubscribeFunction(
      this.subscribeToEvents(REMOVE_EVENT_TYPES, removeScheduledMessage),
    );
    this.addUnsubscribeFunction(this.subscribeConnectionRecovered());
  };

  public load = (): Promise<QueryScheduledMessagesResponse> => {
    const options = { limit: SCHEDULED_MESSAGES_LOAD_LIMIT };

    const replaceStore = ({
      scheduled_messages = [],
    }: QueryScheduledMessagesResponse) => {
      this.applySnapshot(scheduled_messages, () => true);

      return { isLoaded: true };
    };

    return this.query(options, replaceStore);
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
    const { scheduled_message: scheduledMessage } =
      await this.client.updateScheduledMessage(id, options);

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };

  public deleteScheduledMessage = async (id: string) => {
    const { scheduled_message: scheduledMessage } =
      await this.client.deleteScheduledMessage(id);

    this.removeFromState(id);

    return scheduledMessage;
  };

  public sendScheduledMessageNow = async (id: string) => {
    const { scheduled_message: scheduledMessage } =
      await this.client.sendScheduledMessageNow(id);

    this.upsertToState(scheduledMessage);

    return scheduledMessage;
  };
}
