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
import { runDetached } from './utils';

// TODO: Find a clever way to pass this in a different manner
/**
 * Represents a single SQL query or a query with parameters.
 */
export type PreparedBatchQueries =
  | [string]
  | [string, Array<unknown> | Array<Array<unknown>>];

/**
 * Options to insert a reaction into a message.
 */
export type InsertReactionType = {
  /** Message to which the reaction is applied. */
  message: MessageResponse | LocalMessage;
  /** The reaction to insert. */
  reaction: ReactionResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert channel IDs associated with a query.
 */
export type UpsertCidsForQueryType = {
  /** Array of channel IDs. */
  cids: string[];
  /** Optional filters for the channels. */
  filters?: ChannelFilters;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
  /** Optional sorting applied to the channels. */
  sort?: ChannelSort;
};

/**
 * Options to upsert multiple channels.
 */
export type UpsertChannelsType = {
  /** Array of channel API responses. */
  channels: ChannelAPIResponse[];
  /** Whether to immediately execute the operation. */
  execute?: boolean;
  /** If true, marks that the latest messages are already set. */
  isLatestMessagesSet?: boolean;
};

/**
 * Options to upsert application settings for a user.
 */
export type UpsertAppSettingsType = {
  /** App settings data. */
  appSettings: AppSettingsAPIResponse;
  /** ID of the user the settings belong to. */
  userId: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Sync status information for a user.
 */
export type UpsertUserSyncStatusType = {
  /** ID of the user. */
  userId: string;
  /** ISO timestamp of the last sync. */
  lastSyncedAt: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert a poll.
 */
export type UpsertPollType = {
  /** Poll data to be stored. */
  poll: PollResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert individual channel data.
 */
export type UpsertChannelDataType = {
  /** Channel data. */
  channel: ChannelResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert read statuses for a channel.
 */
export type UpsertReadsType = {
  /** Channel ID. */
  cid: string;
  /** Array of read statuses. */
  reads: ReadResponse[];
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert multiple messages.
 */
export type UpsertMessagesType = {
  /** Array of message responses. */
  messages: MessageResponse[];
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert members in a channel.
 */
export type UpsertMembersType = {
  /** Channel ID. */
  cid: string;
  /** Array of channel members. */
  members: ChannelMemberResponse[];
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to update a reaction.
 */
export type UpdateReactionType = {
  /** Message associated with the reaction. */
  message: MessageResponse | LocalMessage;
  /** The updated reaction. */
  reaction: ReactionResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to update a message.
 */
export type UpdateMessageType = {
  /** Message to update. */
  message: MessageResponse | LocalMessage;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to get channels by their IDs.
 */
export type GetChannelsType = {
  /** Array of channel IDs. */
  cids: string[];
  /** ID of the user. */
  userId: string;
};

/**
 * Options to get channels based on filters.
 */
export type GetChannelsForQueryType = {
  /** ID of the user. */
  userId: string;
  /** Optional filters for channels. */
  filters?: ChannelFilters;
  /** Optional sorting for the channels. */
  sort?: ChannelSort;
};

/**
 * Get the last sync timestamp for a user.
 */
export type GetLastSyncedAtType = {
  /** ID of the user. */
  userId: string;
};

/**
 * Options to fetch pending tasks for a specific message.
 */
export type GetPendingTasksType = {
  /** Optional message ID to filter tasks. */
  messageId?: string;
};

/**
 * Get application settings for a user.
 */
export type GetAppSettingsType = {
  /** ID of the user. */
  userId: string;
};

/**
 * Options to retrieve reactions for a message.
 */
export type GetReactionsType = {
  /** ID of the message. */
  messageId: string;
  /** Optional filter to apply to reactions. */
  filters?: Pick<ReactionFilters, 'type'>;
  /** Optional sorting for reactions. */
  sort?: ReactionSort;
  /** Optional maximum number of reactions to return. */
  limit?: number;
};

/**
 * Delete a pending task by ID.
 */
export type DeletePendingTaskType = {
  /** ID of the pending task. */
  id: number;
};

/**
 * Options to delete a reaction from a message.
 */
export type DeleteReactionType = {
  /** The reaction to delete. */
  reaction: ReactionResponse;
  /** Optional message associated with the reaction. */
  message?: MessageResponse | LocalMessage;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete a channel member.
 */
export type DeleteMemberType = {
  /** Channel ID. */
  cid: string;
  /** Member to remove. */
  member: ChannelMemberResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to drop all pending tasks for a message.
 */
export type DropPendingTasksType = {
  /** ID of the message. */
  messageId: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete a message.
 */
export type DeleteMessageType = {
  /** ID of the message. */
  id: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete a channel.
 */
export type DeleteChannelType = {
  /** Channel ID. */
  cid: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete messages in a channel.
 */
export type DeleteMessagesForChannelType = {
  /** Channel ID. */
  cid: string;
  /** Timestamp before which messages are deleted. */
  truncated_at?: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Check if a channel exists by ID.
 */
export type ChannelExistsType = {
  /** Channel ID. */
  cid: string;
};

/**
 * Represents a list of batch SQL queries to be executed.
 */
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
  getChannels: (
    options: GetChannelsType,
  ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>;
  getChannelsForQuery: (
    options: GetChannelsForQueryType,
  ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>;
  getAllChannelCids: () => Promise<string[]>;
  getLastSyncedAt: (options: GetLastSyncedAtType) => Promise<string | undefined>;
  getAppSettings: (options: GetAppSettingsType) => Promise<AppSettingsAPIResponse | null>;
  getReactions: (options: GetReactionsType) => Promise<ReactionResponse[] | null>;
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

/**
 * Abstract base class for an offline database implementation used with StreamChat.
 *
 * Manages state and synchronization logic between the client and the offline database,
 * as well as contains the API providing core functionality for tracking and persisting
 * offline data.
 *
 * @abstract
 */
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

  /**
   * @abstract
   * Inserts a reaction into the DB.
   * Will write to:
   * - The reactions table with the new reaction
   * - The message table with the message containing the new reaction
   * - The users table with any users associated
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {InsertReactionType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract insertReaction: OfflineDBApi['insertReaction'];

  /**
   * @abstract
   * Upserts the list of CIDs for a filter + sort query hash.
   * Will write to only the table containing the cids.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertCidsForQueryType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertCidsForQuery: OfflineDBApi['upsertCidsForQuery'];

  /**
   * @abstract
   * Upserts the channels passed as an argument within the DB. Relies on
   * writing the properties we need from a ChannelResponse into the adequate
   * tables.
   * Will write to:
   * - The channels table with the channel data
   * - The messages table with each message associated
   * - The reactions table if the messages contain reactions
   * - The users table with all users associated
   * - The members table for membership and members
   * - The polls table for any messages that are polls
   * - The reads table for each user
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertChannelsType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertChannels: OfflineDBApi['upsertChannels'];

  /**
   * @abstract
   * Upserts the current active user's sync status.
   * Will only write to the sync status table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertUserSyncStatusType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertUserSyncStatus: OfflineDBApi['upsertUserSyncStatus'];

  /**
   * @abstract
   * Upserts the app settings for the current Stream App into the DB. It
   * is only intended to be run once per lifecycle of the app.
   * Will only write to the respective app settings table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertAppSettingsType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertAppSettings: OfflineDBApi['upsertAppSettings'];

  /**
   * @abstract
   * Upserts a poll fully in the DB.
   * Will write to the polls table. It should not update the message
   * associated due to how the poll state works.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertPollType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertPoll: OfflineDBApi['upsertPoll'];

  /**
   * @abstract
   * Upserts only the channel.data for the provided channels in the DB.
   * Will only write to the channels table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertChannelDataType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertChannelData: OfflineDBApi['upsertChannelData'];

  /**
   * @abstract
   * Upserts the provided reads in the DB.
   * Will write to:
   * - The reads table
   * - The users table for each user associated with a read
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertReadsType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertReads: OfflineDBApi['upsertReads'];

  /**
   * @abstract
   * Upserts the messages in the DB.
   * Will write to:
   * - The messages table
   * - The reads table
   * - The polls table (if any messages contain polls)
   * - The reactions table (if any messages contain reactions)
   * - The users table
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertMessagesType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertMessages: OfflineDBApi['upsertMessages'];

  /**
   * @abstract
   * Upserts the members in the DB.
   * Will write to:
   * - The users table (for each user associated with a member)
   * - The members table
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpsertMembersType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract upsertMembers: OfflineDBApi['upsertMembers'];

  /**
   * @abstract
   * Updates a reaction in the DB. Will update the DB the same way
   * a reaction.updated event would (it assumes enforce_unique is true
   * and removes all other reactions associated with the user.
   * Will write to the reactions table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpdateReactionType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract updateReaction: OfflineDBApi['updateReaction'];

  /**
   * @abstract
   * Updates a single message in the DB. This is used as a faster
   * alternative to upsertMessages with more optimized queries.
   * Will write to the messages table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {UpdateMessageType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract updateMessage: OfflineDBApi['updateMessage'];

  /**
   * @abstract
   * Fetches the provided channels from the DB and aggregates all data associated
   * with them in a single ChannelAPIResponse. The implementation itself is responsible
   * for aggregating and serialization of all of the data. Should return as close to
   * the server side ChannelAPIResponse as possible.
   * @param {GetChannelsType} options
   * @returns {Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>}
   */
  abstract getChannels: OfflineDBApi['getChannels'];

  /**
   * @abstract
   * Fetches the channels from the DB that were the last known response to a filters & sort
   * hash as a query and aggregates all data associated with them in a single ChannelAPIResponse.
   * The implementation itself is responsible for aggregating and serialization of all of the data.
   * Should return as close to the server side ChannelAPIResponse as possible.
   * @param {GetChannelsForQueryType} options
   * @returns {Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>}
   */
  abstract getChannelsForQuery: OfflineDBApi['getChannelsForQuery'];

  /**
   * @abstract
   * Will return a list of all available CIDs in the DB. The same can be achieved
   * by fetching all channels, however this is meant to be much faster as a query.
   * @returns {Promise<string[]>}
   */
  abstract getAllChannelCids: OfflineDBApi['getAllChannelCids'];

  /**
   * @abstract
   * Fetches the timestamp of the last sync of the DB.
   * @param {GetLastSyncedAtType} options
   * @returns {Promise<string | undefined>}
   */
  abstract getLastSyncedAt: OfflineDBApi['getLastSyncedAt'];

  /**
   * @abstract
   * Fetches all pending tasks from the DB. It will return them in an
   * ordered fashion by the time they were created.
   * @param {GetPendingTasksType} [conditions]
   * @returns {Promise<PendingTask[]>}
   */
  abstract getPendingTasks: OfflineDBApi['getPendingTasks'];

  /**
   * @abstract
   * Fetches the app settings stored in the DB. Is mainly meant to be used
   * only while offline and opening the application, as we only update the
   * app settings whenever they are fetched again so it has the potential to
   * be stale.
   * @param {GetAppSettingsType} options
   * @returns {Promise<AppSettingsAPIResponse | null>}
   */
  abstract getAppSettings: OfflineDBApi['getAppSettings'];

  /**
   * @abstract
   * Fetches reactions from the DB for a given filter & sort hash and
   * for a given message ID.
   * @param {GetReactionsType} options
   * @returns {Promise<ReactionResponse[] | null>}
   */
  abstract getReactions: OfflineDBApi['getReactions'];

  /**
   * @abstract
   * Executes multiple queries in a batched fashion. It will also be done
   * within a transaction.
   * @param {ExecuteBatchQueriesType} queries
   * @returns {Promise<unknown>}
   */
  abstract executeSqlBatch: OfflineDBApi['executeSqlBatch'];

  /**
   * @abstract
   * Adds a pending task to the pending tasks table. Can only be one of the
   * supported types of pending tasks, otherwise its execution will throw.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {PendingTask} task
   * @returns {Promise<() => Promise<void>>}
   */
  abstract addPendingTask: OfflineDBApi['addPendingTask'];

  /**
   * @abstract
   * Deletes a pending task from the DB, given its ID.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeletePendingTaskType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract deletePendingTask: OfflineDBApi['deletePendingTask'];

  /**
   * @abstract
   * Deletes a reaction from the DB.
   * Will write to the reactions table removing the reaction.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeleteReactionType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract deleteReaction: OfflineDBApi['deleteReaction'];

  /**
   * @abstract
   * Deletes a member from the DB.
   * Will only write to the members table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeleteMemberType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract deleteMember: OfflineDBApi['deleteMember'];

  /**
   * @abstract
   * Deletes a channel from the DB.
   * It will also delete all other entities associated with the channel in
   * a cascading fashion (messages, reactions, members etc.).
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeleteChannelType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract deleteChannel: OfflineDBApi['deleteChannel'];

  /**
   * @abstract
   * Deletes multiple messages for a given channel. Works as `channel.truncated` would.
   * Should remove entities primarily from the messages table and then from all associated
   * tables in a cascading fashion (reactions, polls etc.).
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeleteMessagesForChannelType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract deleteMessagesForChannel: OfflineDBApi['deleteMessagesForChannel'];

  /**
   * @abstract
   * Deletes all pending tasks from the DB.
   * Will only update the pending tasks table.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DropPendingTasksType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract dropPendingTasks: OfflineDBApi['dropPendingTasks'];

  /**
   * @abstract
   * Deletes a message from the DB.
   * All other entities associated with the message will also be deleted
   * in a cascading fashion (reactions, polls etc.).
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeleteMessageType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract hardDeleteMessage: OfflineDBApi['hardDeleteMessage'];

  /**
   * @abstract
   * Updates a message with a deleted_at value in the DB.
   * Will only update the messages table, as the message is simply marked
   * as deleted and not removed from the DB.
   * Will return the prepared queries for delayed execution (even if they are
   * already executed).
   * @param {DeleteMessageType} options
   * @returns {Promise<ExecuteBatchQueriesType>}
   */
  abstract softDeleteMessage: OfflineDBApi['softDeleteMessage'];

  /**
   * @abstract
   * Drops all tables and reinitializes the connection to the DB.
   * @returns {Promise<unknown>}
   */
  abstract resetDB: OfflineDBApi['resetDB'];

  /**
   * @abstract
   * A utility query that checks whether a specific channel exists in the DB.
   * Technically the same as actually fetching that channel through other queries,
   * but much faster.
   * @param {ChannelExistsType} options
   * @returns {Promise<boolean>}
   */
  abstract channelExists: OfflineDBApi['channelExists'];

  /**
   * @abstract
   * Initializes the DB (typically creating a simple file handle as a connection pointer for
   * SQLite and likely similar for other DBs).
   * @returns {Promise<boolean>}
   */
  abstract initializeDB: OfflineDBApi['initializeDB'];

  /**
   * Initializes the DB as well as its syncManager for a given userId.
   * It will update the DBs reactive state with initialization values.
   * @param userId - the user ID for which we want to initialize
   */
  public init = async (userId: string) => {
    try {
      if (!this.shouldInitialize(userId)) {
        // Note: We need this to return as changing the API is a breaking change.
        // This will change in the next major release.
        const initialized = await this.initializeDB();
        if (initialized) {
          await this.syncManager.init();
          this.state.partialNext({ initialized: true, userId });
        } else {
          this.state.partialNext({ initialized: false });
        }
      }
    } catch (error) {
      this.state.partialNext({ initialized: false, userId: undefined });
      console.log('Error Initializing DB:', error);
    }
  };

  /**
   * Checks whether the DB should be initialized or if it has been initialized already.
   * @param {string} userId - the user ID for which we want to check initialization
   */
  public shouldInitialize(userId: string): boolean {
    const { userId: userIdFromState, initialized } = this.state.getLatestValue();
    return userId === userIdFromState && initialized;
  }

  /**
   * A utility method used to execute a query in a detached manner. The callback
   * passed uses a reference to the DB itself and will handle errors gracefully
   * and silently. Only really meant to be used for write queries that need to
   * be run in synchronous functions.
   * @param queryCallback - a callback wrapping all query logic that is to be executed
   * @param method - a utility parameter used for proper logging (will make sure the method
   * is logged on failure)
   */
  public executeQuerySafely = <T>(
    queryCallback: (db: AbstractOfflineDB) => Promise<T>,
    { method }: { method: string },
  ) => {
    const { initialized } = this.state.getLatestValue();
    if (!initialized) {
      return;
    }
    runDetached(queryCallback(this), { context: `OfflineDB(${method})` });
  };

  /**
   * A utility method used to guard a certain DB query with the possible non-existance
   * of a channel inside of the DB. If the channel we want to guard against does not exist
   * in the DB yet, it will try to:
   *
   * 1. Use the channel from the WS event
   * 2. Use the channel from state
   *
   * and upsert the channels in the DB.
   *
   * If both fail, it will not execute the query as it would result in a foreign key constraint
   * error.
   *
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   * @param forceUpdate - whether to upsert the channel data anyway
   * @param createQueries - a callback function to creation of the queries that we want to execute
   */
  public queriesWithChannelGuard = async (
    {
      event,
      execute = true,
      forceUpdate = false,
    }: { event: Event; execute?: boolean; forceUpdate?: boolean },
    createQueries: (executeOverride?: boolean) => Promise<PreparedBatchQueries[]>,
  ) => {
    const channelFromEvent = event.channel;
    const cid = event.cid || channelFromEvent?.cid;
    const type = event.type;

    if (!cid) {
      return await createQueries(execute);
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
          execute: false,
        });
        if (channelQuery) {
          const createdQueries = await createQueries(false);
          const newQueries = [...channelQuery, ...createdQueries];
          if (execute) {
            await this.executeSqlBatch(newQueries);
          }
          return newQueries;
        } else {
          console.warn(
            `Couldn't create channel queries on ${type} event for an initialized channel that is not in DB, skipping event`,
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
    return await createQueries(execute);
  };

  /**
   * Handles a message.new event. Will always use a channel guard for the inner queries
   * and it is going to make sure that both messages and reads are upserted. It will not
   * try to fetch the reads from the DB first and it will rely on channel.state to handle
   * the number of unreads.
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleNewMessage = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const client = this.client;
    const { cid, message, user } = event;

    if (!message || (message.parent_id && !message.show_in_channel)) {
      return [];
    }

    const finalQueries = await this.queriesWithChannelGuard(
      { event, execute },
      async () => {
        let queries = await this.upsertMessages({
          execute: false,
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
              execute: false,
              reads: [
                {
                  last_read: ownReads.last_read.toISOString() as string,
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

    if (execute) {
      await this.executeSqlBatch(finalQueries);
    }

    return finalQueries;
  };

  /**
   * A handler for message deletion. It provides a channel guard and determines whether
   * it should hard delete or soft delete the message.
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleDeleteMessage = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { message, hard_delete = false } = event;

    if (message) {
      const deleteMethod = hard_delete ? this.hardDeleteMessage : this.softDeleteMessage;
      return await this.queriesWithChannelGuard(
        { event, execute },
        async (executeOverride) =>
          await deleteMethod({ id: message.id, execute: executeOverride }),
      );
    }

    return [];
  };

  /**
   * A utility method used for removing a message that has already failed from the
   * state as well as the DB. We want to drop all pending tasks and finally hard
   * delete the message from the DB.
   * @param messageId - the message id of the message we want to remove
   * @param execute - whether to immediately execute the operation.
   */
  public handleRemoveMessage = async ({
    messageId,
    execute = true,
  }: {
    messageId: string;
    execute?: boolean;
  }) => {
    const dropPendingTasksQueries = await this.dropPendingTasks({
      messageId,
      execute: false,
    });
    const hardDeleteMessageQueries = await this.hardDeleteMessage({
      id: messageId,
      execute: false,
    });
    const queries = [...dropPendingTasksQueries, ...hardDeleteMessageQueries];

    if (execute) {
      await this.executeSqlBatch(queries);
    }

    return queries;
  };

  /**
   * A utility method to handle read events. It will calculate the state of the reads if
   * present in the event, or optionally rely on the hard override in unreadMessages.
   * The unreadMessages argument is useful for cases where we know the exact number of unreads
   * (for example reading an entire channel), but `unread_messages` might not necessarily exist
   * in the event (or it exists with a stale value if we know what we want to ultimately update to).
   * @param event - the WS event we are trying to process
   * @param unreadMessages - an override of unread_messages that will be preferred when upserting reads
   * @param execute - whether to immediately execute the operation.
   */
  public handleRead = async ({
    event,
    unreadMessages,
    execute = true,
  }: {
    event: Event;
    unreadMessages?: number;
    execute?: boolean;
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
      return await this.queriesWithChannelGuard({ event, execute }, (executeOverride) =>
        this.upsertReads({
          cid,
          execute: executeOverride,
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

  /**
   * A utility method used to handle member events. It guards the processing
   * of each event with a channel guard and also forces an update of member_count
   * for the respective channel if applicable.
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleMemberEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { member, cid, type } = event;

    if (member && cid) {
      // we force update here so that member_count gets updated
      // TODO: Although this is more than fine for now, we should look into
      //       changing this to be an actual update to the DB instead.
      return await this.queriesWithChannelGuard(
        { event, execute, forceUpdate: true },
        async (executeOverride) => {
          if (type === 'member.removed') {
            return await this.deleteMember({ member, cid, execute: executeOverride });
          }

          return await this.upsertMembers({
            cid,
            members: [member],
            execute: executeOverride,
          });
        },
      );
    }

    return [];
  };

  /**
   * A utility method used to handle message.updated events. It guards each
   * event handler within a channel guard.
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleMessageUpdatedEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { message } = event;

    if (message && !message.parent_id) {
      return await this.queriesWithChannelGuard(
        { event, execute },
        async (executeOverride) =>
          await this.updateMessage({ message, execute: executeOverride }),
      );
    }

    return [];
  };

  /**
   * An event handler for channel.visible and channel.hidden events. We need a separate
   * handler because event.channel.hidden does not arrive with the baseline event, so a
   * simple upsertion is not enough.
   * It will update the hidden property of a channel to true if handling the `channel.hidden`
   * event and to false if handling `channel.visible`.
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleChannelVisibilityEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { type, channel } = event;

    if (channel && type) {
      const hidden = type === 'channel.hidden';
      return await this.upsertChannelData({
        channel: { ...channel, hidden },
        execute,
      });
    }

    return [];
  };

  /**
   * A utility handler used to handle channel.truncated events. It handles both
   * removing all messages and relying on truncated_at as well. It will also upsert
   * reads adequately (and calculate the correct unread messages when truncating).
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleChannelTruncatedEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { channel } = event;
    const ownUser = this.client.user;
    if (channel && ownUser) {
      const { cid, truncated_at } = channel;
      const truncateQueries = await this.deleteMessagesForChannel({
        cid,
        truncated_at,
        execute: false,
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
        execute: false,
        reads: [
          {
            last_read: ownReads.last_read.toString() as string,
            last_read_message_id: ownReads.last_read_message_id,
            unread_messages: unreadCount,
            user: ownUser,
          },
        ],
      });

      const finalQueries = [...truncateQueries, ...upsertReadQueries];

      if (execute) {
        await this.executeSqlBatch(finalQueries);
      }

      return finalQueries;
    }

    return [];
  };

  /**
   * A utility handler for all reaction events. It wraps the inner queries
   * within a channel guard and maps them like so:
   * - reaction.new -> insertReaction
   * - reaction.updated -> updateReaction
   * - reaction.deleted -> deleteReaction
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleReactionEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { type, message, reaction } = event;

    if (!(message && reaction)) {
      return [];
    }

    const getReactionMethod = (type: Event['type']) => {
      switch (type) {
        case 'reaction.new':
          return this.insertReaction;
        case 'reaction.deleted':
          return this.deleteReaction;
        case 'reaction.updated':
          return this.updateReaction;
        default:
          throw new Error(
            `You are trying to handle a non-reaction event (${type}) through the reaction DB api.`,
          );
      }
    };

    const reactionMethod = getReactionMethod(type);

    return await this.queriesWithChannelGuard({ event, execute }, (executeOverride) =>
      reactionMethod({ message, reaction, execute: executeOverride }),
    );
  };

  /**
   * A generic event handler that decides which DB API to invoke based on
   * event.type for all events we are currently handling. It is used to both
   * react on WS events as well as process the sync API events.
   * @param event - the WS event we are trying to process
   * @param execute - whether to immediately execute the operation.
   */
  public handleEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { type, channel } = event;

    if (type.startsWith('reaction')) {
      return await this.handleReactionEvent({ event, execute });
    }

    if (type === 'message.new') {
      return await this.handleNewMessage({ event, execute });
    }

    if (type === 'message.deleted') {
      return await this.handleDeleteMessage({ event, execute });
    }

    if (type === 'message.updated' || type === 'message.undeleted') {
      return this.handleMessageUpdatedEvent({ event, execute });
    }

    if (type === 'message.read' || type === 'notification.mark_read') {
      return this.handleRead({ event, unreadMessages: 0, execute });
    }

    if (type === 'notification.mark_unread') {
      return this.handleRead({ event, execute });
    }

    if (type.startsWith('member.')) {
      return await this.handleMemberEvent({ event, execute });
    }

    if (type === 'channel.hidden' || type === 'channel.visible') {
      return await this.handleChannelVisibilityEvent({ event, execute });
    }

    // Note: It is a bit counter-intuitive that we do not touch the messages in the
    //       offline DB when receiving notification.message_new, however we do this
    //       because we anyway cannot get the messages for a channel until we run
    //       either channel.watch() or channel.query(...) to get them. So, when
    //       receiving the event we only upsert the channel data and we leave the
    //       rest of the entities to be updated whenever we actually start watching
    //       or we at least query.
    if (
      (type === 'channel.updated' ||
        type === 'notification.message_new' ||
        type === 'notification.added_to_channel') &&
      channel
    ) {
      return await this.upsertChannelData({ channel, execute });
    }

    if (
      (type === 'channel.deleted' ||
        type === 'notification.channel_deleted' ||
        type === 'notification.removed_from_channel') &&
      channel
    ) {
      return await this.deleteChannel({ cid: channel.cid, execute });
    }

    if (type === 'channel.truncated') {
      return await this.handleChannelTruncatedEvent({ event, execute });
    }

    return [];
  };

  /**
   * A method used to enqueue a pending task if the execution of it fails.
   * It will try to do the following:
   *
   * 1. Execute the task immediately
   * 2. If this fails, checks if the failure was due to something valid for a pending task
   * 3. If it is, it will insert the task in the pending tasks table
   *
   * It will return the response from the execution if it succeeded.
   * @param task - the pending task we want to execute
   */
  public queueTask = async ({ task }: { task: PendingTask }) => {
    let response;
    try {
      if (!this.client.wsConnection?.isHealthy) {
        await this.addPendingTask(task);
        return;
      }
      response = await this.executeTask({ task });
    } catch (e) {
      if (!this.shouldSkipQueueingTask(e as AxiosError<APIErrorResponse>)) {
        await this.addPendingTask(task);
        throw e;
      }
    }

    return response;
  };

  /**
   * A utility method that determines if a failed task should be added to the
   * queue based on its error.
   * Error code 4 - bad request data
   * Error code 17 - missing own_capabilities to execute the task
   * @param error
   */
  private shouldSkipQueueingTask = (error: AxiosError<APIErrorResponse>) =>
    error?.response?.data?.code === 4 || error?.response?.data?.code === 17;

  /**
   * Executes a task from the list of supported pending tasks. Currently supported pending tasks
   * are:
   * - Deleting a message
   * - Sending a reaction
   * - Removing a reaction
   * - Sending a message
   * It will throw if we try to execute a pending task that is not supported.
   * @param task - The task we want to execute
   * @param isPendingTask - a control value telling us if it's an actual pending task being executed
   * or delayed execution
   */
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

    throw new Error(
      `Tried to execute invalid pending task type (${task.type}) while synchronizing the database.`,
    );
  };

  /**
   * A utility method used to execute all pending tasks. As each task succeeds execution,
   * it is going to be removed from the DB. If the execution failed due to a valid reason
   * it is going to remove the pending task from the DB even if execution fails, otherwise
   * it will keep it for the next time we try to execute all pending taks.
   */
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
        if (!this.shouldSkipQueueingTask(error)) {
          // executing the pending task has failed, so keep it in the queue
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
        try {
          const result = await this.client.sync(cids, lastSyncedAtDate.toISOString());
          const queryPromises = result.events.map((event) =>
            this.offlineDb.handleEvent({ event, execute: false }),
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

  /**
   * Executes any tasks that were queued while offline and then performs a sync.
   */
  private syncAndExecutePendingTasks = async () => {
    await this.offlineDb.executePendingTasks();
    await this.sync();
  };
}
