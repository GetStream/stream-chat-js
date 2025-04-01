import type {
  APIErrorResponse,
  AppSettingsAPIResponse,
  ChannelAPIResponse,
  ChannelFilters,
  ChannelSort,
  Event,
  PollResponse,
  ReactionFilters,
  ReactionSort,
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

export type UpsertAppSettingsType = {
  appSettings: AppSettingsAPIResponse;
  userId: string;
  flush?: boolean;
};

export type UpsertUserSyncStatusType = {
  userId: string;
  lastSyncedAt: string;
};

export type UpsertPollType = {
  poll: PollResponse;
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

export type GetAppSettingsType = {
  userId: string;
};

export type GetReactionsType = {
  messageId: string;
  filters?: Pick<ReactionFilters, 'type'>;
  sort?: ReactionSort;
  limit?: number;
};

export type DeletePendingTaskType = { id: number };

export type DeleteReactionType = {
  channel: Channel;
  messageId: string;
  reactionType: string;
  userId: string;
  flush?: boolean;
};

export type DeleteMessageType = { id: string; flush?: boolean };

export type ExecuteBatchQueriesType = PreparedBatchQueries[];

export interface OfflineDBApi {
  upsertCidsForQuery: (options: UpsertCidsForQueryType) => Promise<unknown>;
  upsertChannels: (options: UpsertChannelsType) => Promise<unknown>;
  upsertUserSyncStatus: (options: UpsertUserSyncStatusType) => Promise<unknown>;
  upsertAppSettings: (options: UpsertAppSettingsType) => Promise<unknown>;
  upsertPoll: (options: UpsertPollType) => Promise<unknown>;
  getChannels: (options: GetChannelsType) => Promise<unknown>;
  getChannelsForQuery: (
    options: GetChannelsForQueryType,
  ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>;
  getAllChannelCids: () => Promise<string[]>;
  getLastSyncedAt: (options: GetLastSyncedAtType) => Promise<number | undefined>;
  getAppSettings: (options: GetAppSettingsType) => Promise<unknown>;
  getReactions: (options: GetReactionsType) => Promise<unknown>;
  executeSqlBatch: (queries: ExecuteBatchQueriesType) => Promise<unknown>;
  addPendingTask: (task: PendingTask) => Promise<() => Promise<void>>;
  getPendingTasks: (conditions?: GetPendingTasksType) => Promise<PendingTask[]>;
  deletePendingTask: (options: DeletePendingTaskType) => Promise<unknown>;
  deleteReaction: (options: DeleteReactionType) => Promise<unknown>;
  hardDeleteMessage: (options: DeleteMessageType) => Promise<unknown>;
  softDeleteMessage: (options: DeleteMessageType) => Promise<unknown>;
  resetDB: () => Promise<unknown>;
}

export abstract class AbstractOfflineDB implements OfflineDBApi {
  private client: StreamChat;
  public syncManager: OfflineDBSyncManager;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.syncManager = new OfflineDBSyncManager({ client, offlineDb: this });
  }

  abstract upsertCidsForQuery: OfflineDBApi['upsertCidsForQuery'];

  abstract upsertChannels: OfflineDBApi['upsertChannels'];

  abstract upsertUserSyncStatus: OfflineDBApi['upsertUserSyncStatus'];

  abstract upsertAppSettings: OfflineDBApi['upsertAppSettings'];

  abstract upsertPoll: OfflineDBApi['upsertPoll'];

  abstract getChannels: OfflineDBApi['getChannels'];

  abstract getChannelsForQuery: OfflineDBApi['getChannelsForQuery'];

  abstract getAllChannelCids: OfflineDBApi['getAllChannelCids'];

  abstract getLastSyncedAt: OfflineDBApi['getLastSyncedAt'];

  abstract getPendingTasks: OfflineDBApi['getPendingTasks'];

  abstract getAppSettings: OfflineDBApi['getAppSettings'];

  abstract getReactions: OfflineDBApi['getReactions'];

  abstract executeSqlBatch: OfflineDBApi['executeSqlBatch'];

  abstract addPendingTask: OfflineDBApi['addPendingTask'];

  abstract deletePendingTask: OfflineDBApi['deletePendingTask'];

  abstract deleteReaction: OfflineDBApi['deleteReaction'];

  abstract hardDeleteMessage: OfflineDBApi['hardDeleteMessage'];

  abstract softDeleteMessage: OfflineDBApi['softDeleteMessage'];

  abstract resetDB: OfflineDBApi['resetDB'];

  public queueTask = async ({ task }: { task: PendingTask }) => {
    let response;
    try {
      response = await this.executeTask({ task });
    } catch (e) {
      if ((e as AxiosError<APIErrorResponse>)?.response?.data?.code === 4) {
        // Error code 16 - message already exists
        // ignore
      } else {
        await this.addPendingTask(task);
        throw e;
      }
    }

    return response;
  };

  private executeTask = async ({ task }: { task: PendingTask }) => {
    if (task.type === 'delete-message') {
      return await this.client._deleteMessage(...task.payload);
    }

    const { channelType, channelId } = task;

    if (channelType && channelId) {
      const channel = this.client.channel(channelType, channelId);
      if (!channel.initialized) {
        await channel.watch();
      }

      if (task.type === 'send-reaction') {
        return await channel._sendReaction(...task.payload);
      }

      if (task.type === 'delete-reaction') {
        return await channel._deleteReaction(...task.payload);
      }
    }

    throw new Error('Invalid task type');
  };

  public executePendingTasks = async () => {
    const queue = await this.getPendingTasks();
    for (const task of queue) {
      console.log('[OFFLINE]: ', task);
      if (!task.id) {
        continue;
      }

      try {
        await this.executeTask({
          task,
        });
      } catch (e) {
        const error = e as AxiosError<APIErrorResponse>;
        if (error?.response?.data?.code === 4) {
          // Error code 16 - message already exists
          // ignore
        } else if (error?.response?.data?.code === 17) {
          // Error code 17 - missing own_capabilities to execute the task
          // ignore
        } else {
          continue;
        }
      }

      await this.deletePendingTask({
        id: task.id,
      });
    }
  };

  // FIXME: This should be a single DELETE query with a condition, no reason
  //        to potentially run many queries.
  public dropPendingTasks = async (conditions: { messageId: string }) => {
    const tasks = await this.getPendingTasks(conditions);

    for (const task of tasks) {
      if (!task.id) {
        continue;
      }

      await this.deletePendingTask?.({
        id: task.id,
      });
    }
  };
}

export type PendingTaskTypes = {
  deleteMessage: 'delete-message';
  deleteReaction: 'delete-reaction';
  sendReaction: 'send-reaction';
};

// TODO: Please rethink the definition of PendingTasks as it seems awkward
export type PendingTask = {
  channelId?: string;
  channelType?: string;
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
// const restBeforeNextTask = () => new Promise((resolve) => setTimeout(resolve, 500));
// FIXME: This is temporary, while we implement the other apis.
// eslint-disable-next-line
const handleEventToSyncDB = async (event: Event, client: StreamChat, flush?: boolean) => {
  const { type } = event;

  if (type.startsWith('poll.')) {
    const { poll } = event;
    if (poll) {
      let pollFromState = client.polls.fromState(poll.id);
      if (!pollFromState) {
        // @ts-expect-error hydratePollCache only accepts message objects, and yet uses poll properties.
        client.polls.hydratePollCache([{ poll, poll_id: poll.id }]);
        pollFromState = client.polls.fromState(poll.id);
      }
      if (type === 'poll.closed') {
        pollFromState?.handlePollClosed(event);
      }

      if (type === 'poll.updated') {
        pollFromState?.handlePollUpdated(event);
      }

      if (type === 'poll.vote_casted') {
        pollFromState?.handleVoteCasted(event);
      }

      if (type === 'poll.vote_removed') {
        pollFromState?.handleVoteRemoved(event);
      }

      if (type === 'poll.vote_changed') {
        pollFromState?.handleVoteChanged(event);
      }
    }
  }
};

export class OfflineDBSyncManager {
  public syncStatus = false;
  public connectionChangedListener: { unsubscribe: () => void } | null = null;
  private syncStatusListeners: Array<(status: boolean) => void> = [];
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
   * Initializes the OfflineDBSyncManager. This function should be called only once
   * throughout the lifetime of SDK. If it is performed more than once for whatever
   * reason, it will run cleanup on its listeners to prevent memory leaks.
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

  private sync = async () => {
    if (!this.client?.user) {
      return;
    }
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
        await this.offlineDb?.resetDB?.();
      } else {
        try {
          const result = await this.client.sync(cids, lastSyncedAtDate.toISOString());
          const queryPromises = result.events.map(
            async (event) => await handleEventToSyncDB(event, this.client),
          );
          const queriesArray = await Promise.all(queryPromises);
          const queries = queriesArray.flat();

          if (queries.length) {
            // TODO: FIXME
            // @ts-expect-error since handleEventToSyncDB is mocked right now
            await this.offlineDb.executeSqlBatch(queries);
          }
        } catch (e) {
          // Error will be raised by the sync API if there are too many events.
          // In that case reset the entire DB and start fresh.
          await this.offlineDb.resetDB();
        }
      }
    }
    await this.offlineDb.upsertUserSyncStatus({
      userId: this.client.user.id,
      lastSyncedAt: new Date().toString(),
    });
  };

  private syncAndExecutePendingTasks = async () => {
    await this.offlineDb.executePendingTasks();
    await this.sync();
  };
}
