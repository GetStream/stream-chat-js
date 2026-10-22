import { StateStore } from '@stream-io/state-store';
import { getMessageCreatedAtTimestamp } from './pagination/paginators/MessageIntervalPaginator';
import { nowNs, nsToMs } from './utils/time';
import type { ChannelResponse, LocalMessage, TimestampNS } from './types';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { Channel } from './channel';

export type CooldownTimerState = {
  /** Slow mode cooldown interval in seconds. Change reported via channel.updated WS event. */
  cooldownConfigSeconds: number;
  /** Whether the current user can skip slow mode. Change is not reported via WS. */
  canSkipCooldown: boolean;
  /** Creation time of the current user's latest message in this channel, in unix nanoseconds. */
  ownLatestMessageTimestamp?: TimestampNS;
  /** Remaining cooldown in whole seconds (rounded). */
  cooldownRemaining: number;
};

export class CooldownTimer extends WithSubscriptions {
  public readonly state: StateStore<CooldownTimerState>;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private channel: Channel;

  constructor({ channel }: { channel: Channel }) {
    super();
    this.channel = channel;
    this.state = new StateStore<CooldownTimerState>({
      cooldownConfigSeconds: 0,
      cooldownRemaining: 0,
      ownLatestMessageTimestamp: undefined,
      canSkipCooldown: false,
    });
    this.refresh();
  }

  get cooldownConfigSeconds() {
    return this.state.getLatestValue().cooldownConfigSeconds;
  }

  get cooldownRemaining() {
    return this.state.getLatestValue().cooldownRemaining;
  }

  get canSkipCooldown() {
    return this.state.getLatestValue().canSkipCooldown;
  }

  get ownLatestMessageTimestamp() {
    return this.state.getLatestValue().ownLatestMessageTimestamp;
  }

  /**
   * Derives the timer from `channel.state` (`cooldown`, `ownCapabilities`) and the message
   * paginator's store (the current user's latest message). `Channel` registers it on construction
   * and unregisters it in `disconnect`.
   */
  public registerSubscriptions = () => {
    this.incrementRefCount();
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(
      this.channel.state.subscribeWithSelector(
        ({ data, ownCapabilities }) => ({ cooldown: data?.cooldown, ownCapabilities }),
        () => this.refresh(),
      ),
    );

    // Selects `items`, not the derived timestamp: any ingest can change the own-latest message, and
    // `refresh` publishes only when an input moved.
    this.addUnsubscribeFunction(
      this.channel.messagePaginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        () => this.refresh(),
      ),
    );

    this.addUnsubscribeFunction(() => this.clearTimeout());
  };

  public setCooldownRemaining = (cooldownRemaining: number) => {
    this.state.partialNext({ cooldownRemaining });
  };

  public clearTimeout = () => {
    if (!this.timeout) return;
    clearTimeout(this.timeout);
    this.timeout = null;
  };

  public refresh = () => {
    const { cooldown: cooldownConfigSeconds = 0, own_capabilities } = (this.channel
      .data ?? {}) as Partial<ChannelResponse>;
    const canSkipCooldown = (own_capabilities ?? []).includes('skip-slow-mode');

    const paginator = this.channel.messagePaginator;
    // The newest messages: the interval that reaches the newest message, and the live messages
    // received while it was not loaded. Without that interval an own message may sit in the part
    // not loaded, so the timestamp already known is kept rather than cleared.
    const ownLatestMessageTimestamp =
      this.findOwnLatestMessageTimestamp({
        messages: [...paginator.anchoredHeadItems, ...paginator.logicalHeadItems],
      }) ??
      (paginator.anchoredHeadItem !== undefined
        ? undefined
        : this.ownLatestMessageTimestamp);

    if (
      cooldownConfigSeconds !== this.cooldownConfigSeconds ||
      ownLatestMessageTimestamp !== this.ownLatestMessageTimestamp ||
      canSkipCooldown !== this.canSkipCooldown
    ) {
      this.state.partialNext({
        cooldownConfigSeconds,
        ownLatestMessageTimestamp,
        canSkipCooldown,
      });
    }

    if (this.canSkipCooldown || this.cooldownConfigSeconds === 0) {
      this.clearTimeout();
      if (this.cooldownRemaining !== 0) {
        this.setCooldownRemaining(0);
      }
      return;
    }

    this.recalculate();
  };

  /**
   * Sets the own latest message timestamp and recomputes the remaining time.
   *
   * @param timestamp - Unix nanoseconds, as the API sends it.
   */
  public setOwnLatestMessageTimestamp = (timestamp: TimestampNS | undefined) => {
    this.state.partialNext({ ownLatestMessageTimestamp: timestamp });
    this.recalculate();
  };

  private getOwnUserId() {
    const client = this.channel.getClient();
    return client.userId ?? client.user?.id;
  }

  private findOwnLatestMessageTimestamp({
    messages,
  }: {
    messages: LocalMessage[];
  }): TimestampNS | undefined {
    const ownUserId = this.getOwnUserId();
    if (!ownUserId) return undefined;

    let latest: TimestampNS | undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.user?.id !== ownUserId) continue;
      const createdAt = getMessageCreatedAtTimestamp(message);
      if (createdAt === null) continue;
      if (latest === undefined || createdAt > latest) {
        latest = createdAt;
      }
      if (latest > createdAt) break;
    }
    return latest;
  }

  private recalculate = () => {
    this.clearTimeout();

    const { cooldownConfigSeconds, ownLatestMessageTimestamp, canSkipCooldown } =
      this.state.getLatestValue();

    const timeSinceOwnLastMessage =
      ownLatestMessageTimestamp != null
        ? // Clamped at 0. The timestamps are in nanoseconds, the cooldown config in seconds.
          Math.max(0, nsToMs(nowNs() - ownLatestMessageTimestamp) / 1000)
        : undefined;

    const remaining =
      !canSkipCooldown &&
      typeof timeSinceOwnLastMessage !== 'undefined' &&
      cooldownConfigSeconds > timeSinceOwnLastMessage
        ? Math.round(cooldownConfigSeconds - timeSinceOwnLastMessage)
        : 0;

    if (remaining !== this.cooldownRemaining) {
      this.setCooldownRemaining(remaining);
    }

    if (remaining <= 0) return;

    this.timeout = setTimeout(() => {
      this.recalculate();
    }, 1000);
  };
}
