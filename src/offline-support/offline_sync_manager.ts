import type { ExecuteBatchDBQueriesType } from './types';
import type { StreamChat } from '../client';
import type { AbstractOfflineDB } from './offline_support_api';
import type { AxiosError } from 'axios';
import { isAxiosError } from 'axios';
import { chatLoggerSystem } from '../logger';
import type { APIError } from '../types';

const logger = chatLoggerSystem.getLogger('offline-db');

/**
 * Manages synchronization between the local offline database and the Stream backend.
 *
 * Responsible for detecting connection changes, syncing channel data, and executing
 * pending tasks queued during offline periods. This class ensures the database remains
 * consistent with the server once connectivity is restored.
 */
export class OfflineDBSyncManager {
  public syncStatus = false;
  public connectionChangedListener: { unsubscribe: () => void } | null = null;
  private syncStatusListeners: Array<(status: boolean) => void> = [];
  private scheduledSyncStatusCallbacks: Map<string | symbol, () => Promise<void>> =
    new Map();
  private client: StreamChat;
  private offlineDb: AbstractOfflineDB;
  /**
   * Optional positive cap on the number of events a single `/sync` response may
   * contain before this manager skips event replay into local storage and relies
   * on the reconnect-time channel refresh (queryChannels + `channel.watch()`) to
   * bring visible surfaces up to date.
   *
   * `undefined` or any non-positive value means "no limit" and event replay always
   * runs with whatever maximum the server decides to return.
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
   * Initializes the sync manager. Should only be called once per session.
   *
   * Cleans up old listeners if re-initialized to avoid memory leaks.
   * Starts syncing immediately if already connected, otherwise waits for reconnection.
   */
  public init = async () => {
    try {
      // If the WebSocket connection is already active, then call
      // the sync API straight away and also execute pending API calls.
      // Otherwise wait for the `connection.changed` event.
      if (this.client.user?.id && this.client.wsConnection?.isHealthy) {
        await this.syncAndExecutePendingTasks();
        await this.invokeSyncStatusListeners(true);
      }

      // If a listener has already been registered, unsubscribe from it so
      // that it can be reinstated. This can happen if we reconnect with a
      // different user or the component invoking the init() function gets
      // unmounted and then remounted again. This part of the code makes
      // sure the stale listener doesn't produce a memory leak.
      if (this.connectionChangedListener) {
        this.connectionChangedListener.unsubscribe();
      }

      this.connectionChangedListener = this.client.on(
        'connection.changed',
        async (event) => {
          if (event.online) {
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

  /**
   * Registers a listener that is called whenever the sync status changes.
   *
   * @param listener - A callback invoked with the new sync status (`true` or `false`).
   * @returns An object with an `unsubscribe` function to remove the listener.
   */
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

  /**
   * Schedules a one-time callback to be invoked after the next successful sync.
   *
   * @param tag - A unique key to identify and manage the callback.
   * @param callback - An async function to run after sync.
   */
  public scheduleSyncStatusChangeCallback = (
    tag: string | symbol,
    callback: () => Promise<void>,
  ) => {
    this.scheduledSyncStatusCallbacks.set(tag, callback);
  };

  /**
   * Invokes all registered sync status listeners and executes any scheduled sync callbacks.
   *
   * @param status - The new sync status (`true` or `false`).
   */
  private invokeSyncStatusListeners = async (status: boolean) => {
    this.syncStatus = status;
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
      // Every callback is isolated above, so Promise.all never rejects and clear()
      // always runs (no double-execution on the next sync).
      await Promise.all(promises);
      this.scheduledSyncStatusCallbacks.clear();
    }
  };

  /**
   * Performs synchronization with the Stream backend.
   *
   * This includes downloading events since the last sync, updating the local DB,
   * and handling sync failures (e.g., if syncing beyond the allowed retention window).
   */
  private sync = async () => {
    if (!this.client?.user) {
      return;
    }
    try {
      const cids = await this.offlineDb.getAllChannelCids();
      // If there are no channels, then there is no need to sync.
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

        // Calculate the difference in days
        const diff = Math.floor(
          (nowDate.getTime() - lastSyncedAtDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diff > 30) {
          // stream backend will send an error if we try to sync after 30 days.
          // In that case reset the entire DB and start fresh.
          await this.offlineDb.resetDB();
        } else {
          const result = await this.client.sync({
            channel_cids: cids,
            last_sync_at: lastSyncedAtDate,
          });

          // Opt-in positive cap owned by this manager; undefined/non-positive = no limit.
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
        // If the sync was aborted due to timeout, we can simply return
        return;
      }

      const error = e as AxiosError<APIError>;

      if (error.response?.data?.code === 23) {
        return;
      }

      // Error will be raised by the sync API if there are too many events.
      // In that case reset the entire DB and start fresh.
      // We avoid resetting the DB if the error is due to timeout.
      await this.offlineDb.resetDB();
    }
  };

  /**
   * Executes any tasks that were queued while offline and then performs a sync.
   *
   * Each step is isolated so a failure in one does not prevent the other, and
   * neither can escape to the callers (init + the connection.changed handler).
   * This guarantees the subsequent invokeSyncStatusListeners(true) always runs,
   * so syncStatus recovers to true and gated channel queries are unblocked.
   * Failed syncs degrade to "possibly stale data until the next query" rather
   * than freezing all future queries. See issue #1816.
   */
  private syncAndExecutePendingTasks = async () => {
    try {
      await this.offlineDb.executePendingTasks();
    } catch (error) {
      console.log('Error executing pending tasks during sync.', error);
    }
    // Note: sync() has its own try/catch, but its catch block calls resetDB(),
    // which can itself throw on a corrupted DB and re-reject. This outer guard
    // absorbs that case.
    try {
      await this.sync();
    } catch (error) {
      console.log('Error while syncing the DB.', error);
    }
  };
}
