import type { ExecuteBatchDBQueriesType } from './types';
import type { StreamChat } from '../client';
import type { AbstractOfflineDB } from './offline_support_api';

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

  constructor({
    client,
    offlineDb,
  }: {
    client: StreamChat;
    offlineDb: AbstractOfflineDB;
  }) {
    this.client = client;
    this.offlineDb = offlineDb;
  }

  /**
   * Initializes the sync manager. Should only be called once per session.
   *
   * Cleans up old listeners if re-initialized to avoid memory leaks.
   * Starts syncing immediately if already connected, otherwise waits for reconnection.
   */
  public init = async () => {
    try {
      // If the websocket connection is already active, then call
      // the sync api straight away and also execute pending api calls.
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
      console.log('Error in DBSyncManager.init: ', error);
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
    this.syncStatusListeners.forEach((l) => l(status));

    if (status) {
      const promises = Array.from(this.scheduledSyncStatusCallbacks.values()).map((cb) =>
        cb(),
      );
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
          const result = await this.client.sync(cids, lastSyncedAtDate.toISOString());
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
      await this.offlineDb.upsertUserSyncStatus({
        userId: this.client.user.id,
        lastSyncedAt: new Date().toString(),
      });
    } catch (e) {
      console.log('An error has occurred while syncing the DB.', e);
      // Error will be raised by the sync API if there are too many events.
      // In that case reset the entire DB and start fresh.
      await this.offlineDb.resetDB();
    }
  };

  /**
   * Executes any tasks that were queued while offline and then performs a sync.
   */
  private syncAndExecutePendingTasks = async () => {
    await this.offlineDb.executePendingTasks();
    await this.sync();
  };
}
