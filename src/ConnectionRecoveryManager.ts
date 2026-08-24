import { WithSubscriptions } from './utils/WithSubscriptions';
import { chatLoggerSystem } from './logger';
import type { StreamChat } from './client';
import type { AbstractOfflineDB } from './offline-support/offline_support_api';
import type { Channel } from './channel';
import type { Unsubscribe } from './store';

const logger = chatLoggerSystem.getLogger('client');

/**
 * Owns connection recovery: after the socket comes back, brings the surfaces the app is actually
 * consuming back in line with the server.
 *
 * Recovery is deliberately narrow — two things, and nothing else:
 *
 * 1. **Every loaded channel list re-runs its own first-page query** (`ChannelManager.recover`). Since
 *    `queryChannels` watches by default, that also re-establishes the watches for the channels on
 *    that page.
 * 2. **Every active channel reloads itself** (`Channel.reload`), because a list page carries far fewer
 *    messages per channel than an open channel's loaded window, so the open channel cannot be served
 *    by the list query.
 *
 * It is explicitly **not** a sweep over `client.activeChannels`. Watches are a bounded server
 * resource, and after any scrolling that cache holds far more channels than a query returns — so
 * re-watching all of them would be both wasteful and a watch-limit hazard. Channels outside the
 * refreshed pages come back demand-driven, when an event proves them relevant (see
 * `restoreInterruptedWatch` in `ChannelManager`).
 *
 * This replaces the old `client.recoverState()` bulk query
 * (`cid: { $in: activeChannels }, limit: 30`), which invented its own query shape unrelated to any
 * list's filters and silently dropped everything past the thirtieth channel.
 *
 * ### Triggers, and why there are two
 *
 * One per surface, mirroring what the React Native SDK arrived at:
 *
 * - **Lists** — `connection.changed` with `online: true`. `ChannelPaginator.executeQuery` carries its
 *   own first-page deferral for the unsynced case, so the list query orders itself against the
 *   offline sync.
 * - **Active channels** — the offline DB's *sync-status edge* when offline support is enabled,
 *   `connection.changed` otherwise. `Channel.reload()` has no deferral of its own, so it has to be
 *   triggered by something that is already post-sync.
 *
 * The edge is what guarantees `executePendingTasks()` → `sync()` → query ordering, on every reconnect
 * path: `OfflineDBSyncManager` calls `invokeSyncStatusListeners(true)` **unconditionally** after
 * `syncAndExecutePendingTasks()` on each online transition — it does not require `syncStatus` to have
 * been `false` first. That matters because the going-offline `connection.changed` is 5s-debounced,
 * skipped entirely on a quick flap, and never dispatched at all by `closeConnection()` (mobile
 * backgrounding), so anything derived from *that* event is not a reliable signal. The edge is.
 *
 * Recovery deliberately keeps no "did we drop?" flag of its own: `ChannelWatchStatus.WasWatching`
 * already records exactly that, written from both truthful hooks
 * (`StableWSConnection._setHealth(false)` and `closeConnection()`).
 */
export class ConnectionRecoveryManager extends WithSubscriptions {
  client: StreamChat;
  /** Set while a recovery is in flight; only used to keep the logs readable. */
  private isRecovering = false;
  /** Undone by `unregisterSubscriptions`, so re-registering does not stack listeners. */
  private unsubscribeSyncStatus?: Unsubscribe;
  private unsubscribeOfflineDbInit?: Unsubscribe;

  constructor({ client }: { client: StreamChat }) {
    super();
    this.client = client;
  }

  /**
   * Whether the offline DB is attached AND finished initializing. Until it is, the sync-status edge
   * will never fire, so active-channel recovery has to stay on `connection.changed` — an offline DB
   * whose `init()` failed must not silently cost us recovery altogether.
   */
  private get usesSyncStatusTrigger() {
    const { offlineDb } = this.client;
    return !!offlineDb && offlineDb.state.getLatestValue().initialized;
  }

  public registerSubscriptions = () => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(
        this.client.on('connection.changed', (event) => {
          if (!event.online) return;

          // The lists always recover off this event; their own deferral handles offline ordering.
          this.recoverChannelLists();

          // Active channels recover off the sync-status edge whenever there is one to wait for.
          if (!this.usesSyncStatusTrigger) {
            this.recoverActiveChannels();
          }
        }).unsubscribe,
      );

      this.addUnsubscribeFunction(() => {
        this.unsubscribeSyncStatus?.();
        this.unsubscribeSyncStatus = undefined;
        this.unsubscribeOfflineDbInit?.();
        this.unsubscribeOfflineDbInit = undefined;
      });
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  };

  /**
   * Called by `client.setOfflineDBApi`, because the offline DB is attached after the client (and this
   * manager) already exist, and initialized later still. Watches `initialized` rather than assuming,
   * so the sync-status listener is registered at the first moment it can produce an edge.
   */
  public attachOfflineDb = (offlineDb: AbstractOfflineDB) => {
    this.unsubscribeOfflineDbInit?.();
    this.unsubscribeOfflineDbInit = offlineDb.state.subscribeWithSelector(
      (nextValue) => ({ initialized: nextValue.initialized }),
      ({ initialized }) => {
        if (!initialized) return;
        this.subscribeSyncStatus(offlineDb);
      },
    );
  };

  private subscribeSyncStatus = (offlineDb: AbstractOfflineDB) => {
    // Guard against a re-initialization publishing `initialized: true` twice.
    if (this.unsubscribeSyncStatus) return;

    const { unsubscribe } = offlineDb.syncManager.onSyncStatusChange((status) => {
      // `false` is only published when going offline; there is nothing to recover then.
      if (!status) return;
      this.recoverActiveChannels();
    });
    this.unsubscribeSyncStatus = unsubscribe;
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

  private recoverChannelLists = async () => {
    if (!this.client.recoverStateOnReconnect) return;
    await this.client.channelManager.recover();
  };

  private recoverActiveChannels = async () => {
    if (!this.client.recoverStateOnReconnect) return;

    const channels = this.recoverableActiveChannels;
    this.isRecovering = true;
    logger
      .withExtraTags('connectionRecovery')
      .info(`Recovering ${channels.length} active channel(s).`);

    // allSettled: one channel failing must not stop the others. Each failure is published on
    // `channel.state.lastReloadError` by `reload()` itself, so it is not lost here.
    await Promise.allSettled(channels.map((channel) => channel.reload()));

    this.isRecovering = false;

    // `connection.recovered` means "recovery finished". Dispatched from here rather than from
    // `recoverState()` so it fires on EVERY reconnect path — `recoverState()` is only ever called by
    // `StableWSConnection._reconnect()`, so a `closeConnection()` → `openConnection()` cycle (mobile
    // backgrounding) never produced it. Consumers keying post-recovery work off this event — the UI
    // SDKs' mark-read-on-catch-up among them — need it after the reload above, not before.
    this.client.dispatchEvent({ type: 'connection.recovered' });
  };

  /**
   * Run a full recovery now, without waiting for a connection event. This is what `recoverState()`
   * delegates to.
   */
  public recover = async () => {
    if (this.isRecovering) {
      logger
        .withExtraTags('connectionRecovery')
        .debug('A recovery is already in flight.');
    }
    await Promise.allSettled([this.recoverChannelLists(), this.recoverActiveChannels()]);
  };
}
