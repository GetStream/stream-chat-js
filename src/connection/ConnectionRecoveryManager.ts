import { WithSubscriptions } from '../utils/WithSubscriptions';
import { chatLoggerSystem } from '../logger';
import { runDetached } from '../utils';
import { ConfigController } from '../configuration/ConfigController';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import type { StreamChat } from '../client';
import type { Channel } from '../channel';
import type { Thread } from '../thread';
import type { StateStore, Unsubscribe } from '../store';

const logger = chatLoggerSystem.getLogger('client');

export type ConnectionRecoveryManagerConfig = {
  /**
   * Whether the client recovers its own state when the connection comes back.
   *
   * Set it to `false` only if the application recovers state itself — nothing is then re-queried or
   * re-watched on reconnect, and refreshing whatever is on screen becomes the consumer's job.
   * Read when a recovery actually runs, so flipping it takes effect from the next reconnect.
   */
  enabled: boolean;
};

export const DEFAULT_CONNECTION_RECOVERY_MANAGER_CONFIG: ConnectionRecoveryManagerConfig =
  deepFreezeConfig({ enabled: true });

/**
 * Owns connection recovery: after the socket comes back, brings the surfaces the app is actually
 * consuming back in line with the server.
 *
 * Recovery is deliberately narrow — three things, and nothing else:
 *
 * 1. **Every loaded channel list re-runs its own first-page query** (`ChannelManager.recover`). Since
 *    `queryChannels` watches by default, that also re-establishes the watches for the channels on
 *    that page.
 * 2. **Every active channel reloads itself** (`Channel.reload`), because a list page carries far fewer
 *    messages per channel than an open channel's loaded window, so the open channel cannot be served
 *    by the list query.
 * 3. **Every active thread reloads its replies** (`Thread.reload`), because none of the above touches
 *    them: a channel reload refreshes the main message list, and `ThreadManager`'s own recovery
 *    refreshes the thread *list*, reusing thread instances without rehydrating them unless something
 *    separately marked them stale — which only `user.watching.stop` does, never a reconnect.
 *
 * It is explicitly **not** a sweep over `client.activeChannels`. Watches are a bounded server
 * resource, and after any scrolling that cache holds far more channels than a query returns — so
 * re-watching all of them would be both wasteful and a watch-limit hazard. Channels outside the
 * refreshed pages come back demand-driven, when an event proves them relevant (see
 * `restoreInterruptedWatch` in `ChannelManager`).
 *
 * This replaces the removed `client.recoverState()` bulk query
 * (`cid: { $in: activeChannels }, limit: 30`), which invented its own query shape unrelated to any
 * list's filters and silently dropped everything past the thirtieth channel.
 *
 * ### Triggers, and why there are two
 *
 * One per surface, mirroring what the React Native SDK arrived at:
 *
 * - **Lists** — the socket's status store going online. `ChannelPaginator.executeQuery` carries its
 *   own first-page deferral for the unsynced case, so the list query orders itself against the
 *   offline sync.
 * - **Active channels** — the offline DB's *sync-status edge* when offline support is enabled, and
 *   that same store otherwise. `Channel.reload()` has no deferral of its own, so it has to be
 *   triggered by something that is already post-sync.
 *
 * The edge is what guarantees `executePendingTasks()` → `sync()` → query ordering, on every reconnect
 * path: `OfflineDBSyncManager` calls `invokeSyncStatusListeners(true)` **unconditionally** after
 * `syncAndExecutePendingTasks()` on each online transition — it does not require `syncStatus` to have
 * been `false` first. That matters because the sync edge, unlike anything derived from a single
 * transition, is guaranteed to land after the replay and the sync rather than alongside them.
 *
 * Recovery deliberately keeps no "did we drop?" flag of its own: `ChannelWatchStatus.WasWatching`
 * already records exactly that, written from both truthful hooks
 * (`StableWSConnection._setOnline(false)` and `closeConnection()`).
 */
export class ConnectionRecoveryManager extends WithSubscriptions {
  client: StreamChat;
  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<ConnectionRecoveryManagerConfig>;
  /** Set while a pass over the active channels and threads is in flight. */
  private isRecovering = false;
  /**
   * A reconnect that arrived while a pass was already running, so the pass re-runs when it finishes.
   *
   * A second pass cannot start alongside the first: they would reload every active channel twice and
   * race on {@link isRecovering}, the earlier one clearing it while the later is still going. Nor can
   * the reconnect simply be dropped — the running pass will withhold its `connection.recovered`
   * precisely because the socket moved under it, so nothing else would bring the newer connection's
   * state back in line.
   *
   * Re-entry is not hypothetical. The trigger is a subscription to the socket's status store, and a
   * reload that moves that status calls straight back into here before the first `await`.
   */
  private recoveryRequestedAgain = false;
  /** Undone by `unregisterSubscriptions`, so re-registering does not stack listeners. */
  private unsubscribeSyncStatus?: Unsubscribe;

  constructor({ client }: { client: StreamChat }) {
    super();
    this.configController = new ConfigController<ConnectionRecoveryManagerConfig>({
      defaults: DEFAULT_CONNECTION_RECOVERY_MANAGER_CONFIG,
    });
    this.client = client;
  }

  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<ConnectionRecoveryManagerConfig> {
    return this.configController.state;
  }

  /** The current resolved configuration. `Readonly` — change it through {@link updateConfig}. */
  public get config(): Readonly<ConnectionRecoveryManagerConfig> {
    return this.configState.getLatestValue();
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  public updateConfig(config: Partial<ConnectionRecoveryManagerConfig>) {
    this.configController.patch(config);
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice — the
   * derivation entry point every configurable entity exposes, so the client routes a slice here and
   * knows nothing about this manager's defaults or merge semantics.
   */
  public initializeConfig(config?: Partial<ConnectionRecoveryManagerConfig>) {
    this.configController.initialize(config);
  }

  public registerSubscriptions = () => {
    if (!this.hasSubscriptions) {
      // Driven by the socket's own status store, and by nothing else. Recovery is about what this
      // client missed while it could not reach the server, which is a fact the socket owns: the store
      // is written on every transition, including the deliberate close and the two error paths that
      // were always silent. The device's network is a separate signal that cannot start a recovery,
      // because a device regaining a network has no reconnected socket and no fresh connection ID yet,
      // so a query fired then would establish no watch.
      let wasHealthy: boolean | undefined;
      this.addUnsubscribeFunction(
        this.client.wsConnection.state.subscribeWithSelector(
          ({ isHealthy, lastUnhealthyAt }) => ({ isHealthy, lastUnhealthyAt }),
          ({ isHealthy, lastUnhealthyAt }) => {
            // The immediate first call is the current status rather than a change. Recovering off it
            // would re-query on nothing more than someone registering subscriptions.
            const previous = wasHealthy;
            wasHealthy = isHealthy;
            if (previous === undefined || !isHealthy) return;

            // A first connect is not a recovery: nothing was loaded to fall behind, so there is
            // nothing to bring back in line. `lastUnhealthyAt` is written by every drop, including
            // the deliberate `closeConnection()` that mobile backgrounding uses, so every real
            // reconnect still qualifies.
            if (!lastUnhealthyAt) return;

            // The lists always recover off this edge; their own deferral handles offline ordering.
            runDetached(this.recoverChannelLists(), { context: 'recoverChannelLists' });

            // Active channels recover off the offline sync-status edge whenever there is one — it is
            // the only signal guaranteed to be post-replay-post-sync. Exactly ONE of these two paths
            // runs per reconnect: binding the subscription is what makes the edge the driver, so the
            // same call reports which path applies. Deliberately not split into a separate predicate
            // — two independent reads of "is there an edge?" could disagree with each other.
            const syncEdgeDrivesActiveChannels = this.ensureSyncStatusSubscription();
            if (!syncEdgeDrivesActiveChannels) {
              runDetached(this.recoverActiveChannels(), {
                context: 'recoverActiveChannels',
              });
            }
          },
        ),
      );

      this.addUnsubscribeFunction(() => {
        this.unsubscribeSyncStatus?.();
        this.unsubscribeSyncStatus = undefined;
      });
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  };

  /**
   * Bind to the offline DB's sync-status edge, if there is one to bind to yet.
   *
   * Resolved off `this.client` rather than injected: the DB is already reachable there, it is simply
   * attached after this manager is constructed (and initialized later still), so the binding has to be
   * deferred rather than handed in. Doing it from the status handler is safe even when this manager's
   * subscription runs before the sync manager's: `OfflineDBSyncManager` awaits
   * `syncAndExecutePendingTasks()` before publishing, so the edge cannot land in the same synchronous
   * notification that registers us.
   *
   * An offline DB whose `init()` never succeeded publishes no edge, so it must not be treated as the
   * trigger — hence the `initialized` check, which also means a later successful init is picked up on
   * the next reconnect.
   *
   * @returns whether the sync-status edge is now driving active-channel recovery.
   */
  private ensureSyncStatusSubscription = (): boolean => {
    if (this.unsubscribeSyncStatus) return true;

    const { offlineDb } = this.client;
    if (!offlineDb?.state.getLatestValue().initialized) return false;

    const { unsubscribe } = offlineDb.syncManager.onSyncStatusChange((status) => {
      // `false` is only published when going offline; there is nothing to recover then.
      if (!status) return;
      runDetached(this.recoverActiveChannels(), { context: 'recoverActiveChannels' });
    });
    this.unsubscribeSyncStatus = unsubscribe;
    return true;
  };

  /**
   * The channels this recovery reloads: the ones a consumer has declared it is currently reading.
   *
   * Deliberately NOT filtered on `watchStatus`. A channel opened while offline never reached
   * `Watching` at all (its `watch()` threw, leaving `offlineMode`), so a `WasWatching` filter here
   * would permanently strand the single most important offline case. `Channel.reload()`'s own
   * `initialized || offlineMode` guard is the correct gate, and this is not a "restore a lost watch"
   * decision anyway — it is "the channel being read must show the truth".
   */
  private get recoverableActiveChannels(): Channel[] {
    const channels: Channel[] = [];
    for (const cid in this.client.activeChannels) {
      const channel = this.client.activeChannels[cid];
      if (channel?.active && !channel.pendingDisposal) channels.push(channel);
    }
    return channels;
  }

  /**
   * The threads this recovery reloads: the ones a consumer has declared it is displaying.
   *
   * Threads need their own pass because nothing else brings an open thread's replies back — a
   * channel reload refreshes the main message list, `ChannelManager.recover()` refreshes the channel
   * lists*, and `ThreadManager`'s own recovery refreshes the thread *list*, reusing existing
   * instances without rehydrating them unless they were separately marked stale (which only
   * `user.watching.stop` does, never a reconnect).
   *
   * `active` is the filter that matters: `threadsById` holds every thread the list has paged in,
   * which is not what should be re-fetched on a reconnect — only what someone is actually reading.
   * Guarded on the owning channel the same way active channels are: a thread whose channel is being
   * torn down has nothing to recover into.
   *
   * NOTE: `threadsById` is the thread LIST, not a thread cache. A thread opened from a message list
   * is constructed directly (`threadsById[id] ?? new Thread(...)`) and only reaches the list because
   * the UI SDKs adopt it there — prepended, once its replies have loaded — which is a workaround, not
   * a contract. Two consequences, both accepted for now and both narrow:
   *
   * - A reconnect landing before that adoption misses the thread. Self-limiting: the UI SDKs re-issue
   *   the load while the reply list is still unloaded, so a thread that failed to load gets adopted on
   *   the retry.
   * - `ThreadManager.reload()` rebuilds `state.threads` purely from the query response, so an adopted
   *   thread absent from that response is evicted while still active. It cannot bite within the
   *   reconnect that caused it: this getter is read before `connection.recovered` is dispatched, and
   *   that event is what triggers the UI SDKs' list reload. It would take a LATER reconnect, after an
   *   eviction, to miss the thread.
   *
   * The fix is a real off-list registry — see the commented-out `threadCache` in `ThreadManager` — at
   * which point this getter reads from that instead, with no change to the `active` filter.
   */
  private get recoverableActiveThreads(): Thread[] {
    const threads: Thread[] = [];
    for (const thread of Object.values(this.client.threads.threadsById)) {
      if (!thread) continue;
      // Read off state rather than a getter: `Thread` has no `active` accessor the way `Channel`
      // does, and adding one just for this would grow the public surface for a single internal read.
      const { active } = thread.state.getLatestValue();
      if (!active || thread.channel.pendingDisposal) continue;
      threads.push(thread);
    }
    return threads;
  }

  private recoverChannelLists = async () => {
    if (!this.config.enabled) return;
    await this.client.channelManager.recover();
  };

  private recoverActiveChannels = async ({ isRetry = false } = {}): Promise<void> => {
    if (!this.config.enabled) return;

    if (this.isRecovering) {
      this.recoveryRequestedAgain = true;
      return;
    }

    const channels = this.recoverableActiveChannels;
    const threads = this.recoverableActiveThreads;
    // Captured before the reloads so a drop *during* them can be detected afterwards. The timestamp
    // rather than the boolean, because a socket that drops and returns inside the recovery window has
    // still failed the reloads while ending up online again.
    //
    // The socket alone. Every reload is a request over it, so it is the connection whose failure
    // invalidates them, and its store records every transition including the deliberate close and the
    // two error paths. A device that loses its network takes the socket with it and is caught here
    // anyway, while a device whose network is merely unknown — every host without a reporter — would
    // otherwise have no protection at all.
    const socketDropBefore =
      this.client.wsConnection.state.getLatestValue().lastUnhealthyAt;
    this.isRecovering = true;
    logger
      .withExtraTags('connectionRecovery')
      .info(
        `Recovering ${channels.length} active channel(s) and ${threads.length} active thread(s).`,
      );

    // allSettled: one channel or thread failing must not stop the others. A failed refresh is not
    // surfaced anywhere — the loaded window simply stays as it was until the next reconnect, or until
    // a query the consumer itself issues records its own `lastQueryError` on the paginator. Channels
    // and threads are independent requests, so they run together rather than in sequence.
    await Promise.allSettled([
      ...channels.map((channel) => channel.reload()),
      ...threads.map((thread) => thread.reload()),
    ]);

    this.isRecovering = false;

    // A reconnect landed while the reloads were in flight, so what they fetched belongs to a
    // connection that is gone. Run once more against the current one: the check below withholds the
    // event for the same reason, and this is what stops that withholding from stranding.
    //
    // Once, not until it settles. A reload that keeps moving the socket would otherwise recur without
    // bound, and a connection still flapping after two passes is not one more query away from being
    // caught up. The next up-edge starts a fresh pass anyway, because this one has finished by then.
    const retryAfterReconnect = this.recoveryRequestedAgain && !isRetry;
    this.recoveryRequestedAgain = false;
    if (retryAfterReconnect) return await this.recoverActiveChannels({ isRetry: true });

    // `allSettled` above means a drop mid-recovery can fail every single reload while this still
    // reaches the end. Dispatching then would tell consumers that what is on screen is fresh when
    // none of it was refreshed — and the UI SDKs' mark-read-on-catch-up keys off this event, so it
    // would mark messages read that were never fetched.
    //
    // Withholding is safe rather than stranding: a drop guarantees a later reconnect, and that
    // recovery dispatches the event.
    const socket = this.client.wsConnection.state.getLatestValue();

    if (socket.lastUnhealthyAt !== socketDropBefore || !socket.isHealthy) {
      logger
        .withExtraTags('connectionRecovery')
        .info(
          'Recovery finished but the socket dropped while it ran; withholding connection.recovered.',
        );
      return;
    }

    // `connection.recovered` means "recovery finished". Dispatched from here so it fires on EVERY
    // reconnect path — the removed `recoverState()` was only ever called by
    // `StableWSConnection._reconnect()`, so a `closeConnection()` → `openConnection()` cycle (mobile
    // backgrounding) never produced it. Consumers keying post-recovery work off this event — the UI
    // SDKs' mark-read-on-catch-up among them — need it after the reload above, not before.
    this.client.dispatchEvent({ type: 'connection.recovered' });
  };

  /**
   * Run a full recovery now, without waiting for a connection event.
   *
   * A no-op while one is already running: {@link recoverActiveChannels} defers the request to the
   * end of the pass in flight rather than stacking a second one alongside it.
   */
  public recover = async () => {
    if (this.isRecovering) {
      logger
        .withExtraTags('connectionRecovery')
        .debug('A recovery is already in flight.');
      return;
    }
    await Promise.allSettled([this.recoverChannelLists(), this.recoverActiveChannels()]);
  };
}
