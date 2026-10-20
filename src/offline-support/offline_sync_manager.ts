import type { ExecuteBatchDBQueriesType } from './types';
import type { StreamChat } from '../client';
import type { AbstractOfflineDB } from './offline_support_api';
import type { AxiosError } from 'axios';
import { isAxiosError } from 'axios';
import { chatLoggerSystem } from '../logger';
import type { APIError } from '../types';
import type { Unsubscribe } from '@stream-io/state-store';

const logger = chatLoggerSystem.getLogger('offline-db');

/**
 * Keeps the offline DB in line with the server. When the socket becomes healthy it replays the
 * tasks queued while offline, then syncs missed events into the DB.
 */
export class OfflineDBSyncManager {
  public isSynced = false;
  /** Releases the subscription to the socket's status store. */
  public connectionChangedListener: Unsubscribe | null = null;
  private syncStatusListeners: Array<(status: boolean) => void> = [];
  private scheduledSyncStatusCallbacks: Map<string | symbol, () => Promise<void>> =
    new Map();
  private client: StreamChat;
  private offlineDb: AbstractOfflineDB;
  /**
   * Cap on the events a single `/sync` response may contain. Above it, event replay into local
   * storage is skipped and the reconnect-time channel refresh updates what is visible. `undefined`
   * or non-positive means no limit.
   */
  public readonly syncMaxEventCount?: number;

  constructor({
    client,
    offlineDb,
    syncMaxEventCount,
  }: {
    client: StreamChat;
    offlineDb: AbstractOfflineDB;
    syncMaxEventCount?: number;
  }) {
    this.client = client;
    this.offlineDb = offlineDb;
    this.syncMaxEventCount = syncMaxEventCount;
  }

  /**
   * Syncs immediately when the socket is already healthy, then on every later healthy transition.
   * Re-initializing replaces the previous subscription.
   */
  public init = async () => {
    try {
      if (this.client.user?.id && this.client.wsConnection?.isHealthy) {
        await this.syncAndExecutePendingTasks();
        await this.invokeSyncStatusListeners(true);
      }

      this.connectionChangedListener?.();

      let wasHealthy: boolean | undefined;
      this.connectionChangedListener =
        this.client.wsConnection.state.subscribeWithSelector(
          ({ isHealthy }) => ({ isHealthy }),
          async ({ isHealthy }) => {
            // The first call reports the current status (handled above), not a change.
            const previous = wasHealthy;
            wasHealthy = isHealthy;
            if (previous === undefined) return;

            if (isHealthy) {
              await this.syncAndExecutePendingTasks();
              await this.invokeSyncStatusListeners(true);
            } else {
              await this.invokeSyncStatusListeners(false);
            }
          },
        );
    } catch (error) {
      logger
        .withExtraTags('init')
        .error('Failed to initialize the offline DB sync manager.', { error });
    }
  };

  /** Calls `listener` with the new sync status on every change. Returns `{ unsubscribe }`. */
  public onSyncStatusChange = (listener: (status: boolean) => void) => {
    this.syncStatusListeners.push(listener);

    return {
      unsubscribe: () => {
        this.syncStatusListeners = this.syncStatusListeners.filter(
          (el) => el !== listener,
        );
      },
    };
  };

  /** Runs `callback` once after the next successful sync. Scheduling the same `tag` replaces it. */
  public scheduleSyncStatusChangeCallback = (
    tag: string | symbol,
    callback: () => Promise<void>,
  ) => {
    this.scheduledSyncStatusCallbacks.set(tag, callback);
  };

  /** Notifies the listeners and, on `true`, runs and clears the scheduled callbacks. */
  private invokeSyncStatusListeners = async (status: boolean) => {
    this.isSynced = status;
    this.syncStatusListeners.forEach((l) => {
      try {
        l(status);
      } catch (error) {
        console.log('Error in a sync status listener.', error);
      }
    });

    if (status) {
      const promises = Array.from(this.scheduledSyncStatusCallbacks.values()).map(
        async (cb) => {
          try {
            await cb();
          } catch (error) {
            console.log('Error executing a scheduled sync status callback.', error);
          }
        },
      );
      // Each callback catches its own error, so `clear()` always runs.
      await Promise.all(promises);
      this.scheduledSyncStatusCallbacks.clear();
    }
  };

  /** Replays the events since the last sync into the DB, or resets the DB if too much was missed. */
  private sync = async () => {
    if (!this.client?.user) {
      return;
    }
    try {
      const cids = await this.offlineDb.getAllChannelCids();
      if (cids.length === 0) {
        return;
      }

      // TODO: We should not need our own user ID in the API, it can be inferred
      const lastSyncedAt = await this.offlineDb.getLastSyncedAt({
        userId: this.client.user.id,
      });

      if (lastSyncedAt) {
        const lastSyncedAtDate = new Date(lastSyncedAt);
        const nowDate = new Date();

        const diff = Math.floor(
          (nowDate.getTime() - lastSyncedAtDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diff > 30) {
          // The backend rejects a sync older than 30 days.
          await this.offlineDb.resetDB();
        } else {
          const result = await this.client.sync({
            channel_cids: cids,
            last_sync_at: lastSyncedAtDate,
          });

          const { syncMaxEventCount } = this;
          const exceedsLimit =
            typeof syncMaxEventCount === 'number' &&
            syncMaxEventCount > 0 &&
            result.events.length > syncMaxEventCount;
          if (exceedsLimit) {
            logger
              .withExtraTags('sync')
              .warn(
                `Skipping sync event replay: received ${result.events.length} events, which exceeds the configured limit of ${syncMaxEventCount}. Visible channels are refreshed on reconnect instead.`,
              );
          } else {
            const queryPromises = result.events.map((event) =>
              this.offlineDb.handleEvent({ event, execute: false }),
            );
            const queriesArray = await Promise.all(queryPromises);
            const queries = queriesArray.flat() as ExecuteBatchDBQueriesType;

            if (queries.length) {
              await this.offlineDb.executeSqlBatch(queries);
            }
          }
        }
      }
      await this.offlineDb.upsertUserSyncStatus({
        userId: this.client.user.id,
        lastSyncedAt: new Date().toString(),
      });
    } catch (e) {
      logger
        .withExtraTags('syncAndExecutePendingTasks')
        .error('An error occurred while syncing the database.', { error: e });

      if (isAxiosError(e) && e.code === 'ECONNABORTED') {
        return;
      }

      const error = e as AxiosError<APIError>;

      if (error.response?.data?.code === 23) {
        return;
      }

      // The sync API errors when there are too many events, so reset. A timeout (above) must not.
      await this.offlineDb.resetDB();
    }
  };

  /**
   * Replays queued tasks, then syncs. Each step swallows its own failure so the caller always goes
   * on to `invokeSyncStatusListeners(true)`: a failed sync leaves possibly stale data rather than
   * blocking later channel queries.
   */
  private syncAndExecutePendingTasks = async () => {
    try {
      await this.offlineDb.executePendingTasks();
    } catch (error) {
      console.log('Error executing pending tasks during sync.', error);
    }
    // `sync` can still reject: its catch calls `resetDB()`, which can throw on a corrupted DB.
    try {
      await this.sync();
    } catch (error) {
      console.log('Error while syncing the DB.', error);
    }
  };
}
