import { StateStore } from '../store';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { StreamChat } from '../client';
import type {
  Event,
  EventTypes,
  QueryScheduledMessagesResponse,
  ScheduledMessageResponse,
  UpdateScheduledMessageOptions,
} from '../types';

type ScheduledMessageId = string;

/**
 * Page size used when loading the current user's scheduled messages. It is the
 * maximum the API allows, and one page holds every pending message of a user
 * (the per-user limit of pending scheduled messages is at most 100).
 */
export const SCHEDULED_MESSAGES_LOAD_LIMIT = 100;

export type ScheduledMessageEvent = Event & {
  cid: string;
  scheduled_message: ScheduledMessageResponse;
  type: EventTypes;
};

export type ScheduledMessageManagerState = {
  /** The current user's known scheduled messages, keyed by scheduled message ID. */
  scheduledMessages: Map<ScheduledMessageId, ScheduledMessageResponse>;
  /** Whether more scheduled messages exist than were loaded (see `loadMore`). */
  hasMore: boolean;
  isLoading: boolean;
  /** Whether `load` has completed at least once. */
  isLoaded: boolean;
  lastQueryError?: Error;
  /** Cursor of the next page of `load`. */
  next?: string;
};

export type ScheduledMessageManagerOptions = {
  client: StreamChat;
};

const byScheduledAt = (a: ScheduledMessageResponse, b: ScheduledMessageResponse) =>
  new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime() ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Keeps the current user's scheduled messages in a client-side store.
 *
 * The server does not include scheduled messages in channel state (unless a channel is
 * queried with `include_scheduled_messages: true`), so the store is filled by `load`
 * (up to 100 messages; call it once the user is connected) and kept in sync by the
 * `scheduled_message.*` events once `registerSubscriptions` was called:
 * - `scheduled_message.created` / `scheduled_message.updated`: upserted
 * - `scheduled_message.failed`: upserted with status `failed` and its `failure_reason`
 * - `scheduled_message.sent` / `scheduled_message.deleted`: removed
 *
 * After a connection recovery, a loaded store is reloaded, because events may have
 * been missed while the connection was down.
 */
export class ScheduledMessageManager extends WithSubscriptions {
  private client: StreamChat;
  /**
   * IDs of scheduled messages known to be sent or deleted. A scheduled message ID is
   * never reused, so a later upsert of one of these comes from a response or event
   * that was overtaken (e.g. the `sendScheduledMessageNow` response arriving after the
   * `scheduled_message.sent` event) and must not bring the message back.
   */
  private removedIds = new Set<ScheduledMessageId>();
  state: StateStore<ScheduledMessageManagerState>;

  constructor({ client }: ScheduledMessageManagerOptions) {
    super();
    this.client = client;
    this.state = new StateStore<ScheduledMessageManagerState>(this.initialState);
  }

  get initialState(): ScheduledMessageManagerState {
    return {
      scheduledMessages: new Map(),
      hasMore: false,
      isLoading: false,
      isLoaded: false,
      lastQueryError: undefined,
      next: undefined,
    };
  }

  // State API START //
  get scheduledMessages() {
    return this.state.getLatestValue().scheduledMessages;
  }

  getFromState(id: ScheduledMessageId) {
    return this.scheduledMessages.get(id);
  }

  /**
   * Returns the known scheduled messages of a channel (or, with `parentId`, of a thread),
   * ordered by `scheduled_at`.
   */
  getForChannel = (cid: string, { parentId }: { parentId?: string } = {}) =>
    Array.from(this.scheduledMessages.values())
      .filter(
        (sm) =>
          sm.cid === cid &&
          (parentId === undefined || (sm.message.parent_id ?? undefined) === parentId),
      )
      .sort(byScheduledAt);

  upsertToState = (scheduledMessage: ScheduledMessageResponse) => {
    if (!this.client._cacheEnabled()) return;
    // Terminal states are reported by the delete endpoint and by the sent event;
    // such messages no longer exist on the server.
    if (scheduledMessage.status === 'canceled' || scheduledMessage.status === 'sent') {
      this.removeFromState(scheduledMessage.id);
      return;
    }
    if (this.removedIds.has(scheduledMessage.id)) return;
    const scheduledMessages = new Map(this.scheduledMessages);
    scheduledMessages.set(scheduledMessage.id, scheduledMessage);
    this.state.partialNext({ scheduledMessages });
  };

  removeFromState = (id: ScheduledMessageId) => {
    this.removedIds.add(id);
    if (!this.scheduledMessages.has(id)) return;
    const scheduledMessages = new Map(this.scheduledMessages);
    scheduledMessages.delete(id);
    this.state.partialNext({ scheduledMessages });
  };

  /**
   * Replaces the known scheduled messages of a channel with the authoritative list a
   * channel query returned (`include_scheduled_messages: true`). Nothing happens when
   * the list is absent, which means the server did not know it.
   */
  hydrateChannelState = (
    cid: string,
    scheduledMessages: ScheduledMessageResponse[] | undefined,
  ) => {
    if (!this.client._cacheEnabled() || !Array.isArray(scheduledMessages)) return;
    const next = new Map(this.scheduledMessages);
    for (const [id, sm] of next) {
      if (sm.cid === cid) next.delete(id);
    }
    for (const sm of scheduledMessages) {
      if (!this.removedIds.has(sm.id)) next.set(sm.id, sm);
    }
    this.state.partialNext({ scheduledMessages: next });
  };

  resetState = () => {
    this.removedIds.clear();
    this.state.next(this.initialState);
  };
  // State API END //

  // WS event handling START //
  static isScheduledMessageEvent = (event: Event): event is ScheduledMessageEvent =>
    !!event.scheduled_message && event.type.startsWith('scheduled_message.');

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;
    this.addUnsubscribeFunction(this.subscribeUpsertEvents());
    this.addUnsubscribeFunction(this.subscribeRemoveEvents());
    this.addUnsubscribeFunction(this.subscribeConnectionRecovered());
  };

  private subscribeUpsertEvents = () => {
    const subscriptions = (
      [
        'scheduled_message.created',
        'scheduled_message.updated',
        'scheduled_message.failed',
      ] as const
    ).map(
      (type) =>
        this.client.on(type, (event) => {
          if (!ScheduledMessageManager.isScheduledMessageEvent(event)) return;
          this.upsertToState(event.scheduled_message);
        }).unsubscribe,
    );
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeRemoveEvents = () => {
    const subscriptions = (
      ['scheduled_message.sent', 'scheduled_message.deleted'] as const
    ).map(
      (type) =>
        this.client.on(type, (event) => {
          if (!ScheduledMessageManager.isScheduledMessageEvent(event)) return;
          this.removeFromState(event.scheduled_message.id);
        }).unsubscribe,
    );
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeConnectionRecovered = () =>
    this.client.on('connection.recovered', () => {
      if (!this.state.getLatestValue().isLoaded) return;
      void this.load().catch((error) => {
        this.client.logger('warn', 'scheduledMessages: reload after recovery failed', {
          tags: ['scheduled_messages'],
          error,
        });
      });
    }).unsubscribe;
  // WS event handling END //

  // API calls START //
  /**
   * Loads the current user's scheduled messages (up to 100) and replaces the store with
   * them. Call it once the user is connected.
   */
  load = async () => {
    this.state.partialNext({ isLoading: true });
    try {
      const response = await this.client.queryScheduledMessages({
        limit: SCHEDULED_MESSAGES_LOAD_LIMIT,
      });
      const scheduledMessages = new Map(
        response.scheduled_messages
          .filter((sm) => !this.removedIds.has(sm.id))
          .map((sm) => [sm.id, sm] as const),
      );
      this.state.partialNext({
        scheduledMessages: this.client._cacheEnabled() ? scheduledMessages : new Map(),
        hasMore: !!response.next,
        isLoaded: true,
        lastQueryError: undefined,
        next: response.next,
      });
      return response;
    } catch (error) {
      this.state.partialNext({ lastQueryError: error as Error });
      throw error;
    } finally {
      this.state.partialNext({ isLoading: false });
    }
  };

  /**
   * Loads the next page after `load` and adds it to the store.
   */
  loadMore = async (): Promise<QueryScheduledMessagesResponse | undefined> => {
    const { next, isLoading } = this.state.getLatestValue();
    if (!next || isLoading) return;
    this.state.partialNext({ isLoading: true });
    try {
      const response = await this.client.queryScheduledMessages({
        limit: SCHEDULED_MESSAGES_LOAD_LIMIT,
        next,
      });
      response.scheduled_messages.forEach(this.upsertToState);
      this.state.partialNext({
        hasMore: !!response.next,
        lastQueryError: undefined,
        next: response.next,
      });
      return response;
    } catch (error) {
      this.state.partialNext({ lastQueryError: error as Error });
      throw error;
    } finally {
      this.state.partialNext({ isLoading: false });
    }
  };

  updateScheduledMessage = async (
    id: ScheduledMessageId,
    options: UpdateScheduledMessageOptions,
  ) => {
    const { scheduled_message } = await this.client.updateScheduledMessage(id, options);
    this.upsertToState(scheduled_message);
    return scheduled_message;
  };

  deleteScheduledMessage = async (id: ScheduledMessageId) => {
    const { scheduled_message } = await this.client.deleteScheduledMessage(id);
    this.removeFromState(id);
    return scheduled_message;
  };

  sendScheduledMessageNow = async (id: ScheduledMessageId) => {
    const { scheduled_message } = await this.client.sendScheduledMessageNow(id);
    this.upsertToState(scheduled_message);
    return scheduled_message;
  };
  // API calls END //
}
