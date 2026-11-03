import { StateStore } from '@stream-io/state-store';
import { chatLoggerSystem } from '../logger';
import { sanitizeOutgoingAttachments } from '../utils';
import { withCancellation } from '../utils/concurrency';
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
  QueryScheduledMessagesRequest,
  QueryScheduledMessagesResponse,
  ScheduledMessageResponse,
  ScheduledMessageStatus,
  UpdateScheduledMessageRequest,
} from '../gen/models';
import type { StreamResponse } from '../types';
import type {
  ScheduledMessageEvent,
  ScheduledMessageManagerOptions,
  ScheduledMessageManagerState,
} from './types';

const logger = chatLoggerSystem.getLogger('scheduled-message-manager');

type ScheduledMessageMap = ScheduledMessageManagerState['scheduledMessages'];

type QueryScheduledMessagesResult = StreamResponse<QueryScheduledMessagesResponse>;

type ScheduledMessageQueryResultHandler = (
  response: QueryScheduledMessagesResult,
) => Partial<ScheduledMessageManagerState> | void;

const SCHEDULED_MESSAGES_LOAD_LIMIT = 100;

const CANCELED = 'canceled';

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

const byScheduledAt = (a: ScheduledMessageResponse, b: ScheduledMessageResponse) =>
  a.scheduled_at - b.scheduled_at || a.id.localeCompare(b.id);

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

const haveSameEntries = (first: ScheduledMessageMap, second: ScheduledMessageMap) =>
  first.size === second.size &&
  Array.from(first).every(
    ([id, scheduledMessage]) => second.get(id) === scheduledMessage,
  );

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

    if (haveSameEntries(nextScheduledMessages, this.scheduledMessages)) return;

    this.state.partialNext({ scheduledMessages: nextScheduledMessages });
  };

  private upsertManyToState = (incomingMessages: ScheduledMessageResponse[]) => {
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

  private canLoadAutomatically = () => {
    const { isDisabled } = this.state.getLatestValue();
    const { anonymous, userID } = this.client;

    return !!userID && !anonymous && !isDisabled;
  };

  private loadWhenConnected = () =>
    this.client.wsConnection.state.subscribeWithSelector(
      ({ isHealthy }) => ({ isHealthy }),
      ({ isHealthy }) => {
        if (!isHealthy || !this.canLoadAutomatically()) return;

        this.load().catch((error) =>
          logger
            .withExtraTags('loadWhenConnected')
            .warn('Loading the scheduled messages failed.', { error }),
        );
      },
    );

  private query = async (
    request: QueryScheduledMessagesRequest,
    handleResult: ScheduledMessageQueryResultHandler,
    signal?: AbortSignal,
  ): Promise<QueryScheduledMessagesResult> => {
    this.state.partialNext({ isLoading: true });

    try {
      const response = await this.client.queryScheduledMessages(request);

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
      if (isScheduledMessageNotFoundError(error)) this.removeFromState(id);

      throw error;
    }
  };

  private loadSnapshot = async (signal: AbortSignal) => {
    const request = { limit: SCHEDULED_MESSAGES_LOAD_LIMIT };
    const requestedAtVersion = this.receivedVersion;

    const replaceStore = ({ scheduled_messages = [] }: QueryScheduledMessagesResult) => {
      this.applySnapshot(scheduled_messages, { requestedAtVersion });

      return { isLoaded: true };
    };

    const response = await this.query(request, replaceStore, signal);

    return signal.aborted ? CANCELED : response;
  };

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
    this.addUnsubscribeFunction(this.loadWhenConnected());
  };

  public load = async (): Promise<QueryScheduledMessagesResult | undefined> => {
    const result = await withCancellation(this.loadTag, this.loadSnapshot);

    return result === CANCELED ? undefined : result;
  };

  public loadMore = async (): Promise<QueryScheduledMessagesResult | undefined> => {
    const { isLoading, next } = this.state.getLatestValue();

    if (!next || isLoading) return;

    const request = { limit: SCHEDULED_MESSAGES_LOAD_LIMIT, next };

    const addPage = ({ scheduled_messages = [] }: QueryScheduledMessagesResult) =>
      this.upsertManyToState(scheduled_messages);

    return await this.query(request, addPage);
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
