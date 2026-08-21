import { StateStore } from './store';
import type { ChannelResponse, LocalMessage } from './types';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { Channel } from './channel';

export type CooldownTimerState = {
  /**
   * Slow mode cooldown interval in seconds. Change reported via channel.updated WS event.
   */
  cooldownConfigSeconds: number;
  /**
   * Whether the current user can skip slow mode. Change is not reported via WS.
   */
  canSkipCooldown: boolean;
  /**
   * Latest message creation date authored by the current user in this channel. Change reported via message.new WS event.
   */
  ownLatestMessageDate?: Date;
  /**
   * Remaining cooldown in whole seconds (rounded).
   */
  cooldownRemaining: number;
};

const toDateOrUndefined = (value: unknown): Date | undefined => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
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
      ownLatestMessageDate: undefined,
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

  get ownLatestMessageDate() {
    return this.state.getLatestValue().ownLatestMessageDate;
  }

  /**
   * Subscribes the timer to the two stores it derives from — `channel.state` for `cooldown` and
   * `ownCapabilities`, the message paginator's store for the current user's latest message.
   *
   * `Channel` calls this right after constructing the timer and unregisters it in `_disconnect`, the same
   * way it drives `messageReceiptsTracker`. That replaces four imperative `cooldownTimer.refresh()` calls
   * in `Channel`, and the three WS-event handlers that used to live here — which duplicated those calls
   * and never ran, because nothing registered them. Between them the two arrangements still missed every
   * `query()`, and any `updatePartial` that changed `cooldown` without changing capabilities.
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

    // `ownLatestMessageDate` comes from the paginator's head interval. Selected on `items` rather than on
    // the derived date: any ingest can change which message is the own-latest, and `refresh` already
    // declines to publish unless one of its inputs actually moved.
    this.addUnsubscribeFunction(
      this.channel.messagePaginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        () => this.refresh(),
      ),
    );

    // The countdown has no reason to keep running once the timer stops deriving.
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

    const ownLatestMessageDate = this.findOwnLatestMessageDate({
      messages: this.channel.messagePaginator.headItems,
    });

    if (
      cooldownConfigSeconds !== this.cooldownConfigSeconds ||
      ownLatestMessageDate?.getTime() !== this.ownLatestMessageDate?.getTime() ||
      canSkipCooldown !== this.canSkipCooldown
    ) {
      this.state.partialNext({
        cooldownConfigSeconds,
        ownLatestMessageDate,
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
   * Updates the known latest own message date and recomputes remaining time.
   * Prefer calling this when you already know the message date (e.g. from an event).
   */
  public setOwnLatestMessageDate = (date: Date | undefined) => {
    this.state.partialNext({ ownLatestMessageDate: date });
    this.recalculate();
  };

  private getOwnUserId() {
    const client = this.channel.getClient();
    return client.userId ?? client.user?.id;
  }

  private findOwnLatestMessageDate({
    messages,
  }: {
    messages: LocalMessage[];
  }): Date | undefined {
    const ownUserId = this.getOwnUserId();
    if (!ownUserId) return undefined;

    let latest: Date | undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.user?.id !== ownUserId) continue;
      const createdAt = toDateOrUndefined(message.created_at);
      if (!createdAt) continue;
      if (!latest || createdAt.getTime() > latest.getTime()) {
        latest = createdAt;
      }
      if (latest.getTime() > createdAt.getTime()) break;
    }
    return latest;
  }

  private recalculate = () => {
    this.clearTimeout();

    const { cooldownConfigSeconds, ownLatestMessageDate, canSkipCooldown } =
      this.state.getLatestValue();

    const timeSinceOwnLastMessage =
      ownLatestMessageDate != null
        ? // prevent negative values
          Math.max(0, (Date.now() - ownLatestMessageDate.getTime()) / 1000)
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
