import type { StreamChat } from '../client';
import { deepFreezeConfig } from '../configuration/deepFreezeConfig';
import type { StateStore } from '../store';
import { ConfigController } from '../configuration/ConfigController';
import { Channel } from '../channel';
import type { ThreadUserReadState } from '../thread';
import { Thread } from '../thread';
import type {
  EventAPIResponse,
  LocalMessage,
  MarkDeliveredRequest,
  MarkReadRequest,
  StreamAPIError,
  StreamResponse,
} from '../types';
import { throttle, userHasReadReceipts } from '../utils';
import { isAPIError, isErrorRetryable } from '../errors';
import type { MarkReadResponse as Gen_MarkReadResponse } from '../gen/models';

export type MessageDeliveryReporterConfig = {
  /** How long delivery reports are buffered before being sent as one batch (defaults to 1000ms). */
  markAsDeliveredBufferTimeoutMs: number;
  /**
   * Minimum gap between automatic `markRead` calls (defaults to 1000ms).
   *
   * Read once, when the throttle is built — assigning it later does nothing, which is why
   * {@link MessageDeliveryReporter.setMarkAsReadThrottleOptions} exists and why the declarative path
   * routes through it.
   */
  markAsReadThrottleTimeoutMs: number;
  /** Most delivery receipts sent in a single request; the remainder is carried to the next (100). */
  maxDeliveredMessageCountInPayload: number;
  /** Consecutive timeouts before the buffer window is widened (defaults to 3). */
  retryCountLimitForTimeoutIncrease: number;
};

export const DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG: MessageDeliveryReporterConfig =
  deepFreezeConfig({
    markAsDeliveredBufferTimeoutMs: 1000,
    markAsReadThrottleTimeoutMs: 1000,
    maxDeliveredMessageCountInPayload: 100,
    retryCountLimitForTimeoutIncrease: 3,
  });

const isChannel = (item: Channel | Thread): item is Channel => item instanceof Channel;
const isThread = (item: Channel | Thread): item is Thread => item instanceof Thread;

type MessageId = string;
type ChannelThreadCompositeId = string;

export type AnnounceDeliveryOptions = Omit<
  MarkDeliveredRequest,
  'latest_delivered_messages'
>;

export type MessageDeliveryReporterOptions = {
  client: StreamChat;
};

export class MessageDeliveryReporter {
  protected client: StreamChat;

  protected deliveryReportCandidates: Map<ChannelThreadCompositeId, MessageId> =
    new Map();
  protected nextDeliveryReportCandidates: Map<ChannelThreadCompositeId, MessageId> =
    new Map();

  protected markDeliveredRequestPromise: Promise<void> | null = null;
  protected markDeliveredTimeout: ReturnType<typeof setTimeout> | null = null;

  protected requestTimeoutMs: number =
    DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG.markAsDeliveredBufferTimeoutMs;
  // increased up to config.retryCountLimitForTimeoutIncrease
  protected requestRetryCount: number = 0;

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<MessageDeliveryReporterConfig>;
  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<MessageDeliveryReporterConfig> {
    return this.configController.state;
  }

  constructor({ client }: MessageDeliveryReporterOptions) {
    this.client = client;
    this.configController = new ConfigController<MessageDeliveryReporterConfig>({
      defaults: DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG,
      // The markRead throttle captures its interval in a closure, so storing a new one is not enough —
      // it has to be rebuilt. Doing that here rather than in `updateConfig` is what makes the pairing
      // hold for *every* route, including a declarative change.
      onChanged: (next, previous) => {
        if (next.markAsReadThrottleTimeoutMs === previous.markAsReadThrottleTimeoutMs)
          return;
        this.throttledMarkRead = this.buildThrottledMarkRead(
          next.markAsReadThrottleTimeoutMs,
        );
      },
    });
  }

  /** The current resolved configuration. `Readonly` — change it through {@link updateConfig}. */
  get config(): Readonly<MessageDeliveryReporterConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration in. `markAsReadThrottleTimeoutMs` is routed through its rebuild
   * setter, because the throttle captured the old interval in a closure and would otherwise ignore it.
   */
  updateConfig(config: Partial<MessageDeliveryReporterConfig>) {
    this.configController.patch(config);
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice.
   *
   * The derivation entry point every configurable entity exposes, so the owner routes a slice here and
   * knows nothing about MessageDeliveryReporter's defaults or merge semantics. This logic used to live in the owner,
   * which is how `reset()` became a no-op for the client key (F4) and how a registered
   * `notifications.sortComparator` became unremovable (G8) — an owner writing another object's
   * derivation gets that object's rules wrong sooner or later.
   *
   * Routed through {@link updateConfig} rather than replacing the store, which is exact here because
   * every field of `MessageDeliveryReporterConfig` is required and present in the defaults, so a patch naming all of
   * them amounts to a replacement. `NotificationManager` cannot do this — its `sortComparator` is
   * optional with no default, so a patch can never remove one — which is why it replaces outright.
   */
  initializeConfig(config?: Partial<MessageDeliveryReporterConfig>) {
    this.configController.initialize(config);
  }

  /**
   * Rebuilds the `markRead` throttle for a new interval.
   *
   * Needed because the throttle is created as a field initializer — before any declarative
   * configuration has been applied — so the interval is captured once. Assigning the config value
   * alone would leave the original throttle in place, silently.
   */
  setMarkAsReadThrottleOptions = ({
    markAsReadThrottleTimeoutMs,
  }: Pick<MessageDeliveryReporterConfig, 'markAsReadThrottleTimeoutMs'>) => {
    // Kept as released surface, but it no longer has to pair the write with the rebuild — the
    // controller's `onChanged` does that for whichever route the value arrives by.
    this.updateConfig({ markAsReadThrottleTimeoutMs });
  };

  private get markDeliveredRequestInFlight() {
    return this.markDeliveredRequestPromise !== null;
  }

  private get hasTimer() {
    return this.markDeliveredTimeout !== null;
  }

  private get hasDeliveryCandidates() {
    return this.deliveryReportCandidates.size > 0;
  }

  private get canExecuteRequest() {
    return !this.markDeliveredRequestInFlight && this.hasDeliveryCandidates;
  }

  private static hasPermissionToReportDeliveryFor(collection: Channel | Thread) {
    if (isChannel(collection)) return !!collection.getConfig()?.delivery_events;
    if (isThread(collection)) return !!collection.channel.getConfig()?.delivery_events;
  }

  private increaseBackOff() {
    if (this.requestRetryCount >= this.config.retryCountLimitForTimeoutIncrease) return;
    this.requestRetryCount = this.requestRetryCount + 1;
    this.requestTimeoutMs = this.requestTimeoutMs * 2;
  }

  private resetBackOff() {
    this.requestTimeoutMs = this.config.markAsDeliveredBufferTimeoutMs;
    this.requestRetryCount = 0;
  }

  /**
   * Builds the `latest_delivered_messages` payload from an arbitrary buffer
   * (`deliveryReportCandidates` or `nextDeliveryReportCandidates`).
   *
   * @param map - The buffer mapping channel/thread composite IDs to the latest delivered message ID.
   * @returns The payload entries ready to be sent to the server.
   */
  private confirmationsFrom(map: Map<ChannelThreadCompositeId, MessageId>) {
    return Array.from(map.entries()).map(([key, messageId]) => {
      const [type, id, parent_id] = key.split(':');
      return parent_id
        ? { cid: `${type}:${id}`, id: messageId, parent_id }
        : { cid: key, id: messageId };
    });
  }

  private confirmationsFromDeliveryReportCandidates() {
    const entries = Array.from(this.deliveryReportCandidates);
    const sendBuffer = new Map(
      entries.slice(0, this.config.maxDeliveredMessageCountInPayload),
    );
    this.deliveryReportCandidates = new Map(
      entries.slice(this.config.maxDeliveredMessageCountInPayload),
    );

    return { latest_delivered_messages: this.confirmationsFrom(sendBuffer), sendBuffer };
  }

  /**
   * Generates a candidate key for storing in the candidates buffer.
   *
   * @param collection - The channel or thread to derive a candidate key for.
   * @returns The composite identifier, or `undefined` when the collection is neither a Channel nor a Thread.
   */
  private candidateKeyFor(
    collection: Channel | Thread,
  ): ChannelThreadCompositeId | undefined {
    if (isChannel(collection)) return collection.cid;
    if (isThread(collection)) return `${collection.channel.cid}:${collection.id}`;
  }

  /**
   * Retrieves a reference to the latest message in the state that is neither read nor reported as
   * delivered.
   *
   * @param collection - The channel or thread to inspect.
   * @returns The next candidate to report as delivered, or `undefined` when none applies.
   */
  private getNextDeliveryReportCandidate = (
    collection: Channel | Thread,
  ): { key: ChannelThreadCompositeId; id: MessageId | null } | undefined => {
    const ownUserId = this.client.user?.id;
    if (!ownUserId) return;

    let latestMessages: LocalMessage[] = [];
    let lastDeliveredAt: Date | undefined;
    let lastReadAt: Date | undefined;
    let key: string | undefined = undefined;

    // todo: unify the API for read state access btw channel and threads
    if (isChannel(collection)) {
      latestMessages = collection.messagePaginator.headItems;
      const ownReadState = collection.state.read[ownUserId] ?? {};
      lastReadAt = ownReadState?.last_read;
      lastDeliveredAt = ownReadState?.last_delivered_at;
      key = collection.cid;
    } else if (isThread(collection)) {
      // Use the head (newest-loaded) window, not the active/visible interval: the candidate logic
      // below inspects the newest message, which the active interval only reflects when scrolled to
      // the head. Mirrors the channel branch above.
      latestMessages = collection.messagePaginator.headItems;
      const ownReadState =
        collection.state.getLatestValue().read[ownUserId] ?? ({} as ThreadUserReadState);
      lastReadAt = ownReadState?.lastReadAt;
      // @ts-expect-error lastDeliveredAt is not defined yet on ThreadUserReadState
      lastDeliveredAt = ownReadState?.lastDeliveredAt;
      key = `${collection.channel.cid}:${collection.id}`;
      // todo: remove return statement once marking messages as delivered in thread is supported
      return;
    } else {
      return;
    }

    if (!key) return;

    const [latestMessage] = latestMessages.slice(-1);

    const wholeCollectionIsRead =
      !latestMessage || lastReadAt >= latestMessage.created_at;
    if (wholeCollectionIsRead) return { key, id: null };
    const wholeCollectionIsMarkedDelivered =
      !latestMessage || (lastDeliveredAt ?? 0) >= latestMessage.created_at;
    if (wholeCollectionIsMarkedDelivered) return { key, id: null };

    return { key, id: latestMessage.id || null };
  };

  /**
   * Updates the delivery candidates buffer with the latest delivery candidates.
   *
   * @param collection - The channel or thread whose latest delivery candidate to track.
   */
  private trackDeliveredCandidate(collection: Channel | Thread) {
    if (!MessageDeliveryReporter.hasPermissionToReportDeliveryFor(collection)) return;
    const candidate = this.getNextDeliveryReportCandidate(collection);
    if (!candidate?.key) return;
    const buffer = this.markDeliveredRequestInFlight
      ? this.nextDeliveryReportCandidates
      : this.deliveryReportCandidates;
    if (candidate.id === null) buffer.delete(candidate.key);
    else buffer.set(candidate.key, candidate.id);
  }

  /**
   * Removes a candidate from the delivery report buffer.
   *
   * @param collection - The channel or thread whose candidate should be removed.
   */
  private removeCandidateFor(collection: Channel | Thread) {
    const candidateKey = this.candidateKeyFor(collection);
    if (!candidateKey) return;
    this.deliveryReportCandidates.delete(candidateKey);
    this.nextDeliveryReportCandidates.delete(candidateKey);
  }

  /**
   * Records the latest message delivered for Channel or Thread instances and schedules the next
   * report if not already scheduled and candidates exist. Should be used for WS handling
   * (`message.new`) as well as for ingesting HTTP channel query results.
   *
   * @param collections - The channels or threads whose candidates should be synced.
   */
  public syncDeliveredCandidates(collections: (Channel | Thread)[]) {
    if (this.client.user?.privacy_settings?.delivery_receipts?.enabled === false) return;
    for (const c of collections) this.trackDeliveredCandidate(c);
    this.announceDeliveryBuffered();
  }

  /**
   * Fires a delivery announcement request followed by an immediate delivery candidate buffer reset.
   *
   * @param options - Flags forwarded to `client.markDelivered` (optional).
   */
  public announceDelivery = (options?: AnnounceDeliveryOptions) => {
    if (!this.canExecuteRequest) return;

    const { latest_delivered_messages, sendBuffer } =
      this.confirmationsFromDeliveryReportCandidates();
    if (!latest_delivered_messages.length) return;

    const payload = { ...options, latest_delivered_messages };

    const postFlightReconcile = ({
      preventSchedulingRetry,
    }: { preventSchedulingRetry?: boolean } = {}) => {
      this.markDeliveredRequestPromise = null;

      // promote anything that arrived during request
      for (const [k, v] of this.nextDeliveryReportCandidates.entries()) {
        this.deliveryReportCandidates.set(k, v);
      }
      this.nextDeliveryReportCandidates = new Map();

      if (preventSchedulingRetry) return;
      // checks internally whether there are candidates to announce
      this.announceDeliveryBuffered(options);
    };

    const handleSuccess = () => {
      this.resetBackOff();
      postFlightReconcile();
    };

    const handleError = (error: StreamAPIError | Error) => {
      // re-populate relevant candidates for the next report
      // but make sure to keep the items that failed to be reported the first next time
      const newDeliveryReportCandidates = new Map(sendBuffer);
      for (const [k, v] of this.deliveryReportCandidates.entries()) {
        newDeliveryReportCandidates.set(k, v);
      }
      this.deliveryReportCandidates = newDeliveryReportCandidates;

      if (
        (isAPIError(error) && isErrorRetryable(error)) ||
        (typeof (error as StreamAPIError).status === 'number' &&
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (error as StreamAPIError).status! >= 500)
      ) {
        this.increaseBackOff();
        postFlightReconcile();
      } else {
        postFlightReconcile({ preventSchedulingRetry: true });
      }
    };

    this.markDeliveredRequestPromise = this.client
      .markDelivered(payload)
      .then(handleSuccess, handleError);
  };

  public announceDeliveryBuffered = (options?: AnnounceDeliveryOptions) => {
    if (this.hasTimer || !this.canExecuteRequest) return;
    this.markDeliveredTimeout = setTimeout(() => {
      this.markDeliveredTimeout = null;
      this.announceDelivery(options);
    }, this.requestTimeoutMs);
  };

  /**
   * Delegates the mark-read call to the Channel or Thread instance.
   *
   * @param collection - The channel or thread to mark as read.
   * @param options - Flags forwarded to the underlying `markRead` call (optional).
   * @returns The server response, or `null` when the collection is unsupported.
   */
  public markRead = async (collection: Channel | Thread, options?: MarkReadRequest) => {
    if (!userHasReadReceipts(this.client)) return null;
    const isThreadCollection = isThread(collection);
    const channel = isThreadCollection ? collection.channel : collection;
    const requestOptions = isThreadCollection
      ? { ...options, thread_id: collection.id }
      : options;

    let result: EventAPIResponse | StreamResponse<Gen_MarkReadResponse> | null = null;

    if (isThreadCollection) {
      const markReadRequestHandler = collection.configState.getLatestValue()
        .requestHandlers?.markReadRequest as
        | ((params: {
            thread: Thread;
            options?: MarkReadRequest;
          }) => Promise<EventAPIResponse | null> | void)
        | undefined;
      result = markReadRequestHandler
        ? ((await markReadRequestHandler({
            options: requestOptions,
            thread: collection,
          })) ?? null)
        : await channel.markRead(requestOptions);
    } else {
      const markReadRequestHandler = channel.configState.getLatestValue().requestHandlers
        ?.markReadRequest as
        | ((params: {
            channel: Channel;
            options?: MarkReadRequest;
          }) => Promise<EventAPIResponse | null> | void)
        | undefined;
      result = markReadRequestHandler
        ? ((await markReadRequestHandler({ channel, options: requestOptions })) ?? null)
        : await channel.markRead(requestOptions);
    }

    this.removeCandidateFor(collection);
    return result;
  };

  /**
   * Builds the throttled `markRead`. A factory rather than an inline `throttle(...)` so the interval can
   * be swapped later — see {@link setMarkAsReadThrottleOptions}.
   *
   * @param intervalMs - minimum gap between automatic `markRead` calls
   */
  // Auto mark-read is throttled and fire-and-forget: it's triggered by state changes / WS events,
  // not by an awaiting caller, so a rejection here has nowhere to propagate and would otherwise
  // surface as an unhandled rejection (e.g. `channel.markRead` throwing when read events are
  // disabled, or a transient network error). Swallow it — the auto path retries on the next
  // trigger, and explicit `markRead()` callers still receive the error.
  private buildThrottledMarkRead = (intervalMs: number) =>
    throttle(
      (collection: Channel | Thread, options?: MarkReadRequest) => {
        void this.markRead(collection, options).catch(() => undefined);
      },
      intervalMs,
      { leading: true, trailing: true },
    ).throttledFn;

  public throttledMarkRead = this.buildThrottledMarkRead(
    DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG.markAsReadThrottleTimeoutMs,
  );
}
