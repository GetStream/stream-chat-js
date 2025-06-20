import type {
  AppSettingsAPIResponse,
  ChannelAPIResponse,
  ChannelFilters,
  ChannelMemberResponse,
  ChannelResponse,
  ChannelSort,
  DraftResponse,
  LocalMessage,
  MessageResponse,
  PollResponse,
  ReactionFilters,
  ReactionResponse,
  ReactionSort,
  ReadResponse,
} from '../types';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';

export type PrepareBatchDBQueries =
  | [string]
  | [string, Array<unknown> | Array<Array<unknown>>];

/**
 * Options to insert a reaction into a message.
 */
export type DBInsertReactionType = {
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
export type DBUpsertCidsForQueryType = {
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
export type DBUpsertChannelsType = {
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
export type DBUpsertAppSettingsType = {
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
export type DBUpsertUserSyncStatusType = {
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
export type DBUpsertPollType = {
  /** Poll data to be stored. */
  poll: PollResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert individual channel data.
 */
export type DBUpsertChannelDataType = {
  /** Channel data. */
  channel: ChannelResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert read statuses for a channel.
 */
export type DBUpsertReadsType = {
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
export type DBUpsertMessagesType = {
  /** Array of message responses. */
  messages: MessageResponse[];
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to upsert members in a channel.
 */
export type DBUpsertMembersType = {
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
export type DBUpdateReactionType = {
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
export type DBUpdateMessageType = {
  /** Message to update. */
  message: MessageResponse | LocalMessage;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to get channels by their IDs.
 */
export type DBGetChannelsType = {
  /** Array of channel IDs. */
  cids: string[];
  /** ID of the user. */
  userId: string;
};

/**
 * Options to get channels based on filters.
 */
export type DBGetChannelsForQueryType = {
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
export type DBGetLastSyncedAtType = {
  /** ID of the user. */
  userId: string;
};

/**
 * Options to fetch pending tasks for a specific message.
 */
export type DBGetPendingTasksType = {
  /** Optional message ID to filter tasks. */
  messageId?: string;
};

/**
 * Get application settings for a user.
 */
export type DBGetAppSettingsType = {
  /** ID of the user. */
  userId: string;
};

/**
 * Options to retrieve reactions for a message.
 */
export type DBGetReactionsType = {
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
export type DBDeletePendingTaskType = {
  /** ID of the pending task. */
  id: number;
};

/**
 * Options to delete a reaction from a message.
 */
export type DBDeleteReactionType = {
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
export type DBDeleteMemberType = {
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
export type DBDropPendingTasksType = {
  /** ID of the message. */
  messageId: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete a message.
 */
export type DBDeleteMessageType = {
  /** ID of the message. */
  id: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete a channel.
 */
export type DBDeleteChannelType = {
  /** Channel ID. */
  cid: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Options to delete messages in a channel.
 */
export type DBDeleteMessagesForChannelType = {
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
export type DBChannelExistsType = {
  /** Channel ID. */
  cid: string;
};

export type DBUpsertDraftType = {
  /** Draft message to upsert. */
  draft: DraftResponse;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

export type DBGetDraftType = {
  /** Channel ID for which to get the draft. */
  cid: string;
  /** ID of the user requesting the draft. */
  userId: string;
  /** Optional parent ID for the parent message in thread, if applicable. */
  parent_id?: string;
};

export type DBDeleteDraftType = {
  /** Channel ID for which to delete the draft. */
  cid: string;
  /** Optional parent ID for the parent message in thread, if applicable. */
  parent_id?: string;
  /** Whether to immediately execute the operation. */
  execute?: boolean;
};

/**
 * Represents a list of batch SQL queries to be executed.
 */
export type ExecuteBatchDBQueriesType = PrepareBatchDBQueries[];

export interface OfflineDBApi {
  insertReaction: (options: DBInsertReactionType) => Promise<ExecuteBatchDBQueriesType>;
  upsertCidsForQuery: (
    options: DBUpsertCidsForQueryType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  upsertChannels: (options: DBUpsertChannelsType) => Promise<ExecuteBatchDBQueriesType>;
  upsertUserSyncStatus: (
    options: DBUpsertUserSyncStatusType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  upsertAppSettings: (
    options: DBUpsertAppSettingsType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  upsertDraft: (options: DBUpsertDraftType) => Promise<ExecuteBatchDBQueriesType>;
  upsertPoll: (options: DBUpsertPollType) => Promise<ExecuteBatchDBQueriesType>;
  upsertChannelData: (
    options: DBUpsertChannelDataType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  upsertReads: (options: DBUpsertReadsType) => Promise<ExecuteBatchDBQueriesType>;
  upsertMessages: (options: DBUpsertMessagesType) => Promise<ExecuteBatchDBQueriesType>;
  upsertMembers: (options: DBUpsertMembersType) => Promise<ExecuteBatchDBQueriesType>;
  updateReaction: (options: DBUpdateReactionType) => Promise<ExecuteBatchDBQueriesType>;
  updateMessage: (options: DBUpdateMessageType) => Promise<ExecuteBatchDBQueriesType>;
  getDraft: (options: DBGetDraftType) => Promise<DraftResponse | null>;
  getChannels: (
    options: DBGetChannelsType,
  ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>;
  getChannelsForQuery: (
    options: DBGetChannelsForQueryType,
  ) => Promise<Omit<ChannelAPIResponse, 'duration'>[] | null>;
  getAllChannelCids: () => Promise<string[]>;
  getLastSyncedAt: (options: DBGetLastSyncedAtType) => Promise<string | undefined>;
  getAppSettings: (
    options: DBGetAppSettingsType,
  ) => Promise<AppSettingsAPIResponse | null>;
  getReactions: (options: DBGetReactionsType) => Promise<ReactionResponse[] | null>;
  executeSqlBatch: (queries: ExecuteBatchDBQueriesType) => Promise<unknown>;
  addPendingTask: (task: PendingTask) => Promise<() => Promise<void>>;
  getPendingTasks: (conditions?: DBGetPendingTasksType) => Promise<PendingTask[]>;
  deleteDraft: (options: DBDeleteDraftType) => Promise<ExecuteBatchDBQueriesType>;
  deletePendingTask: (
    options: DBDeletePendingTaskType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  deleteReaction: (options: DBDeleteReactionType) => Promise<ExecuteBatchDBQueriesType>;
  deleteMember: (options: DBDeleteMemberType) => Promise<ExecuteBatchDBQueriesType>;
  deleteChannel: (options: DBDeleteChannelType) => Promise<ExecuteBatchDBQueriesType>;
  deleteMessagesForChannel: (
    options: DBDeleteMessagesForChannelType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  dropPendingTasks: (
    options: DBDropPendingTasksType,
  ) => Promise<ExecuteBatchDBQueriesType>;
  hardDeleteMessage: (options: DBDeleteMessageType) => Promise<ExecuteBatchDBQueriesType>;
  softDeleteMessage: (options: DBDeleteMessageType) => Promise<ExecuteBatchDBQueriesType>;
  resetDB: () => Promise<unknown>;
  channelExists: (options: DBChannelExistsType) => Promise<boolean>;
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
  createDraft: 'create-draft';
  deleteDraft: 'delete-draft';
};

// TODO: Please rethink the definition of PendingTasks as it seems awkward
export type PendingTask = {
  channelId?: string;
  channelType?: string;
  messageId?: string;
  id?: number;
  threadId?: string;
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
  | {
      payload: Parameters<Channel['createDraft']>;
      type: PendingTaskTypes['createDraft'];
    }
  | {
      payload: Parameters<Channel['deleteDraft']>;
      type: PendingTaskTypes['deleteDraft'];
    }
);

export type OfflineErrorType = 'connection:lost';

export class OfflineError extends Error {
  public type: OfflineErrorType;
  public name = 'OfflineError';

  constructor(
    message: string,
    {
      type,
    }: {
      type: OfflineError['type'];
    },
  ) {
    super(message);
    this.type = type;
  }

  // Vitest helper (serialized errors are too large to read)
  // https://github.com/vitest-dev/vitest/blob/v3.1.3/packages/utils/src/error.ts#L60-L62
  toJSON() {
    return {
      message: `${this.type} - ${this.message}`,
      stack: this.stack,
      name: this.name,
    };
  }
}
