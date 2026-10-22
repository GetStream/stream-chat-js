import type {
  ChannelFilters,
  ChannelMemberResponse,
  ChannelOptions,
  ChannelResponse,
  ChannelStateResponseFields,
  DraftResponse,
  GetApplicationResponse,
  LocalMessage,
  MessageResponse,
  ParsedPredefinedFilterResponse,
  PollResponseData,
  QueryChannelsRequest,
  ReactionFilters,
  ReactionResponse,
  ReadStateResponse,
  SortParamRequest,
  TimestampNS,
} from '../types';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';

export type PrepareBatchDBQueries =
  | [string]
  | [string, Array<unknown> | Array<Array<unknown>>];

export type DBInsertReactionType = {
  message: MessageResponse | LocalMessage;
  reaction: ReactionResponse;
  execute?: boolean;
};

export type DBUpsertCidsForQueryType = {
  cids: string[];
  filters?: ChannelFilters;
  options?: ChannelOptions;
  execute?: boolean;
  /**
   * The predefined-filter metadata the backend resolved for this query, stored with the cid order
   * so a cache-seeded list sorts and matches by the same rule. Absent for a plain
   * `filter_conditions` query, which clears any stored metadata.
   */
  predefinedFilter?: ParsedPredefinedFilterResponse;
  sort?: SortParamRequest[];
};

export type DBUpsertChannelsType = {
  channels: ChannelStateResponseFields[];
  execute?: boolean;
  /** True when the channels' messages are their latest page (a channel opened with `watch()` / `create()`, or `queryChannels`). */
  isLatestMessagesSet?: boolean;
};

export type DBUpsertAppSettingsType = {
  appSettings: GetApplicationResponse;
  userId: string;
  execute?: boolean;
};

export type DBUpsertUserSyncStatusType = {
  userId: string;
  /** A date string `new Date()` can parse. */
  lastSyncedAt: string;
  execute?: boolean;
};

export type DBUpsertPollType = {
  poll: PollResponseData;
  execute?: boolean;
};

export type DBUpsertChannelDataType = {
  channel: ChannelResponse;
  execute?: boolean;
};

export type DBUpsertReadsType = {
  cid: string;
  reads: ReadStateResponse[];
  execute?: boolean;
};

export type DBUpsertMessagesType = {
  messages: MessageResponse[];
  execute?: boolean;
};

export type DBUpsertMembersType = {
  cid: string;
  members: ChannelMemberResponse[];
  execute?: boolean;
};

export type DBUpdateReactionType = {
  message: MessageResponse | LocalMessage;
  reaction: ReactionResponse;
  execute?: boolean;
};

export type DBUpdateMessageType = {
  message: MessageResponse | LocalMessage;
  execute?: boolean;
};

export type DBGetChannelsType = {
  cids: string[];
  userId: string;
};

export type DBGetChannelsForQueryType = {
  userId: string;
  options?: QueryChannelsRequest;
};

/**
 * A cached channel query: its channels in query order, and the predefined-filter metadata that
 * produced that order. They are written as one cache row, so they are read together.
 */
export type DBGetChannelsForQueryResult = {
  channels: Omit<ChannelStateResponseFields, 'duration'>[];
  /** Set when the query was cached from a predefined-filter query. */
  predefinedFilter?: ParsedPredefinedFilterResponse;
};

export type DBGetLastSyncedAtType = {
  userId: string;
};

export type DBGetPendingTasksType = {
  /** Returns only this message's tasks. */
  messageId?: string;
};

export type DBGetAppSettingsType = {
  userId: string;
};

export type DBGetReactionsType = {
  messageId: string;
  filters?: ReactionFilters;
  sort?: SortParamRequest[];
  limit?: number;
};

export type DBDeletePendingTaskType = {
  id: number;
};

export type DBUpdatePendingTaskType = {
  id: number;
  task: PendingTask;
};

export type DBDeleteReactionType = {
  reaction: ReactionResponse;
  message?: MessageResponse | LocalMessage;
  execute?: boolean;
};

export type DBDeleteMemberType = {
  cid: string;
  member: ChannelMemberResponse;
  execute?: boolean;
};

export type DBDropPendingTasksType = {
  messageId: string;
  execute?: boolean;
};

export type DBDeleteMessageType = {
  id: string;
  /** Delete for the current user only. */
  deleteForMe?: boolean;
  execute?: boolean;
};

export type DBDeleteChannelType = {
  cid: string;
  execute?: boolean;
};

export type DBDeleteMessagesForChannelType = {
  cid: string;
  /** Messages before this timestamp are deleted (unix nanoseconds, as the API sends it). */
  truncated_at?: TimestampNS;
  execute?: boolean;
};

export type DBChannelExistsType = {
  cid: string;
};

export type DBUpsertDraftType = {
  draft: DraftResponse;
  execute?: boolean;
};

export type DBGetDraftType = {
  cid: string;
  userId: string;
  /** The thread's parent message ID, for a thread draft. */
  parent_id?: string;
};

export type DBDeleteDraftType = {
  cid: string;
  /** The thread's parent message ID, for a thread draft. */
  parent_id?: string;
  execute?: boolean;
};

export type ExecuteBatchDBQueriesType = PrepareBatchDBQueries[];

/**
 * The storage contract. A member taking `execute` returns its prepared queries whether or not it
 * already ran them.
 */
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
  ) => Promise<Omit<ChannelStateResponseFields, 'duration'>[] | null>;
  getChannelsForQuery: (
    options: DBGetChannelsForQueryType,
  ) => Promise<DBGetChannelsForQueryResult | null>;
  getAllChannelCids: () => Promise<string[]>;
  getLastSyncedAt: (options: DBGetLastSyncedAtType) => Promise<string | undefined>;
  getAppSettings: (
    options: DBGetAppSettingsType,
  ) => Promise<GetApplicationResponse | null>;
  getReactions: (options: DBGetReactionsType) => Promise<ReactionResponse[] | null>;
  executeSqlBatch: (queries: ExecuteBatchDBQueriesType) => Promise<unknown>;
  addPendingTask: (task: PendingTask) => Promise<() => Promise<void>>;
  getPendingTasks: (conditions?: DBGetPendingTasksType) => Promise<PendingTask[]>;
  deleteDraft: (options: DBDeleteDraftType) => Promise<ExecuteBatchDBQueriesType>;
  updatePendingTask: (
    options: DBUpdatePendingTaskType,
  ) => Promise<ExecuteBatchDBQueriesType>;
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
  updateMessage: 'update-message';
  deleteMessage: 'delete-message';
  deleteReaction: 'delete-reaction';
  sendReaction: 'send-reaction';
  sendMessage: 'send-message';
  createDraft: 'create-draft';
  deleteDraft: 'delete-draft';
};

/**
 * Every operation the offline queue can replay, as the method that performs it. `PendingTask` is
 * derived from it and `QUEUEABLE_OPERATIONS` needs an entry per key, so a new task type does not
 * compile until both exist.
 *
 * Each method only sends the request (a queueing one would re-queue on replay), hence the drafts'
 * `_`-prefixed forms.
 *
 * @internal
 */
export type QueueableOperationSignatures = {
  'create-draft': Channel['_createDraft'];
  'delete-draft': Channel['_deleteDraft'];
  'delete-message': StreamChat['deleteMessage'];
  'delete-reaction': StreamChat['deleteReaction'];
  'send-message': Channel['sendMessage'];
  'send-reaction': StreamChat['sendReaction'];
  'update-message': StreamChat['updateMessage'];
};

export type QueueableType = keyof QueueableOperationSignatures;

/**
 * The argument list of a queueable operation, which a task carries as its `payload`.
 *
 * @internal
 */
export type QueueablePayload<T extends QueueableType> = Parameters<
  QueueableOperationSignatures[T]
>;

/** @internal */
export type QueueableResult<T extends QueueableType> = Awaited<
  ReturnType<QueueableOperationSignatures[T]>
>;

/** A queued request: the operation and the arguments to replay it with. */
export type PendingTask = {
  channelId?: string;
  channelType?: string;
  messageId?: string;
  id?: number;
  threadId?: string;
} & {
  [T in QueueableType]: { payload: QueueablePayload<T>; type: T };
}[QueueableType];

/** @internal */
export type PendingTaskOf<T extends QueueableType> = Extract<PendingTask, { type: T }>;

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
