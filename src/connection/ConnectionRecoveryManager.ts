import { WithSubscriptions } from '../utils/WithSubscriptions';
import { chatLoggerSystem } from '../logger';
import { runDetached } from '../utils';
import { ConfigController } from '../configuration/ConfigController';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import type { StreamChat } from '../client';
import type { Channel } from '../channel';
import type { Thread } from '../thread';
import type { StateStore, Unsubscribe } from '@stream-io/state-store';

const logger = chatLoggerSystem.getLogger('client');

export type ConnectionRecoveryManagerConfig = {
  /** Whether the client recovers its own state on reconnect. Set `false` if the app does it itself. */
  enabled: boolean;
};

export const DEFAULT_CONNECTION_RECOVERY_MANAGER_CONFIG: ConnectionRecoveryManagerConfig =
  deepFreezeConfig({ enabled: true });

/**
 * After a reconnect, brings what the app is consuming back in line with the server:
 * 1. loaded channel lists re-run their first-page query (`ChannelManager.recover`), re-watching it;
 * 2. active channels reload (`Channel.reload`);
 * 3. active threads reload their replies (`Thread.reload`).
 *
 * It does not sweep the channel store (watches are a bounded server resource). Other channels recover
 * on demand, when an event proves them relevant.
 *
 * Lists and active channels recover on the offline DB's sync-status edge when offline support is on (it
 * lands after pending tasks replay), else when the socket goes online.
 */
export class ConnectionRecoveryManager extends WithSubscriptions {
  client: StreamChat;
  private readonly configController: ConfigController<ConnectionRecoveryManagerConfig>;
  /** Set while a pass over the active channels and threads is in flight. */
  private isRecovering = false;
  /** A reconnect that arrived mid-pass: re-run once when the pass finishes, not concurrently. */
  private recoveryRequestedAgain = false;
  private unsubscribeSyncStatus?: Unsubscribe;

  constructor({ client }: { client: StreamChat }) {
    super();
    this.configController = new ConfigController<ConnectionRecoveryManagerConfig>({
      defaults: DEFAULT_CONNECTION_RECOVERY_MANAGER_CONFIG,
    });
    this.client = client;
  }

  get configState(): StateStore<ConnectionRecoveryManagerConfig> {
    return this.configController.state;
  }

  public get config(): Readonly<ConnectionRecoveryManagerConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - Fields to merge into the resolved config.
   */
  public updateConfig(config: Partial<ConnectionRecoveryManagerConfig>) {
    this.configController.patch(config);
  }

  /**
   * Re-derives the configuration from the declarative slice.
   *
   * @param config - The declarative slice. Leave it out to rebuild from the defaults.
   */
  public initializeConfig(config?: Partial<ConnectionRecoveryManagerConfig>) {
    this.configController.initialize(config);
  }

  public registerSubscriptions = () => {
    if (!this.hasSubscriptions) {
      // Driven by the socket status alone, which records every transition. A regained device network
      // cannot start a recovery: there is no connection ID to watch with yet.
      let wasHealthy: boolean | undefined;
      this.addUnsubscribeFunction(
        this.client.wsConnection.state.subscribeWithSelector(
          ({ isHealthy, lastUnhealthyAt }) => ({ isHealthy, lastUnhealthyAt }),
          ({ isHealthy, lastUnhealthyAt }) => {
            // The immediate first call is the current status, not a change.
            const previous = wasHealthy;
            wasHealthy = isHealthy;
            if (previous === undefined || !isHealthy) return;

            // A first connect is not a recovery (`lastUnhealthyAt` is set by every drop, including
            // `closeConnection()`).
            if (!lastUnhealthyAt) return;

            if (!this.config.enabled) return;

            // Lists and active channels recover off the sync-status edge when there is one (the only
            // signal that lands after replay and sync), else here. Exactly one path runs per reconnect.
            const syncEdgeDrivesRecovery = this.ensureSyncStatusSubscription();
            if (!syncEdgeDrivesRecovery) {
              runDetached(this.recoverChannelLists(), { context: 'recoverChannelLists' });
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
   * Binds to the offline DB's sync-status edge once the DB is initialized (an uninitialized one
   * publishes no edge). Safe from the status handler: the edge is published only after
   * `syncAndExecutePendingTasks()` resolves. Returns whether the edge now drives the recovery.
   */
  private ensureSyncStatusSubscription = (): boolean => {
    if (this.unsubscribeSyncStatus) return true;

    const { offlineDb } = this.client;
    if (!offlineDb?.state.getLatestValue().initialized) return false;

    const { unsubscribe } = offlineDb.syncManager.onSyncStatusChange((status) => {
      if (!status || !this.config.enabled) return;
      runDetached(this.recoverChannelLists(), { context: 'recoverChannelLists' });
      runDetached(this.recoverActiveChannels(), { context: 'recoverActiveChannels' });
    });
    this.unsubscribeSyncStatus = unsubscribe;
    return true;
  };

  /**
   * Channels a consumer is reading. Not filtered on `watchStatus`: a channel opened while offline never
   * reached `Watching`, and `Channel.reload()` has its own `initialized || offlineMode` guard.
   */
  private get recoverableActiveChannels(): Channel[] {
    return this.client.channelManager
      .values()
      .filter((channel) => channel.active && !channel.pendingDisposal);
  }

  /**
   * Threads a consumer is displaying. They need their own pass: channel reloads and the thread list
   * refresh do not rehydrate them. Threads of a disconnected channel are skipped.
   */
  private get recoverableActiveThreads(): Thread[] {
    const threads: Thread[] = [];
    for (const thread of this.client.threads.registeredThreads) {
      // `Thread` has no `active` accessor, so read it off state.
      const { active } = thread.state.getLatestValue();
      if (!active || thread.channel.pendingDisposal) continue;
      threads.push(thread);
    }
    return threads;
  }

  /**
   * Flags closed threads stale, since they miss events during a drop. A listed thread rehydrates via the
   * thread list reload, any other on its next `activate()`.
   */
  private markInactiveThreadsStale() {
    for (const thread of this.client.threads.registeredThreads) {
      const { active, isStateStale } = thread.state.getLatestValue();
      if (!active && !isStateStale) thread.state.partialNext({ isStateStale: true });
    }
  }

  private recoverChannelLists = async () => {
    await this.client.channelManager.recover();
  };

  private recoverActiveChannels = async ({ isRetry = false } = {}): Promise<void> => {
    if (this.isRecovering) {
      this.recoveryRequestedAgain = true;
      return;
    }

    const channels = this.recoverableActiveChannels;
    const threads = this.recoverableActiveThreads;
    this.markInactiveThreadsStale();
    // Captured to detect a socket drop during the reloads. The timestamp, not the boolean: a drop and
    // return inside the window still fails the reloads.
    const socketDropBefore =
      this.client.wsConnection.state.getLatestValue().lastUnhealthyAt;
    this.isRecovering = true;
    logger
      .withExtraTags('connectionRecovery')
      .info(
        `Recovering ${channels.length} active channel(s) and ${threads.length} active thread(s).`,
      );

    // `allSettled`: one failure must not stop the others. Failed refreshes are not surfaced.
    await Promise.allSettled([
      ...channels.map((channel) => channel.reload()),
      ...threads.map((thread) => thread.reload()),
    ]);

    this.isRecovering = false;

    // A reconnect landed mid-reload, so what was fetched belongs to a gone connection. Re-run once, not
    // until settled: a flapping socket would loop forever.
    const retryAfterReconnect = this.recoveryRequestedAgain && !isRetry;
    this.recoveryRequestedAgain = false;
    if (retryAfterReconnect) return await this.recoverActiveChannels({ isRetry: true });

    // A drop mid-recovery can fail every reload while this still reaches the end. Dispatching then would
    // report stale state as fresh (the UI SDKs mark messages read off this event). Withholding is safe:
    // the next reconnect recovers and dispatches it.
    const socket = this.client.wsConnection.state.getLatestValue();

    if (socket.lastUnhealthyAt !== socketDropBefore || !socket.isHealthy) {
      logger
        .withExtraTags('connectionRecovery')
        .info(
          'Recovery finished but the socket dropped while it ran; withholding connection.recovered.',
        );
      return;
    }

    // Dispatched here so it fires on every reconnect path, including `closeConnection()` then
    // `openConnection()`, and after the reloads.
    this.client.dispatchEvent({ type: 'connection.recovered' });
  };

  /** Runs a full recovery now, without waiting for a connection event. A no-op while one is running. */
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
