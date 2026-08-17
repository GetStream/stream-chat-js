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
   * Opt-in event handling for a timer driven on its own.
   *
   * **Nothing in this package calls this**, and that is deliberate rather than an oversight: the owning
   * `Channel` refreshes the timer imperatively from `query()`, from its `message.new` and `channel.updated`
   * handlers, and from `updatePartial()`. Each subscription below therefore duplicates a refresh the
   * channel already performs — `channel.updated` unconditionally, which is broader than the guard here.
   *
   * So do not read a subscription here as the thing that makes a case work. It shipped in v9.50.3
   * unregistered too, and a `capabilities.changed` handler was added here on the assumption it closed a
   * gap; the gap was real but the fix was inert, and it is `Channel.updatePartial` that closes it.
   *
   * Kept because it is released surface an integrator can still use to drive a timer the channel does not.
   */
  public registerSubscriptions = () => {
    this.incrementRefCount();
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(
      this.channel.on('message.new', (event) => {
        const isOwnMessage =
          event.message?.user?.id && event.message.user.id === this.getOwnUserId();
        if (!isOwnMessage) return;
        this.setOwnLatestMessageDate(toDateOrUndefined(event.message?.created_at));
      }).unsubscribe,
    );

    this.addUnsubscribeFunction(
      this.channel.on('channel.updated', (event) => {
        const cooldownChanged = event.channel?.cooldown !== this.cooldownConfigSeconds;
        if (!cooldownChanged) return;
        this.refresh();
      }).unsubscribe,
    );

    // `canSkipCooldown` derives from `own_capabilities`, which can change without `cooldown` changing — and
    // the guard above filters exactly that case out. Unguarded on purpose: `refresh()` already no-ops
    // unless one of its inputs actually moved.
    this.addUnsubscribeFunction(
      this.channel.on('capabilities.changed', () => {
        this.refresh();
      }).unsubscribe,
    );
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
