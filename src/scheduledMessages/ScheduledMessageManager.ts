import { StateStore } from '../store';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { StreamChat } from '../client';
import type {
  Event,
  EventTypes,
  QueryScheduledMessagesOptions,
  QueryScheduledMessagesResponse,
  ScheduledMessageResponse,
  UpdateScheduledMessageOptions,
} from '../types';

export const SCHEDULED_MESSAGES_LOAD_LIMIT = 100;

export type ScheduledMessageEvent = Event & {
  cid: string;
  scheduled_message: ScheduledMessageResponse;
  type: EventTypes;
};

export type ScheduledMessageManagerState = {
  scheduledMessages: Map<string, ScheduledMessageResponse>;
  hasMore: boolean;
  isLoading: boolean;
  isLoaded: boolean;
  lastQueryError?: Error;
  next?: string;
};

export type ScheduledMessageManagerOptions = {
  client: StreamChat;
};

export type ScheduledMessageSnapshotToken = { epoch: number; seq: number };

const isNewer = (a: ScheduledMessageResponse, b: ScheduledMessageResponse) =>
  Date.parse(a.updated_at) > Date.parse(b.updated_at);

const byScheduledAt = (a: ScheduledMessageResponse, b: ScheduledMessageResponse) =>
  Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || a.id.localeCompare(b.id);

const isTerminal = (scheduledMessage: ScheduledMessageResponse) =>
  scheduledMessage.status === 'canceled' || scheduledMessage.status === 'sent';

export class ScheduledMessageManager extends WithSubscriptions {
  private client: StreamChat;
  private removedIds = new Set<string>();
  private epoch = 0;
  private seq = 0;
  private touchedAt = new Map<string, number>();
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

  get scheduledMessages() {
    return this.state.getLatestValue().scheduledMessages;
  }

  getFromState(id: string) {
    return this.scheduledMessages.get(id);
  }

  getForChannel = (cid: string, { parentId }: { parentId?: string | null } = {}) =>
    Array.from(this.scheduledMessages.values())
      .filter(
        (sm) =>
          sm.cid === cid &&
          (parentId === undefined || (sm.message.parent_id ?? null) === parentId),
      )
      .sort(byScheduledAt);

  snapshotToken = (): ScheduledMessageSnapshotToken => ({
    epoch: this.epoch,
    seq: this.seq,
  });

  private touch = (id: string) => {
    this.touchedAt.set(id, ++this.seq);
  };

  private applySnapshot = (
    snapshot: ScheduledMessageResponse[],
    inScope: (sm: ScheduledMessageResponse) => boolean,
    token: ScheduledMessageSnapshotToken,
  ) => {
    const changedSince = (id: string) => (this.touchedAt.get(id) ?? 0) > token.seq;
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

  upsertResponseToState = (
    scheduledMessage: ScheduledMessageResponse,
    token: ScheduledMessageSnapshotToken,
  ) => {
    if (token.epoch !== this.epoch) return;
    this.upsertToState(scheduledMessage);
  };

  upsertToState = (scheduledMessage: ScheduledMessageResponse) => {
    this.upsertManyToState([scheduledMessage]);
  };

  upsertManyToState = (scheduledMessages: ScheduledMessageResponse[]) => {
    if (!this.client._cacheEnabled()) return;
    const next = new Map(this.scheduledMessages);
    let changed = false;
    for (const sm of scheduledMessages) {
      if (isTerminal(sm)) {
        this.markRemoved(sm.id);
        changed = next.delete(sm.id) || changed;
        continue;
      }
      if (this.removedIds.has(sm.id)) continue;
      const current = next.get(sm.id);
      if (current && isNewer(current, sm)) continue;
      this.touch(sm.id);
      next.set(sm.id, sm);
      changed = true;
    }
    if (changed) this.state.partialNext({ scheduledMessages: next });
  };

  private markRemoved = (id: string) => {
    this.removedIds.add(id);
    this.touch(id);
  };

  removeFromState = (id: string) => {
    this.markRemoved(id);
    if (!this.scheduledMessages.has(id)) return;
    const scheduledMessages = new Map(this.scheduledMessages);
    scheduledMessages.delete(id);
    this.state.partialNext({ scheduledMessages });
  };

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

  static isScheduledMessageEvent = (event: Event): event is ScheduledMessageEvent =>
    !!event.scheduled_message && event.type.startsWith('scheduled_message.');

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;
    this.addUnsubscribeFunction(
      this.subscribeToEvents(
        [
          'scheduled_message.created',
          'scheduled_message.updated',
          'scheduled_message.failed',
        ],
        this.upsertToState,
      ),
    );
    this.addUnsubscribeFunction(
      this.subscribeToEvents(
        ['scheduled_message.sent', 'scheduled_message.deleted'],
        (scheduledMessage) => this.removeFromState(scheduledMessage.id),
      ),
    );
    this.addUnsubscribeFunction(this.subscribeConnectionRecovered());
  };

  private subscribeToEvents = (
    types: EventTypes[],
    handle: (scheduledMessage: ScheduledMessageResponse) => void,
  ) => {
    const subscriptions = types.map(
      (type) =>
        this.client.on(type, (event) => {
          if (!ScheduledMessageManager.isScheduledMessageEvent(event)) return;
          handle(event.scheduled_message);
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

  private query = async (
    options: QueryScheduledMessagesOptions,
    apply: (
      response: QueryScheduledMessagesResponse,
      token: ScheduledMessageSnapshotToken,
    ) => Partial<ScheduledMessageManagerState> | void,
  ): Promise<QueryScheduledMessagesResponse> => {
    const token = this.snapshotToken();
    const isSameUser = () => token.epoch === this.epoch;
    this.state.partialNext({ isLoading: true });
    try {
      const response = await this.client.queryScheduledMessages(options);
      if (!isSameUser()) return response;
      this.state.partialNext({
        ...apply(response, token),
        hasMore: !!response.next,
        lastQueryError: undefined,
        next: response.next,
      });
      return response;
    } catch (error) {
      if (isSameUser()) this.state.partialNext({ lastQueryError: error as Error });
      throw error;
    } finally {
      if (isSameUser()) this.state.partialNext({ isLoading: false });
    }
  };

  load = (): Promise<QueryScheduledMessagesResponse> =>
    this.query({ limit: SCHEDULED_MESSAGES_LOAD_LIMIT }, (response, token) => {
      if (this.client._cacheEnabled()) {
        this.applySnapshot(response.scheduled_messages, () => true, token);
      }
      return { isLoaded: true };
    });

  loadMore = async (): Promise<QueryScheduledMessagesResponse | undefined> => {
    const { next, isLoading } = this.state.getLatestValue();
    if (!next || isLoading) return;
    return await this.query({ limit: SCHEDULED_MESSAGES_LOAD_LIMIT, next }, (response) =>
      this.upsertManyToState(response.scheduled_messages),
    );
  };

  updateScheduledMessage = async (id: string, options: UpdateScheduledMessageOptions) => {
    const token = this.snapshotToken();
    const { scheduled_message } = await this.client.updateScheduledMessage(id, options);
    this.upsertResponseToState(scheduled_message, token);
    return scheduled_message;
  };

  deleteScheduledMessage = async (id: string) => {
    const { epoch } = this;
    const { scheduled_message } = await this.client.deleteScheduledMessage(id);
    if (epoch === this.epoch) this.removeFromState(id);
    return scheduled_message;
  };

  sendScheduledMessageNow = async (id: string) => {
    const token = this.snapshotToken();
    const { scheduled_message } = await this.client.sendScheduledMessageNow(id);
    this.upsertResponseToState(scheduled_message, token);
    return scheduled_message;
  };
}
