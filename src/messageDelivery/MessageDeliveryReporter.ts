import type { StreamChat } from '../client';
import { Channel } from '../channel';
import type { ThreadUserReadState } from '../thread';
import { Thread } from '../thread';
import type {
  EventAPIResponse,
  LocalMessage,
  MarkDeliveredOptions,
  MarkReadOptions,
} from '../types';
import { throttle } from '../utils';

const MAX_DELIVERED_MESSAGE_COUNT_IN_PAYLOAD = 100 as const;
const MARK_AS_DELIVERED_BUFFER_TIMEOUT = 1000 as const;
const MARK_AS_READ_THROTTLE_TIMEOUT = 1000 as const;

const isChannel = (item: Channel | Thread): item is Channel => item instanceof Channel;
const isThread = (item: Channel | Thread): item is Thread => item instanceof Thread;

type MessageId = string;
type ChannelThreadCompositeId = string;

export type AnnounceDeliveryOptions = Omit<
  MarkDeliveredOptions,
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

  protected markDeliveredRequestPromise: Promise<EventAPIResponse | void> | null = null;
  protected markDeliveredTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor({ client }: MessageDeliveryReporterOptions) {
    this.client = client;
  }

  private get markDeliveredRequestInFlight() {
    return this.markDeliveredRequestPromise !== null;
  }
  private get hasTimer() {
    return this.markDeliveredTimeout !== null;
  }
  private get hasDeliveryCandidates() {
    return this.deliveryReportCandidates.size > 0;
  }

  private static hasPermissionToReportDeliveryFor(collection: Channel | Thread) {
    if (isChannel(collection)) return !!collection.getConfig()?.delivery_events;
    if (isThread(collection)) return !!collection.channel.getConfig()?.delivery_events;
  }

  /**
   * Build latest_delivered_messages payload from an arbitrary buffer (deliveryReportCandidates / nextDeliveryReportCandidates)
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
    const sendBuffer = new Map(entries.slice(0, MAX_DELIVERED_MESSAGE_COUNT_IN_PAYLOAD));
    this.deliveryReportCandidates = new Map(
      entries.slice(MAX_DELIVERED_MESSAGE_COUNT_IN_PAYLOAD),
    );

    return { latest_delivered_messages: this.confirmationsFrom(sendBuffer), sendBuffer };
  }

  /**
   * Generate candidate key for storing in the candidates buffer
   * @param collection
   * @private
   */
  private candidateKeyFor(
    collection: Channel | Thread,
  ): ChannelThreadCompositeId | undefined {
    if (isChannel(collection)) return collection.cid;
    if (isThread(collection)) return `${collection.channel.cid}:${collection.id}`;
  }

  /**
   * Retrieve the reference to the latest message in the state that is nor read neither reported as delivered
   * @param collection
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

    if (isChannel(collection)) {
      latestMessages = collection.state.latestMessages;
      const ownReadState = collection.state.read[ownUserId] ?? {};
      lastReadAt = ownReadState?.last_read;
      lastDeliveredAt = ownReadState?.last_delivered_at;
      key = collection.cid;
    } else if (isThread(collection)) {
      latestMessages = collection.state.getLatestValue().replies;
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
   * Updates the delivery candidates buffer with the latest delivery candidates
   * @param collection
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
   * Removes candidate from the delivery report buffer
   * @param collection
   * @private
   */
  private removeCandidateFor(collection: Channel | Thread) {
    const candidateKey = this.candidateKeyFor(collection);
    if (!candidateKey) return;
    this.deliveryReportCandidates.delete(candidateKey);
    this.nextDeliveryReportCandidates.delete(candidateKey);
  }

  /**
   * Records the latest message delivered for Channel or Thread instances and schedules the next report
   * if not already scheduled and candidates exist.
   * Should be used for WS handling (message.new) as well as for ingesting HTTP channel query results.
   * @param collections
   */
  public syncDeliveredCandidates(collections: (Channel | Thread)[]) {
    if (this.client.user?.privacy_settings?.delivery_receipts?.enabled === false) return;
    for (const c of collections) this.trackDeliveredCandidate(c);
    this.announceDeliveryBuffered();
  }

  /**
   * Fires delivery announcement request followed by immediate delivery candidate buffer reset.
   * @param options
   */
  public announceDelivery = (options?: AnnounceDeliveryOptions) => {
    if (this.markDeliveredRequestInFlight || !this.hasDeliveryCandidates) return;

    const { latest_delivered_messages, sendBuffer } =
      this.confirmationsFromDeliveryReportCandidates();
    if (!latest_delivered_messages.length) return;

    const payload = { ...options, latest_delivered_messages };

    const postFlightReconcile = () => {
      this.markDeliveredRequestPromise = null;

      // promote anything that arrived during request
      for (const [k, v] of this.nextDeliveryReportCandidates.entries()) {
        this.deliveryReportCandidates.set(k, v);
      }
      this.nextDeliveryReportCandidates = new Map();

      // checks internally whether there are candidates to announce
      this.announceDeliveryBuffered(options);
    };

    const handleError = () => {
      // repopulate relevant candidates for the next report
      for (const [k, v] of Object.entries(sendBuffer)) {
        if (!this.deliveryReportCandidates.has(k)) {
          this.deliveryReportCandidates.set(k, v);
        }
      }
      postFlightReconcile();
    };

    this.markDeliveredRequestPromise = this.client
      .markChannelsDelivered(payload)
      .then(postFlightReconcile, handleError);
  };

  public announceDeliveryBuffered = (options?: AnnounceDeliveryOptions) => {
    if (this.hasTimer || this.markDeliveredRequestInFlight || !this.hasDeliveryCandidates)
      return;
    this.markDeliveredTimeout = setTimeout(() => {
      this.markDeliveredTimeout = null;
      this.announceDelivery(options);
    }, MARK_AS_DELIVERED_BUFFER_TIMEOUT);
  };

  /**
   * Delegates the mark-read call to the Channel or Thread instance
   * @param collection
   * @param options
   */
  public markRead = async (collection: Channel | Thread, options?: MarkReadOptions) => {
    let result: EventAPIResponse | null = null;
    if (isChannel(collection)) {
      result = await collection.markAsReadRequest(options);
    } else if (isThread(collection)) {
      result = await collection.channel.markAsReadRequest({
        ...options,
        thread_id: collection.id,
      });
    }

    this.removeCandidateFor(collection);
    return result;
  };

  /**
   * Throttles the MessageDeliveryReporter.markRead call
   * @param collection
   * @param options
   */
  public throttledMarkRead = throttle(this.markRead, MARK_AS_READ_THROTTLE_TIMEOUT, {
    leading: false,
    trailing: true,
  });
}
