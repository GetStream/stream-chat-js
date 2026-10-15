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

/**
 * Taken before a request whose response replaces part of the store (see
 * `snapshotToken`), so the response cannot undo what happened while it was in flight.
 */
export type ScheduledMessageSnapshotToken = { epoch: number; seq: number };

/** Whether `a` is a later version of the same scheduled message than `b`. */
const isNewer = (a: ScheduledMessageResponse, b: ScheduledMessageResponse) =>
  new Date(a.updated_at).getTime() > new Date(b.updated_at).getTime();

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
 *
 * Events and responses can arrive out of order, so an update older (by `updated_at`)
 * than the stored version is ignored, and a list (`load`, a channel query) does not
 * undo changes that arrived while it was being fetched. Responses to requests made
 * before `disconnectUser` are dropped.
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
  /** Bumped by `resetState`: responses to requests made before then are dropped. */
  private epoch = 0;
  /** Bumped on every store change; `touchedAt` records the value per ID. */
  private seq = 0;
  private touchedAt = new Map<ScheduledMessageId, number>();
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
   * Returns the known scheduled messages of a channel, ordered by `scheduled_at`.
   * `parentId` narrows the list: a message ID returns the replies of that thread,
   * `null` returns only the messages that are not thread replies, and leaving it out
   * returns both.
   */
  getForChannel = (cid: string, { parentId }: { parentId?: string | null } = {}) =>
    Array.from(this.scheduledMessages.values())
      .filter(
        (sm) =>
          sm.cid === cid &&
          (parentId === undefined || (sm.message.parent_id ?? null) === parentId),
      )
      .sort(byScheduledAt);

  /**
   * Call before a request whose response is passed to `hydrateChannelState`. The
   * response is then not applied over changes made while it was in flight, and not
   * at all after `resetState` (the user disconnected).
   */
  snapshotToken = (): ScheduledMessageSnapshotToken => ({
    epoch: this.epoch,
    seq: this.seq,
  });

  private touch = (id: ScheduledMessageId) => {
    this.touchedAt.set(id, ++this.seq);
  };

  /**
   * Replaces the entries `inScope` selects with `snapshot`, keeping the entries that
   * changed after `token` was taken where the snapshot is not newer.
   */
  private applySnapshot = (
    snapshot: ScheduledMessageResponse[],
    inScope: (sm: ScheduledMessageResponse) => boolean,
    token: ScheduledMessageSnapshotToken,
  ) => {
    const changedSince = (id: ScheduledMessageId) =>
      (this.touchedAt.get(id) ?? 0) > token.seq;
    const next = new Map(this.scheduledMessages);
    for (const [id, sm] of next) {
      if (inScope(sm) && !changedSince(id)) next.delete(id);
    }
    for (const sm of snapshot) {
      if (this.removedIds.has(sm.id)) continue;
      const current = next.get(sm.id);
      if (current && isNewer(current, sm)) continue;
      next.set(sm.id, sm);
    }
    this.state.partialNext({ scheduledMessages: next });
  };

  /**
   * Stores a scheduled message from an API response, like `upsertToState`. `token`
   * comes from `snapshotToken`, taken before the request was sent: a response that
   * arrives after the user disconnected belongs to the previous user and is dropped.
   */
  upsertResponseToState = (
    scheduledMessage: ScheduledMessageResponse,
    token: ScheduledMessageSnapshotToken,
  ) => {
    if (token.epoch !== this.epoch) return;
    this.upsertToState(scheduledMessage);
  };

  /** Stores a scheduled message, unless a newer version of it is already stored. */
  upsertToState = (scheduledMessage: ScheduledMessageResponse) => {
    if (!this.client._cacheEnabled()) return;
    // Terminal states are reported by the delete endpoint and by the sent event;
    // such messages no longer exist on the server.
    if (scheduledMessage.status === 'canceled' || scheduledMessage.status === 'sent') {
      this.removeFromState(scheduledMessage.id);
      return;
    }
    if (this.removedIds.has(scheduledMessage.id)) return;
    // Why: responses and events can arrive out of order, e.g. the send-now response
    // or its `scheduled_message.updated` event after `scheduled_message.failed`
    // (the send is queued before the response is written).
    const current = this.scheduledMessages.get(scheduledMessage.id);
    if (current && isNewer(current, scheduledMessage)) return;
    this.touch(scheduledMessage.id);
    const scheduledMessages = new Map(this.scheduledMessages);
    scheduledMessages.set(scheduledMessage.id, scheduledMessage);
    this.state.partialNext({ scheduledMessages });
  };

  removeFromState = (id: ScheduledMessageId) => {
    this.removedIds.add(id);
    this.touch(id);
    if (!this.scheduledMessages.has(id)) return;
    const scheduledMessages = new Map(this.scheduledMessages);
    scheduledMessages.delete(id);
    this.state.partialNext({ scheduledMessages });
  };

  /**
   * Replaces the known scheduled messages of a channel with the authoritative list a
   * channel query returned (`include_scheduled_messages: true`). Nothing happens when
   * the list is absent, which means the server did not know it. `token` comes from
   * `snapshotToken`, taken before the query was sent.
   */
  hydrateChannelState = (
    cid: string,
    scheduledMessages: ScheduledMessageResponse[] | undefined,
    token: ScheduledMessageSnapshotToken = this.snapshotToken(),
  ) => {
    if (!this.client._cacheEnabled() || !Array.isArray(scheduledMessages)) return;
    if (token.epoch !== this.epoch) return;
    this.applySnapshot(scheduledMessages, (sm) => sm.cid === cid, token);
  };

  resetState = () => {
    this.epoch++;
    this.touchedAt.clear();
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
    const token = this.snapshotToken();
    this.state.partialNext({ isLoading: true });
    try {
      const response = await this.client.queryScheduledMessages({
        limit: SCHEDULED_MESSAGES_LOAD_LIMIT,
      });
      // The user disconnected meanwhile: the response belongs to the previous user.
      if (token.epoch !== this.epoch) return response;
      if (this.client._cacheEnabled()) {
        this.applySnapshot(response.scheduled_messages, () => true, token);
      }
      this.state.partialNext({
        hasMore: !!response.next,
        isLoaded: true,
        lastQueryError: undefined,
        next: response.next,
      });
      return response;
    } catch (error) {
      if (token.epoch === this.epoch) {
        this.state.partialNext({ lastQueryError: error as Error });
      }
      throw error;
    } finally {
      if (token.epoch === this.epoch) this.state.partialNext({ isLoading: false });
    }
  };

  /**
   * Loads the next page after `load` and adds it to the store.
   */
  loadMore = async (): Promise<QueryScheduledMessagesResponse | undefined> => {
    const { next, isLoading } = this.state.getLatestValue();
    if (!next || isLoading) return;
    const { epoch } = this;
    this.state.partialNext({ isLoading: true });
    try {
      const response = await this.client.queryScheduledMessages({
        limit: SCHEDULED_MESSAGES_LOAD_LIMIT,
        next,
      });
      if (epoch !== this.epoch) return response;
      response.scheduled_messages.forEach(this.upsertToState);
      this.state.partialNext({
        hasMore: !!response.next,
        lastQueryError: undefined,
        next: response.next,
      });
      return response;
    } catch (error) {
      if (epoch === this.epoch)
        this.state.partialNext({ lastQueryError: error as Error });
      throw error;
    } finally {
      if (epoch === this.epoch) this.state.partialNext({ isLoading: false });
    }
  };

  updateScheduledMessage = async (
    id: ScheduledMessageId,
    options: UpdateScheduledMessageOptions,
  ) => {
    const token = this.snapshotToken();
    const { scheduled_message } = await this.client.updateScheduledMessage(id, options);
    this.upsertResponseToState(scheduled_message, token);
    return scheduled_message;
  };

  deleteScheduledMessage = async (id: ScheduledMessageId) => {
    const { epoch } = this;
    const { scheduled_message } = await this.client.deleteScheduledMessage(id);
    if (epoch === this.epoch) this.removeFromState(id);
    return scheduled_message;
  };

  sendScheduledMessageNow = async (id: ScheduledMessageId) => {
    const token = this.snapshotToken();
    const { scheduled_message } = await this.client.sendScheduledMessageNow(id);
    this.upsertResponseToState(scheduled_message, token);
    return scheduled_message;
  };
  // API calls END //
}
