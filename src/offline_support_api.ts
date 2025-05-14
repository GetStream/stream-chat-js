import type {
  APIErrorResponse,
  AppSettingsAPIResponse,
  ChannelAPIResponse,
  ChannelFilters,
  ChannelMemberResponse,
  ChannelResponse,
  ChannelSort,
  Event,
  LocalMessage,
  Message,
  MessageResponse,
  PollResponse,
  ReactionFilters,
  ReactionResponse,
  ReactionSort,
  ReadResponse,
} from './types';
import type { AxiosError } from 'axios';
import type { StreamChat } from './client';
import type { Channel } from './channel';
import { StateStore } from './store';
import { runSynchronously } from './utils';

// TODO: Find a clever way to pass this in a different manner
export type PreparedBatchQueries =
  | [string]
  | [string, Array<unknown> | Array<Array<unknown>>];

export type InsertReactionType = {
  message: MessageResponse | LocalMessage;
  reaction: ReactionResponse;
  flush?: boolean;
};

export type UpsertCidsForQueryType = {
  cids: string[];
  filters?: ChannelFilters;
  flush?: boolean;
  sort?: ChannelSort;
};

export type UpsertChannelsType = {
  channels: ChannelAPIResponse[];
  flush?: boolean;
  isLatestMessagesSet?: boolean;
};

export type UpsertAppSettingsType = {
  appSettings: AppSettingsAPIResponse;
  userId: string;
  flush?: boolean;
};

export type UpsertUserSyncStatusType = {
  userId: string;
  lastSyncedAt: string;
  flush?: boolean;
};

export type UpsertPollType = {
  poll: PollResponse;
  flush?: boolean;
};

export type UpsertChannelDataType = {
  channel: ChannelResponse;
  flush?: boolean;
};

export type UpsertReadsType = {
  cid: string;
  reads: ReadResponse[];
  flush?: boolean;
};

export type UpsertMessagesType = {
  messages: MessageResponse[];
  flush?: boolean;
};

export type UpsertMembersType = {
  cid: string;
  members: ChannelMemberResponse[];
  flush?: boolean;
};

export type UpdateReactionType = {
  message: MessageResponse | LocalMessage;
  reaction: ReactionResponse;
  flush?: boolean;
};

export type UpdateMessageType = {
  message: MessageResponse | LocalMessage;
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
  reaction: ReactionResponse;
  message?: MessageResponse | LocalMessage;
  flush?: boolean;
};

export type DeleteMemberType = {
  cid: string;
  member: ChannelMemberResponse;
  flush?: boolean;
};

export type DropPendingTasksType = {
  messageId: string;
  flush?: boolean;
};

export type DeleteMessageType = { id: string; flush?: boolean };

export type DeleteChannelType = { cid: string; flush?: boolean };

export type DeleteMessagesForChannelType = {
  cid: string;
  truncated_at?: string;
  flush?: boolean;
};

export type ChannelExistsType = { cid: string };

export type ExecuteBatchQueriesType = PreparedBatchQueries[];

export interface OfflineDBApi {
  insertReaction: (options: InsertReactionType) => Promise<ExecuteBatchQueriesType>;
  upsertCidsForQuery: (
    options: UpsertCidsForQueryType,
  ) => Promise<ExecuteBatchQueriesType>;
  upsertChannels: (options: UpsertChannelsType) => Promise<ExecuteBatchQueriesType>;
  upsertUserSyncStatus: (
    options: UpsertUserSyncStatusType,
  ) => Promise<ExecuteBatchQueriesType>;
  upsertAppSettings: (options: UpsertAppSettingsType) => Promise<ExecuteBatchQueriesType>;
  upsertPoll: (options: UpsertPollType) => Promise<ExecuteBatchQueriesType>;
  upsertChannelData: (options: UpsertChannelDataType) => Promise<ExecuteBatchQueriesType>;
  upsertReads: (options: UpsertReadsType) => Promise<ExecuteBatchQueriesType>;
  upsertMessages: (options: UpsertMessagesType) => Promise<ExecuteBatchQueriesType>;
  upsertMembers: (options: UpsertMembersType) => Promise<ExecuteBatchQueriesType>;
  updateReaction: (options: UpdateReactionType) => Promise<ExecuteBatchQueriesType>;
  updateMessage: (options: UpdateMessageType) => Promise<ExecuteBatchQueriesType>;
  getChannels: (options: GetChannelsType) => Promise<unknown>;
  getChannelsForQuery: (
    options: GetChannelsForQueryType,
  ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>;
  getAllChannelCids: () => Promise<string[]>;
  getLastSyncedAt: (options: GetLastSyncedAtType) => Promise<string | undefined>;
  getAppSettings: (options: GetAppSettingsType) => Promise<unknown>;
  getReactions: (options: GetReactionsType) => Promise<unknown>;
  executeSqlBatch: (queries: ExecuteBatchQueriesType) => Promise<unknown>;
  addPendingTask: (task: PendingTask) => Promise<() => Promise<void>>;
  getPendingTasks: (conditions?: GetPendingTasksType) => Promise<PendingTask[]>;
  deletePendingTask: (options: DeletePendingTaskType) => Promise<ExecuteBatchQueriesType>;
  deleteReaction: (options: DeleteReactionType) => Promise<ExecuteBatchQueriesType>;
  deleteMember: (options: DeleteMemberType) => Promise<ExecuteBatchQueriesType>;
  deleteChannel: (options: DeleteChannelType) => Promise<ExecuteBatchQueriesType>;
  deleteMessagesForChannel: (
    options: DeleteMessagesForChannelType,
  ) => Promise<ExecuteBatchQueriesType>;
  dropPendingTasks: (options: DropPendingTasksType) => Promise<ExecuteBatchQueriesType>;
  hardDeleteMessage: (options: DeleteMessageType) => Promise<ExecuteBatchQueriesType>;
  softDeleteMessage: (options: DeleteMessageType) => Promise<ExecuteBatchQueriesType>;
  resetDB: () => Promise<unknown>;
  channelExists: (options: ChannelExistsType) => Promise<boolean>;
  initializeDB: () => Promise<boolean>;
}

export type OfflineDBState = {
  initialized: boolean;
  userId?: string;
};

export abstract class AbstractOfflineDB implements OfflineDBApi {
  private client: StreamChat;
  public syncManager: OfflineDBSyncManager;
  public state: StateStore<OfflineDBState>;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.syncManager = new OfflineDBSyncManager({ client, offlineDb: this });
    this.state = new StateStore<OfflineDBState>({
      initialized: false,
      userId: this.client.userID,
    });
  }

  abstract insertReaction: OfflineDBApi['insertReaction'];

  abstract upsertCidsForQuery: OfflineDBApi['upsertCidsForQuery'];

  abstract upsertChannels: OfflineDBApi['upsertChannels'];

  abstract upsertUserSyncStatus: OfflineDBApi['upsertUserSyncStatus'];

  abstract upsertAppSettings: OfflineDBApi['upsertAppSettings'];

  abstract upsertPoll: OfflineDBApi['upsertPoll'];

  abstract upsertChannelData: OfflineDBApi['upsertChannelData'];

  abstract upsertReads: OfflineDBApi['upsertReads'];

  abstract upsertMessages: OfflineDBApi['upsertMessages'];

  abstract upsertMembers: OfflineDBApi['upsertMembers'];

  abstract updateReaction: OfflineDBApi['updateReaction'];

  abstract updateMessage: OfflineDBApi['updateMessage'];

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

  abstract deleteMember: OfflineDBApi['deleteMember'];

  abstract deleteChannel: OfflineDBApi['deleteChannel'];

  abstract deleteMessagesForChannel: OfflineDBApi['deleteMessagesForChannel'];

  abstract dropPendingTasks: OfflineDBApi['dropPendingTasks'];

  abstract hardDeleteMessage: OfflineDBApi['hardDeleteMessage'];

  abstract softDeleteMessage: OfflineDBApi['softDeleteMessage'];

  abstract resetDB: OfflineDBApi['resetDB'];

  abstract channelExists: OfflineDBApi['channelExists'];

  abstract initializeDB: OfflineDBApi['initializeDB'];

  public init = async (userId: string) => {
    try {
      if (!this.isInitialized(userId)) {
        this.state.partialNext({ initialized: false, userId: undefined });
        const initialized = await this.initializeDB();
        if (initialized) {
          await this.syncManager.init();
          this.state.partialNext({ initialized: true, userId });
        }
      }
    } catch (error) {
      console.log('Error Initializing DB:', error);
    }
  };

  public isInitialized(userId: string): boolean {
    const { userId: userIdFromState, initialized } = this.state.getLatestValue();
    return userId === userIdFromState && initialized;
  }

  public executeQuerySafely = <T>(
    queryCallback: (db: AbstractOfflineDB) => Promise<T>,
    { method }: { method: string },
  ) => {
    const { initialized } = this.state.getLatestValue();
    if (!initialized) {
      return;
    }
    runSynchronously(queryCallback(this), { context: `OfflineDB(${method})` });
  };

  public queriesWithChannelGuard = async (
    {
      event,
      flush = true,
      forceUpdate = false,
    }: { event: Event; flush?: boolean; forceUpdate?: boolean },
    createQueries: (flushOverride?: boolean) => Promise<PreparedBatchQueries[]>,
  ) => {
    const channelFromEvent = event.channel;
    const cid = event.cid || channelFromEvent?.cid;
    const type = event.type;

    if (!cid) {
      return await createQueries(flush);
    }
    // We want to upsert the channel data if we either:
    // - Have forceUpdate set to true
    // - The channel does not yet exist in the DB
    // If a channel is not present in the db, we first fetch the channel data from the channel object.
    // This can happen for example when a message.new event is received for a channel that is not in the db due to a channel being hidden.
    const shouldUpsertChannelData = forceUpdate || !(await this.channelExists({ cid }));
    if (shouldUpsertChannelData) {
      let channelData = channelFromEvent;
      if (!channelData && event.channel_type && event.channel_id) {
        const channelFromState = this.client.channel(
          event.channel_type,
          event.channel_id,
        );
        if (channelFromState.initialized && !channelFromState.disconnected) {
          channelData = channelFromState.data as unknown as ChannelResponse;
        }
      }
      if (channelData) {
        const channelQuery = await this.upsertChannelData({
          channel: channelData,
          flush: false,
        });
        if (channelQuery) {
          const createdQueries = await createQueries(false);
          const newQueries = [...channelQuery, ...createdQueries];
          if (flush) {
            await this.executeSqlBatch(newQueries);
          }
          return newQueries;
        } else {
          console.warn(
            `Couldnt create channel queries on ${type} event for an initialized channel that is not in DB, skipping event`,
            { event },
          );
          return [];
        }
      } else {
        console.warn(
          `Received ${type} event for a non initialized channel that is not in DB, skipping event`,
          { event },
        );
        return [];
      }
    }
    return createQueries(flush);
  };

  // TODO: Check why this isn't working properly for read state - something is not
  //       getting populated as it should :'(
  public handleNewMessage = async ({
    event,
    flush = true,
  }: {
    event: Event;
    flush?: boolean;
  }) => {
    const client = this.client;
    const { cid, message, user } = event;

    if (!message) {
      return [];
    }

    const finalQueries = await this.queriesWithChannelGuard(
      { event, flush },
      async () => {
        let queries = await this.upsertMessages({
          flush: false,
          messages: [message],
        });
        if (cid && client.user && client.user.id !== user?.id) {
          const userId = client.user.id;
          const channel = client.activeChannels[cid];
          if (channel) {
            const ownReads = channel.state.read[userId];
            const unreadCount = channel.countUnread();
            const upsertReadsQueries = await this.upsertReads({
              cid,
              flush: false,
              reads: [
                {
                  last_read: ownReads.last_read.toString() as string,
                  last_read_message_id: ownReads.last_read_message_id,
                  unread_messages: unreadCount,
                  user: client.user,
                },
              ],
            });
            queries = [...queries, ...upsertReadsQueries];
          }
        }
        return queries;
      },
    );

    if (flush) {
      await this.executeSqlBatch(finalQueries);
    }

    return finalQueries;
  };

  public handleDeleteMessage = async ({
    event,
    flush = true,
  }: {
    event: Event;
    flush?: boolean;
  }) => {
    const { message, hard_delete = false } = event;

    if (message) {
      const deleteMethod = hard_delete ? this.hardDeleteMessage : this.softDeleteMessage;
      return await this.queriesWithChannelGuard(
        { event, flush },
        async (flushOverride) =>
          await deleteMethod({ id: message.id, flush: flushOverride }),
      );
    }

    return [];
  };

  /**
   * TODO: Write docs. Here and in all other places in the API.
   * This method is used for removing a message that has already failed from the
   * state as well as the DB. We want to drop all pending tasks as well as finally
   * hard delete the message from the DB.
   * @param messageId
   * @param flush
   */
  public handleRemoveMessage = async ({
    messageId,
    flush = true,
  }: {
    messageId: string;
    flush?: boolean;
  }) => {
    const dropPendingTasksQueries = await this.dropPendingTasks({
      messageId,
      flush: false,
    });
    const hardDeleteMessageQueries = await this.hardDeleteMessage({
      id: messageId,
      flush: false,
    });
    const queries = [...dropPendingTasksQueries, ...hardDeleteMessageQueries];

    if (flush) {
      await this.executeSqlBatch(queries);
    }

    return queries;
  };

  public handleRead = async ({
    event,
    unreadMessages,
    flush = true,
  }: {
    event: Event;
    unreadMessages?: number;
    flush?: boolean;
  }) => {
    const {
      received_at: last_read,
      last_read_message_id,
      unread_messages = 0,
      user,
      cid,
    } = event;

    const overriddenUnreadMessages = unreadMessages ?? unread_messages;

    if (user?.id && cid) {
      return await this.queriesWithChannelGuard({ event, flush }, (flushOverride) =>
        this.upsertReads({
          cid,
          flush: flushOverride,
          reads: [
            {
              last_read: last_read as string,
              last_read_message_id,
              unread_messages: overriddenUnreadMessages,
              user,
            },
          ],
        }),
      );
    }

    return [];
  };

  public handleMemberEvent = async ({
    event,
    flush = true,
  }: {
    event: Event;
    flush?: boolean;
  }) => {
    const { member, cid, type } = event;

    if (member && cid) {
      // we force update here so that member_count gets updated
      // TODO: Although this is more than fine for now, we should look into
      //       changing this to be an actual update to the DB instead.
      return await this.queriesWithChannelGuard(
        { event, flush, forceUpdate: true },
        async (flushOverride) => {
          if (type === 'member.removed') {
            return await this.deleteMember({ member, cid, flush: flushOverride });
          }

          return await this.upsertMembers({
            cid,
            members: [member],
            flush: flushOverride,
          });
        },
      );
    }

    return [];
  };

  public handleMessageUpdatedEvent = async ({
    event,
    flush = true,
  }: {
    event: Event;
    flush?: boolean;
  }) => {
    const { message } = event;

    if (message && !message.parent_id) {
      return await this.queriesWithChannelGuard(
        { event, flush },
        async (flushOverride) =>
          await this.updateMessage({ message, flush: flushOverride }),
      );
    }

    return [];
  };

  /**
   * An event handler for channel.visible and channel.hidden events. We need a separate
   * handler because event.channel.hidden does not arrive with the baseline event, so a
   * simple upsertion is not enough.
   * @param event
   * @param flush
   */
  public handleChannelVisibilityEvent = async ({
    event,
    flush = true,
  }: {
    event: Event;
    flush?: boolean;
  }) => {
    const { type, channel } = event;

    if (channel && type) {
      const hidden = type === 'channel.hidden';
      return await this.client.offlineDb?.upsertChannelData({
        channel: { ...channel, hidden },
        flush,
      });
    }

    return [];
  };

  public handleChannelTruncatedEvent = async ({
    event,
    flush = true,
  }: {
    event: Event;
    flush?: boolean;
  }) => {
    const { channel } = event;
    const ownUser = this.client.user;
    if (channel && ownUser) {
      const { cid, truncated_at } = channel;
      // FIXME: This does not correctly update reads. Will fix later.
      const truncateQueries = await this.deleteMessagesForChannel({
        cid,
        truncated_at,
        flush,
      });

      const userId = ownUser.id;
      const activeChannel = this.client.activeChannels[cid];
      const ownReads = activeChannel.state.read[userId];

      let unreadCount = 0;

      if (truncated_at) {
        const truncatedAt = new Date(truncated_at);
        unreadCount = activeChannel.countUnread(truncatedAt);
      }

      const upsertReadQueries = await this.upsertReads({
        cid,
        flush,
        reads: [
          {
            last_read: ownReads.last_read.toString() as string,
            last_read_message_id: ownReads.last_read_message_id,
            unread_messages: unreadCount,
            user: ownUser,
          },
        ],
      });

      return [...truncateQueries, ...upsertReadQueries];
    }

    return [];
  };

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

  private executeTask = async (
    { task }: { task: PendingTask },
    isPendingTask = false,
  ) => {
    if (task.type === 'delete-message') {
      return await this.client._deleteMessage(...task.payload);
    }

    const { channelType, channelId } = task;

    if (channelType && channelId) {
      const channel = this.client.channel(channelType, channelId);
      // TODO: Think about this a bit better. Do we really need to watch or is it okay if we don't ?
      if (!channel.initialized) {
        await channel.watch();
      }

      if (task.type === 'send-reaction') {
        return await channel._sendReaction(...task.payload);
      }

      if (task.type === 'delete-reaction') {
        return await channel._deleteReaction(...task.payload);
      }

      if (task.type === 'send-message') {
        const newMessage = await channel._sendMessage(...task.payload);
        if (isPendingTask) {
          channel.state.addMessageSorted(newMessage.message, true);
        }
        return newMessage;
      }
    }

    throw new Error('Invalid task type');
  };

  public executePendingTasks = async () => {
    const queue = await this.getPendingTasks();
    for (const task of queue) {
      if (!task.id) {
        continue;
      }

      try {
        await this.executeTask(
          {
            task,
          },
          true,
        );
      } catch (e) {
        const error = e as AxiosError<APIErrorResponse>;
        if (error?.response?.data?.code === 4) {
          // Error code 4 - message already exists
          // ignore
        } else if (error?.response?.data?.code === 17) {
          // Error code 17 - missing own_capabilities to execute the task
          // ignore
        } else {
          // executing the pending tasks has failed, so keep it in the queue
          continue;
        }
      }

      await this.deletePendingTask({
        id: task.id,
      });
    }
  };
}

export type PendingTaskTypes = {
  deleteMessage: 'delete-message';
  deleteReaction: 'delete-reaction';
  sendReaction: 'send-reaction';
  sendMessage: 'send-message';
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
  | {
      payload: Parameters<Channel['sendMessage']>;
      type: PendingTaskTypes['sendMessage'];
    }
);

export type PendingTaskExtraData = {
  message?: Message;
};

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
        await this.invokeSyncStatusListeners(true);
        console.log('INITIAL SYNC DONE !');
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

  public scheduleSyncStatusChangeCallback = (
    tag: string | symbol,
    callback: () => Promise<void>,
  ) => {
    this.scheduledSyncStatusCallbacks.set(tag, callback);
  };

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

  private handleEventToSyncDB = async (event: Event, flush?: boolean) => {
    const { type, channel, message, reaction } = event;
    console.log('SYNCING EVENT: ', event.type);

    if (message && reaction) {
      if (type === 'reaction.new') {
        return await this.offlineDb.queriesWithChannelGuard(
          { event, flush },
          (flushOverride) =>
            this.offlineDb.insertReaction({ message, reaction, flush: flushOverride }),
        );
      }

      if (type === 'reaction.updated') {
        return await this.offlineDb.queriesWithChannelGuard(
          { event, flush },
          (flushOverride) =>
            this.offlineDb.updateReaction({ message, reaction, flush: flushOverride }),
        );
      }

      if (type === 'reaction.deleted') {
        return await this.offlineDb.queriesWithChannelGuard(
          { event, flush },
          (flushOverride) =>
            this.offlineDb?.deleteReaction({ message, reaction, flush: flushOverride }),
        );
      }
    }

    if (type === 'message.new') {
      const { message } = event;

      if (message && (!message.parent_id || message.show_in_channel)) {
        return await this.offlineDb.handleNewMessage({ event, flush });
      }
    }

    if (type === 'message.deleted') {
      return await this.offlineDb.handleDeleteMessage({ event, flush });
    }

    if (type === 'message.updated') {
      return this.offlineDb.handleMessageUpdatedEvent({ event, flush });
    }

    if (type.startsWith('member.')) {
      return await this.offlineDb.handleMemberEvent({ event, flush });
    }

    if (type === 'channel.hidden' || type === 'channel.visible') {
      return await this.offlineDb.handleChannelVisibilityEvent({ event, flush });
    }

    if (type === 'channel.updated' && channel) {
      return await this.offlineDb.upsertChannelData({ channel, flush });
    }

    if (type === 'channel.deleted' && channel) {
      return await this.offlineDb.deleteChannel({ cid: channel.cid, flush });
    }

    if (type === 'channel.truncated' && channel) {
      return await this.offlineDb.handleChannelTruncatedEvent({ event, flush });
    }

    return [];
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

    console.log('MIDWAY MARK :D');

    // TODO: We should not need our own user ID in the API, it can be inferred
    const lastSyncedAt = await this.offlineDb.getLastSyncedAt({
      userId: this.client.user.id,
    });

    console.log('LAST SYNC AT: ', lastSyncedAt);

    if (lastSyncedAt) {
      const lastSyncedAtDate = new Date(lastSyncedAt);
      const nowDate = new Date();

      // Calculate the difference in days
      const diff = Math.floor(
        (nowDate.getTime() - lastSyncedAtDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      console.log('DIFF: ', diff);
      if (diff > 30) {
        // stream backend will send an error if we try to sync after 30 days.
        // In that case reset the entire DB and start fresh.
        await this.offlineDb.resetDB();
      } else {
        try {
          console.log('ABOUT TO CALL SYNC API');
          const result = await this.client.sync(cids, lastSyncedAtDate.toISOString());
          console.log('CALLED SYNC API', result.events);
          const queryPromises = result.events.map(
            async (event) => await this.handleEventToSyncDB(event, false),
          );
          const queriesArray = await Promise.all(queryPromises);
          const queries = queriesArray.flat() as ExecuteBatchQueriesType;

          if (queries.length) {
            await this.offlineDb.executeSqlBatch(queries);
          }
        } catch (e) {
          console.log('An error has occurred while syncing the DB.', e);
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
