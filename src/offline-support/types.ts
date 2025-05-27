import type {
  AppSettingsAPIResponse,
  ChannelAPIResponse,
  ChannelFilters,
  ChannelMemberResponse,
  ChannelResponse,
  ChannelSort,
  LocalMessage,
  Message,
  MessageResponse,
  PollResponse,
  ReactionFilters,
  ReactionResponse,
  ReactionSort,
  ReadResponse,
} from '../types';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';

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
