import type { StreamChat } from '../client';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import type { StateStore } from '@stream-io/state-store';
import { ConfigController } from '../configuration/ConfigController';
import { Channel } from '../channel';
import type { ThreadUserReadState } from '../thread';
import { Thread } from '../thread';
import type {
  LocalMessage,
  MarkDeliveredRequest,
  MarkReadRequest,
  MarkReadResponse,
  StreamAPIError,
  StreamResponse,
  TimestampNS,
} from '../types';
import { throttle } from '../utils';
import { isAPIError, isErrorRetryable } from '../errors';

export type MessageDeliveryReporterConfig = {
  /** How long delivery reports are buffered before being sent as one batch. Defaults to 1000ms. */
  markAsDeliveredBufferTimeoutMs: number;
  /**
   * Minimum gap between automatic `markRead` calls for the same channel or thread. Changes rebuild
   * the throttles. Defaults to 1000ms.
   */
  markAsReadThrottleTimeoutMs: number;
  /** Most delivery receipts sent in one request; the rest go in the next. Defaults to 100. */
  maxDeliveredMessageCountInPayload: number;
  /**
   * Most times consecutive retryable failures double the buffer window. A success resets it.
   * Defaults to 3.
   */
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
  // Capped at `config.retryCountLimitForTimeoutIncrease`.
  protected requestRetryCount: number = 0;

  private readonly configController: ConfigController<MessageDeliveryReporterConfig>;
  get configState(): StateStore<MessageDeliveryReporterConfig> {
    return this.configController.state;
  }

  constructor({ client }: MessageDeliveryReporterOptions) {
    this.client = client;
    this.configController = new ConfigController<MessageDeliveryReporterConfig>({
      defaults: DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG,
      // The throttle captures its interval, so it is rebuilt whenever the interval changes.
      onChanged: (next, previous) => {
        if (next.markAsReadThrottleTimeoutMs === previous.markAsReadThrottleTimeoutMs)
          return;
        this.throttledMarkRead = this.buildThrottledMarkRead(
          next.markAsReadThrottleTimeoutMs,
        );
      },
    });
  }

  get config(): Readonly<MessageDeliveryReporterConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - Fields to merge into the resolved config.
   */
  updateConfig(config: Partial<MessageDeliveryReporterConfig>) {
    this.configController.patch(config);
  }

  /**
   * Re-derives the configuration from the declarative slice.
   *
   * @param config - The declarative slice. Leave it out to rebuild from the defaults.
   */
  initializeConfig(config?: Partial<MessageDeliveryReporterConfig>) {
    this.configController.initialize(config);
  }

  /** Sets `markAsReadThrottleTimeoutMs`, which rebuilds the `markRead` throttle. */
  setMarkAsReadThrottleOptions = ({
    markAsReadThrottleTimeoutMs,
  }: Pick<MessageDeliveryReporterConfig, 'markAsReadThrottleTimeoutMs'>) => {
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
    if (isChannel(collection)) return collection.config.deliveryEvents.enabled;
    if (isThread(collection)) return collection.channel.config.deliveryEvents.enabled;
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

  /** Builds the `latest_delivered_messages` payload from a candidates buffer. */
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

  /** The buffer key: the channel `cid`, or `cid:threadId` for a thread. */
  private candidateKeyFor(
    collection: Channel | Thread,
  ): ChannelThreadCompositeId | undefined {
    if (isChannel(collection)) return collection.cid;
    if (isThread(collection)) return `${collection.channel.cid}:${collection.id}`;
  }

  /** The latest message that is neither read nor reported as delivered (`id: null` when none). */
  private getNextDeliveryReportCandidate = (
    collection: Channel | Thread,
  ): { key: ChannelThreadCompositeId; id: MessageId | null } | undefined => {
    const ownUserId = this.client.user?.id;
    if (!ownUserId) return;

    // The newest message the collection knows, whether or not the interval holding it is loaded: a
    // message received live while an older interval is active is still delivered.
    let latestMessage: LocalMessage | null = null;
    // Unix nanoseconds, comparable with a message's `created_at`.
    let lastDeliveredAt: TimestampNS | undefined;
    let lastReadAt: TimestampNS | undefined;
    let key: string | undefined = undefined;

    // todo: unify the API for read state access btw channel and threads
    if (isChannel(collection)) {
      latestMessage = collection.messagePaginator.latestMessage;
      const ownReadState = collection.state.read[ownUserId] ?? {};
      lastReadAt = ownReadState?.last_read;
      lastDeliveredAt = ownReadState?.last_delivered_at;
      key = collection.cid;
    } else if (isThread(collection)) {
      // The newest reply, as for channels: the active interval may be scrolled away from it.
      latestMessage = collection.messagePaginator.latestMessage;
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
    if (!latestMessage) return { key, id: null };

    const wholeCollectionIsRead = (lastReadAt ?? 0) >= latestMessage.created_at;
    if (wholeCollectionIsRead) return { key, id: null };
    const wholeCollectionIsMarkedDelivered =
      (lastDeliveredAt ?? 0) >= latestMessage.created_at;
    if (wholeCollectionIsMarkedDelivered) return { key, id: null };

    return { key, id: latestMessage.id || null };
  };

  // Candidates found while a request is in flight wait in the next buffer.
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

  private removeCandidateFor(collection: Channel | Thread) {
    const candidateKey = this.candidateKeyFor(collection);
    if (!candidateKey) return;
    this.deliveryReportCandidates.delete(candidateKey);
    this.nextDeliveryReportCandidates.delete(candidateKey);
  }

  /**
   * Records each collection's latest undelivered message and schedules a report if none is
   * pending. For WS handling (`message.new`) and for ingesting channel query results.
   *
   * @param collections - The channels or threads whose candidates should be synced.
   */
  public syncDeliveredCandidates(collections: (Channel | Thread)[]) {
    if (this.client.user?.privacy_settings?.delivery_receipts?.enabled === false) return;
    for (const c of collections) this.trackDeliveredCandidate(c);
    this.announceDeliveryBuffered();
  }

  /**
   * Sends the buffered report immediately, at most `maxDeliveredMessageCountInPayload` entries.
   *
   * @param options - Flags forwarded to `client.markDelivered`.
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

      // Promote candidates that arrived during the request.
      for (const [k, v] of this.nextDeliveryReportCandidates.entries()) {
        this.deliveryReportCandidates.set(k, v);
      }
      this.nextDeliveryReportCandidates = new Map();

      if (preventSchedulingRetry) return;
      // Checks internally whether there are candidates to announce.
      this.announceDeliveryBuffered(options);
    };

    const handleSuccess = () => {
      this.resetBackOff();
      postFlightReconcile();
    };

    const handleError = (error: StreamAPIError | Error) => {
      // Requeue the failed batch ahead of the remaining candidates, so it is retried first.
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
   * Marks the channel or thread read. A channel with read events disabled is marked read locally when
   * `localUnreadCountEnabled` is set.
   *
   * @param collection - The channel or thread to mark as read.
   * @param options - Flags forwarded to the underlying `markRead` call.
   * @returns The server response, or `null` when no request went out.
   */
  public markRead = async (collection: Channel | Thread, options?: MarkReadRequest) => {
    const isThreadCollection = isThread(collection);
    const channel = isThreadCollection ? collection.channel : collection;
    const requestOptions = isThreadCollection
      ? { ...options, thread_id: collection.id }
      : options;

    let result: Partial<StreamResponse<MarkReadResponse>> | null = null;

    if (isThreadCollection) {
      const markReadRequestHandler =
        collection.configState.getLatestValue().requestHandlers?.markReadRequest;
      result = markReadRequestHandler
        ? ((await markReadRequestHandler({
            options: requestOptions,
            thread: collection,
          })) ?? null)
        : await channel.markRead(requestOptions);
    } else {
      const { readEvents, requestHandlers } = channel.configState.getLatestValue();
      const markReadRequestHandler = requestHandlers?.markReadRequest;
      // Without read events `channel.markRead()` throws, so reset unread locally (threads have their own
      // read state and are not affected).
      if (markReadRequestHandler) {
        result =
          (await markReadRequestHandler({ channel, options: requestOptions })) ?? null;
      } else if (!readEvents.enabled && readEvents.localUnreadCountEnabled) {
        channel.markReadLocally();
      } else {
        result = await channel.markRead(requestOptions);
      }
    }

    // A read implies delivery, so the candidate is dropped only if a request went out (a declining
    // `markReadRequest` handler returns nothing).
    if (result) this.removeCandidateFor(collection);
    return result;
  };

  // Fire-and-forget: no caller awaits an automatic mark-read, so rejections are swallowed (the next
  // trigger retries; explicit `markRead()` callers still get the error). One throttle per collection:
  // a shared one keeps only the latest call for its trailing edge and would drop another
  // collection's pending mark-read.
  private buildThrottledMarkRead = (intervalMs: number) => {
    const throttled = new WeakMap<
      Channel | Thread,
      (options?: MarkReadRequest) => void
    >();
    return (collection: Channel | Thread, options?: MarkReadRequest) => {
      let markRead = throttled.get(collection);
      if (!markRead) {
        markRead = throttle(
          (markReadOptions?: MarkReadRequest) => {
            void this.markRead(collection, markReadOptions).catch(() => undefined);
          },
          intervalMs,
          { leading: true, trailing: true },
        ).throttledFn;
        throttled.set(collection, markRead);
      }
      markRead(options);
    };
  };

  public throttledMarkRead = this.buildThrottledMarkRead(
    DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG.markAsReadThrottleTimeoutMs,
  );
}
