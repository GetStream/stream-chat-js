import type {
  APIErrorResponse,
  ChannelAPIResponse,
  ChannelFilters,
  ChannelSort,
  Event,
  UserResponse,
} from './types';
import type { AxiosError } from 'axios';
import type { StreamChat } from './client';
import type { Channel } from './channel';

export type PreparedBatchQueries =
  | [string]
  | [string, Array<unknown> | Array<Array<unknown>>];

export type UpsertCidsForQueryType = {
  cids: string[];
  filters?: ChannelFilters;
  flush?: boolean;
  sort?: ChannelSort;
};

export type UpsertChannelsType = {
  channels: ChannelAPIResponse[];
  filters?: ChannelFilters;
  flush?: boolean;
  isLatestMessagesSet?: boolean;
  sort?: ChannelSort;
};

export type UpsertUserSyncStatusType = {
  userId: string;
  lastSyncedAt: string;
};

export type UpsertReactionType = {
  channel: Channel;
  enforceUniqueReaction: boolean;
  messageId: string;
  reactionType: string;
  user: UserResponse;
  flush?: boolean;
};

export type GetChannelsType = {
  cids: string[];
  userId: string;
};

export type GetChannelsForQueryType = {
  userId: string;
  filters?: ChannelFilters;
  sort?: ChannelSort;
};

export type GetLastSyncedAtType = {
  userId: string;
};

export type GetPendingTasksType = { messageId?: string };

export type DeletePendingTaskType = { id: number };

export type DeleteReactionType = {
  channel: Channel;
  messageId: string;
  reactionType: string;
  userId: string;
  flush?: boolean;
};

export type ExecuteBatchQueriesType = PreparedBatchQueries[];

export interface OfflineDBApi {
  upsertCidsForQuery: ((options: UpsertCidsForQueryType) => Promise<unknown>) | undefined;
  upsertChannels: ((options: UpsertChannelsType) => Promise<unknown>) | undefined;
  upsertUserSyncStatus:
    | ((options: UpsertUserSyncStatusType) => Promise<unknown>)
    | undefined;
  upsertReaction: ((options: UpsertReactionType) => Promise<unknown>) | undefined;
  getChannels: ((options: GetChannelsType) => Promise<unknown>) | undefined;
  getChannelsForQuery:
    | ((
        options: GetChannelsForQueryType,
      ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>)
    | undefined;
  getAllChannelCids: (() => Promise<string[]>) | undefined;
  getLastSyncedAt:
    | ((options: GetLastSyncedAtType) => Promise<number | undefined>)
    | undefined;
  resetDB: (() => Promise<unknown>) | undefined;
  executeSqlBatch: ((queries: ExecuteBatchQueriesType) => Promise<unknown>) | undefined;
  addPendingTask: ((task: PendingTask) => Promise<() => Promise<void>>) | undefined;
  getPendingTasks:
    | ((conditions?: GetPendingTasksType) => Promise<PendingTask[]>)
    | undefined;
  deletePendingTask: ((options: DeletePendingTaskType) => Promise<unknown>) | undefined;
  deleteReaction: ((options: DeleteReactionType) => Promise<unknown>) | undefined;
}

export abstract class AbstractOfflineDB implements OfflineDBApi {
  private client: StreamChat;
  public syncManager: OfflineDBSyncManager;
  public initialized = false;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.syncManager = new OfflineDBSyncManager({ client });
  }

  abstract upsertCidsForQuery: OfflineDBApi['upsertCidsForQuery'];

  abstract upsertChannels: OfflineDBApi['upsertChannels'];

  abstract upsertReaction: OfflineDBApi['upsertReaction'];

  abstract getChannels: OfflineDBApi['getChannels'];

  abstract getChannelsForQuery: OfflineDBApi['getChannelsForQuery'];

  abstract getAllChannelCids: OfflineDBApi['getAllChannelCids'];

  abstract getLastSyncedAt: OfflineDBApi['getLastSyncedAt'];

  abstract resetDB: OfflineDBApi['resetDB'];

  abstract executeSqlBatch: OfflineDBApi['executeSqlBatch'];

  abstract upsertUserSyncStatus: OfflineDBApi['upsertUserSyncStatus'];

  abstract addPendingTask: OfflineDBApi['addPendingTask'];

  abstract getPendingTasks: OfflineDBApi['getPendingTasks'];

  abstract deletePendingTask: OfflineDBApi['deletePendingTask'];

  abstract deleteReaction: OfflineDBApi['deleteReaction'];
}

export class DefaultOfflineDB extends AbstractOfflineDB {
  upsertCidsForQuery = undefined;

  upsertChannels = undefined;

  upsertReaction = undefined;

  getChannels = undefined;

  getChannelsForQuery = undefined;

  getAllChannelCids = undefined;

  getLastSyncedAt = undefined;

  resetDB = undefined;

  executeSqlBatch = undefined;

  upsertUserSyncStatus = undefined;

  addPendingTask = undefined;

  getPendingTasks = undefined;

  deletePendingTask = undefined;

  deleteReaction = undefined;
}

export type PendingTaskTypes = {
  deleteMessage: 'delete-message';
  deleteReaction: 'delete-reaction';
  sendReaction: 'send-reaction';
};
//
export type PendingTask = {
  channelId: string;
  channelType: string;
  messageId: string;
  id?: number;
} & (
  | {
      payload: Parameters<Channel['sendReaction']>;
      type: PendingTaskTypes['sendReaction'];
    }
  | {
      payload: Parameters<StreamChat['deleteMessage']>;
      type: PendingTaskTypes['deleteMessage'];
    }
  | {
      payload: Parameters<Channel['deleteReaction']>;
      type: PendingTaskTypes['deleteReaction'];
    }
);

/**
 * DBSyncManager has the responsibility to sync the channel states
 * within local database whenever possible.
 *
 * Components can get the current sync status using DBSyncManager.getCurrentStatus().
 * Or components can attach a listener for status change as following:
 *
 * ```tsx
 * useEffect(() => {
 *  const unsubscribe = DBSyncManager.onSyncStatusChange((syncStatus) => {
 *    if (syncStatus) {
 *      doSomething();
 *    }
 *  })
 *
 *  return () => unsubscribe();
 * })
 * ```
 */
const restBeforeNextTask = () => new Promise((resolve) => setTimeout(resolve, 500));
// FIXME: This is temporary, while we implement the other apis.
// eslint-disable-next-line
const handleEventToSyncDB = async (event: Event, client: StreamChat) => {};

export class OfflineDBSyncManager {
  public syncStatus = false;
  public connectionChangedListener: { unsubscribe: () => void } | null = null;
  private syncStatusListeners: Array<(status: boolean) => void> = [];
  private client: StreamChat;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
  }

  /**
   * Initializes the DBSyncManager. This function should be called only once
   * throughout the lifetime of SDK.
   */
  public init = async () => {
    try {
      // If the websocket connection is already active, then straightaway
      // call the sync api and also execute pending api calls.
      // Otherwise wait for `connection.changed` event.
      if (this.client.user?.id && this.client.wsConnection?.isHealthy) {
        await this.syncAndExecutePendingTasks();
        this.syncStatus = true;
        this.syncStatusListeners.forEach((l) => l(true));
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
            this.syncStatus = true;
            this.syncStatusListeners.forEach((l) => l(true));
          } else {
            this.syncStatus = false;
            this.syncStatusListeners.forEach((l) => l(false));
          }
        },
      );
    } catch (error) {
      console.log('Error in DBSyncManager.init: ', error);
    }
  };

  /**
   * Subscribes a listener for sync status change.
   *
   * @param listener {function}
   * @returns {function} to unsubscribe the listener.
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

  private sync = async (client: StreamChat) => {
    if (
      !this.client?.user ||
      !this.client.offlineDb.getAllChannelCids ||
      !this.client.offlineDb?.getLastSyncedAt
    ) {
      return;
    }
    const cids = await this.client.offlineDb.getAllChannelCids();
    // If there are no channels, then there is no need to sync.
    if (cids.length === 0) {
      return;
    }

    // TODO: We should not need our own user ID in the API, it can be inferred
    const lastSyncedAt = await this.client.offlineDb?.getLastSyncedAt?.({
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
        await this.client.offlineDb?.resetDB?.();
      } else {
        try {
          const result = await this.client.sync(cids, lastSyncedAtDate.toISOString());
          const queryPromises = result.events.map(
            async (event) => await handleEventToSyncDB(event, client),
          );
          const queriesArray = await Promise.all(queryPromises);
          const queries = queriesArray.flat();

          if (queries.length) {
            // TODO: FIXME
            // @ts-expect-error since handleEventToSyncDB is mocked right now
            await this.client.offlineDb?.executeSqlBatch?.(queries);
          }
        } catch (e) {
          // Error will be raised by the sync API if there are too many events.
          // In that case reset the entire DB and start fresh.
          await this.client.offlineDb?.resetDB?.();
        }
      }
    }
    await this.client.offlineDb?.upsertUserSyncStatus?.({
      userId: this.client.user.id,
      lastSyncedAt: new Date().toString(),
    });
  };

  private syncAndExecutePendingTasks = async () => {
    if (!this.client) {
      return;
    }

    await this.executePendingTasks();
    await this.sync(this.client);
  };

  public queueTask = async ({ task }: { task: PendingTask }) => {
    if (!this.client.offlineDb?.addPendingTask) {
      return;
    }

    const removeFromApi = await this.client.offlineDb.addPendingTask(task);

    let response;
    try {
      response = await this.executeTask({ task });
    } catch (e) {
      if ((e as AxiosError<APIErrorResponse>)?.response?.data?.code === 4) {
        // Error code 16 - message already exists
        // ignore
      } else {
        throw e;
      }
    }

    await removeFromApi();

    return response;
  };

  private executeTask = async ({ task }: { task: PendingTask }) => {
    const channel = this.client.channel(task.channelType, task.channelId);

    if (task.type === 'send-reaction') {
      const [messageId, reaction, options] = task.payload;
      return await channel.sendReaction(messageId, reaction, options, false);
    }

    if (task.type === 'delete-reaction') {
      const [messageId, reactionType] = task.payload;
      return await channel.deleteReaction(messageId, reactionType, undefined, false);
    }

    if (task.type === 'delete-message') {
      return await this.client.deleteMessage(...task.payload);
    }

    throw new Error('Invalid task type');
  };

  private executePendingTasks = async () => {
    if (!this.client.offlineDb.getPendingTasks) {
      return;
    }
    const queue = await this.client.offlineDb.getPendingTasks();
    for (const task of queue) {
      if (!task.id) {
        continue;
      }

      try {
        await this.executeTask({
          task,
        });
      } catch (e) {
        if ((e as AxiosError<APIErrorResponse>)?.response?.data?.code === 4) {
          // Error code 16 - message already exists
          // ignore
        } else {
          throw e;
        }
      }

      await this.client.offlineDb?.deletePendingTask?.({
        id: task.id,
      });
      await restBeforeNextTask();
    }
  };

  public dropPendingTasks = async (conditions: { messageId: string }) => {
    if (!this.client.offlineDb?.getPendingTasks) {
      return;
    }
    const tasks = await this.client.offlineDb.getPendingTasks(conditions);

    for (const task of tasks) {
      if (!task.id) {
        continue;
      }

      await this.client.offlineDb?.deletePendingTask?.({
        id: task.id,
      });
    }
  };
}
