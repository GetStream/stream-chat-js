import type {
  APIError,
  ChannelResponse,
  Event,
  EventPayload,
  EventType,
  LocalMessage,
  MessageResponse,
  UserResponse,
} from '../types';

import type {
  ExecuteBatchDBQueriesType,
  OfflineDBApi,
  OfflineDBState,
  PendingTask,
  PendingTaskOf,
  PrepareBatchDBQueries,
  QueueableType,
} from './types';
import { OfflineError } from './types';
import { isEphemeral } from '../errors';
import type { StreamChat } from '../client';
import type { AxiosError } from 'axios';
import { OfflineDBSyncManager } from './offline_sync_manager';
import { chatLoggerSystem } from '../logger';
import { StateStore } from '@stream-io/state-store';
import {
  channelHasReadEvents,
  channelTracksReadLocally,
  formatMessage,
  runDetached,
} from '../utils';
import { nowNs } from '../utils/time';
import { isMessageUpdateReplayable } from './util';
import { QUEUEABLE_OPERATIONS, runQueueableOperation } from './queueableOperations';
import type { QueueableOperation } from './queueableOperations';

const logger = chatLoggerSystem.getLogger('offline-db');
import type { WSEvent } from '../gen/models';

/**
 * Base class for an offline DB. A subclass provides the storage by implementing the abstract
 * {@link OfflineDBApi} members; the event handlers, channel guards and pending-task queue are built
 * on them. A handler takes `execute`, which defaults to `true`: with `false` it returns its
 * queries unexecuted, for one `executeSqlBatch`.
 *
 * @abstract
 */
export abstract class AbstractOfflineDB implements OfflineDBApi {
  private client: StreamChat;
  public syncManager: OfflineDBSyncManager;
  public state: StateStore<OfflineDBState>;

  constructor({
    client,
    syncMaxEventCount,
  }: {
    client: StreamChat;
    /** Forwarded to {@link OfflineDBSyncManager.syncMaxEventCount}. */
    syncMaxEventCount?: number;
  }) {
    this.client = client;
    this.syncManager = new OfflineDBSyncManager({
      client,
      offlineDb: this,
      syncMaxEventCount,
    });
    this.state = new StateStore<OfflineDBState>({
      initialized: false,
      userId: this.client.userId,
    });
  }

  /** Writes the reaction, the message carrying it and the associated users. */
  abstract insertReaction: OfflineDBApi['insertReaction'];

  /** Upserts the CIDs for a filter + sort query hash (cids table only). */
  abstract upsertCidsForQuery: OfflineDBApi['upsertCidsForQuery'];

  /**
   * Upserts the channels and their messages, reactions, users, members, polls (for poll messages)
   * and reads, each kind into its own table.
   */
  abstract upsertChannels: OfflineDBApi['upsertChannels'];

  /** Upserts the current user's sync status (sync status table only). */
  abstract upsertUserSyncStatus: OfflineDBApi['upsertUserSyncStatus'];

  /** Upserts the app settings (app settings table only). Meant to run once per app lifecycle. */
  abstract upsertAppSettings: OfflineDBApi['upsertAppSettings'];

  /** Upserts a poll (polls table only). It does not update the poll's message. */
  abstract upsertPoll: OfflineDBApi['upsertPoll'];

  /** Upserts only `channel.data` (channels table only). */
  abstract upsertChannelData: OfflineDBApi['upsertChannelData'];

  /** Upserts the reads and the users they reference. */
  abstract upsertReads: OfflineDBApi['upsertReads'];

  /** Upserts the messages with their reads, polls, reactions and users. */
  abstract upsertMessages: OfflineDBApi['upsertMessages'];

  /** Upserts the members and their users. */
  abstract upsertMembers: OfflineDBApi['upsertMembers'];

  /**
   * Applies a reaction as a `reaction.updated` event would: it assumes `enforce_unique` and
   * replaces the user's other reactions. Also writes the reacting user and the message's reaction
   * groups.
   */
  abstract updateReaction: OfflineDBApi['updateReaction'];

  /** Updates a single message (messages table only) with leaner queries than `upsertMessages`. */
  abstract updateMessage: OfflineDBApi['updateMessage'];

  /** Returns the draft as close to the server's `DraftResponse` as possible. */
  abstract getDraft: OfflineDBApi['getDraft'];

  /** Upserts a draft (drafts table only). */
  abstract upsertDraft: OfflineDBApi['upsertDraft'];

  /** Deletes a draft (drafts table only). */
  abstract deleteDraft: OfflineDBApi['deleteDraft'];

  /**
   * Returns each channel with all its stored data aggregated, as close to the server's
   * `ChannelStateResponseFields` as possible. The implementation does the aggregation.
   */
  abstract getChannels: OfflineDBApi['getChannels'];

  /**
   * The channels last cached for a filters + sort hash, in query order, with the predefined filter
   * that produced them. Channels are aggregated as in `getChannels`.
   */
  abstract getChannelsForQuery: OfflineDBApi['getChannelsForQuery'];

  /** All CIDs in the DB. Much cheaper than fetching all channels. */
  abstract getAllChannelCids: OfflineDBApi['getAllChannelCids'];

  abstract getLastSyncedAt: OfflineDBApi['getLastSyncedAt'];

  /** Pending tasks ordered by creation time, optionally only one message's. */
  abstract getPendingTasks: OfflineDBApi['getPendingTasks'];

  /** The stored app settings. They only refresh when fetched again, so they can be stale. */
  abstract getAppSettings: OfflineDBApi['getAppSettings'];

  abstract getReactions: OfflineDBApi['getReactions'];

  /** Runs the queries in one transaction. */
  abstract executeSqlBatch: OfflineDBApi['executeSqlBatch'];

  /** Adds a pending task. Executing a task of an unsupported type throws. */
  abstract addPendingTask: OfflineDBApi['addPendingTask'];

  abstract updatePendingTask: OfflineDBApi['updatePendingTask'];

  abstract deletePendingTask: OfflineDBApi['deletePendingTask'];

  abstract deleteReaction: OfflineDBApi['deleteReaction'];

  abstract deleteMember: OfflineDBApi['deleteMember'];

  /** Deletes the channel and everything associated with it (messages, reactions, members, ...). */
  abstract deleteChannel: OfflineDBApi['deleteChannel'];

  /** Deletes a channel's messages as `channel.truncated` would, cascading to their reactions. */
  abstract deleteMessagesForChannel: OfflineDBApi['deleteMessagesForChannel'];

  /** Deletes all pending tasks of a message (pending tasks table only). */
  abstract dropPendingTasks: OfflineDBApi['dropPendingTasks'];

  /** Deletes the message and cascades to its reactions, polls, etc. */
  abstract hardDeleteMessage: OfflineDBApi['hardDeleteMessage'];

  /** Sets `deleted_at` on the message (messages table only) instead of removing it. */
  abstract softDeleteMessage: OfflineDBApi['softDeleteMessage'];

  /** Drops all tables and reinitializes the DB connection. */
  abstract resetDB: OfflineDBApi['resetDB'];

  /** Whether the channel is in the DB. Much cheaper than fetching it. */
  abstract channelExists: OfflineDBApi['channelExists'];

  /** Opens the DB connection (for SQLite, typically a file handle). */
  abstract initializeDB: OfflineDBApi['initializeDB'];

  /**
   * Initializes the DB and its sync manager for a user, and updates `state`.
   *
   * @param userId - The user ID for which we want to initialize.
   */
  public init = async (userId: string) => {
    try {
      if (!this.shouldInitialize(userId)) {
        // `initializeDB` has to resolve to a boolean: changing it is a breaking change.
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
      logger
        .withExtraTags('init')
        .error('Failed to initialize the offline database.', { error });
    }
  };

  /**
   * Checks whether the DB is already initialized for a user.
   *
   * @param userId - The user ID for which we want to check initialization.
   * @returns Whether the DB is initialized for `userId`.
   */
  public shouldInitialize(userId: string): boolean {
    const { userId: userIdFromState, initialized } = this.state.getLatestValue();
    return userId === userIdFromState && initialized;
  }

  /**
   * Runs a write query detached, for synchronous callers. A failure is logged, not thrown. No-op
   * until the DB is initialized.
   *
   * @param queryCallback - A callback wrapping all query logic that is to be executed.
   * @param options.method - The method name logged on failure.
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
   * Runs `createQueries` so they cannot fail on the channel's foreign key. When the channel is
   * not in the DB it is upserted first, from the event's channel or else the one in state. If
   * neither exists the queries are dropped.
   *
   * @param options.event - The WS event we are trying to process.
   * @param options.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @param options.forceUpdate - Whether to upsert the channel data even when it is stored.
   *   Defaults to `false`.
   * @param createQueries - Builds the queries. It receives the effective `execute` flag and must run
   *   its queries when that is `true`, because the fast path relies on that write throwing.
   * @returns The prepared queries.
   */
  public queriesWithChannelGuard = async (
    {
      event,
      execute = true,
      forceUpdate = false,
    }: {
      event: Extract<
        Event,
        { channel?: any; cid?: any; channel_type?: any; channel_id?: any }
      >;
      execute?: boolean;
      forceUpdate?: boolean;
    },
    createQueries: (executeOverride?: boolean) => Promise<PrepareBatchDBQueries[]>,
  ) => {
    const channelFromEvent = (event as Extract<WSEvent, { channel?: any }>).channel;
    const cid = (event as Extract<WSEvent, { cid?: any }>).cid || channelFromEvent?.cid;

    if (!cid) {
      return await createQueries(execute);
    }

    // Fast path: write first and probe for the channel only when the write fails (this runs on
    // every live event and the probe is a native round-trip). Safe because the queries are upserts.
    // Not available to `execute: false` (nothing to catch) or `forceUpdate` (always writes it).
    if (execute && !forceUpdate) {
      try {
        return await createQueries(true);
      } catch (error) {
        // A missing channel row is the only failure this guard repairs.
        if (await this.channelExists({ cid })) throw error;
      }
      return await this.queriesBehindChannelGuard({
        createQueries,
        event,
        execute: true,
      });
    }

    if (!forceUpdate && (await this.channelExists({ cid }))) {
      return await createQueries(execute);
    }

    return await this.queriesBehindChannelGuard({ createQueries, event, execute });
  };

  /**
   * Prepends the channel row to `createQueries`' output, sourced from the event or else the
   * in-memory channel. Returns no queries when neither can supply it.
   */
  private queriesBehindChannelGuard = async ({
    createQueries,
    event,
    execute,
  }: {
    createQueries: (executeOverride?: boolean) => Promise<PrepareBatchDBQueries[]>;
    event: Extract<
      Event,
      { channel?: any; cid?: any; channel_type?: any; channel_id?: any }
    >;
    execute: boolean;
  }) => {
    const type = event.type;
    const channelFromEvent = (event as Extract<WSEvent, { channel?: any }>).channel;
    const event_ = event as Extract<WSEvent, { channel_type?: any }>;

    let channelData = channelFromEvent;
    if (!channelData && event_.channel_type && event_.channel_id) {
      // `get`, not `ensure`: `ensure` would store an empty channel when none is loaded.
      const channelFromState = this.client.channelManager.get(
        `${event_.channel_type}:${event_.channel_id}`,
      );
      if (channelFromState?.initialized && !channelFromState.pendingDisposal) {
        channelData = channelFromState.data as unknown as ChannelResponse;
      }
    }

    if (!channelData) {
      logger
        .withExtraTags('queriesWithChannelGuard')
        .warn(
          `Received a "${type}" event for a non-initialized channel that is not in the database. Skipping the event.`,
          { event },
        );
      return [];
    }

    const channelQuery = await this.upsertChannelData({
      channel: channelData,
      execute: false,
    });

    if (!channelQuery) {
      logger
        .withExtraTags('queriesWithChannelGuard')
        .warn(
          `Could not create channel queries on a "${type}" event for an initialized channel that is not in the database. Skipping the event.`,
          { event },
        );
      return [];
    }

    const createdQueries = await createQueries(false);
    const newQueries = [...channelQuery, ...createdQueries];
    if (execute) {
      await this.executeSqlBatch(newQueries);
    }
    return newQueries;
  };

  /**
   * Upserts the message and, when another user sent it, the current user's read (from
   * `channel.state`). The channel guard upserts a missing channel row only with `execute: false`;
   * with `execute: true` (the default) the row is not guarded.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleNewMessage = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<'message.new'>;
    execute?: boolean;
  }) => {
    const client = this.client;
    const { cid, message, user } = event;

    if (!message || (message.parent_id && !message.show_in_channel)) {
      return [];
    }

    return await this.queriesWithChannelGuard(
      { event, execute },
      async (executeOverride) => {
        let queries = await this.upsertMessages({
          execute: false,
          messages: [message],
        });
        if (cid && client.user && client.user.id !== user?.id) {
          const userId = client.user.id;
          const channel = client.channelManager.get(cid);
          // Persists the read state for channels that track reads server-side, and for
          // read-events-disabled channels with a local unread count (their `state.read[userId]`
          // can be absent).
          const tracksReadLocally = channelTracksReadLocally(channel);
          if (channel && (channelHasReadEvents(channel) || tracksReadLocally)) {
            const ownReads = channel.state.read[userId];
            const unreadCount = channel.countUnread();
            const upsertReadsQueries = await this.upsertReads({
              cid,
              execute: false,
              reads: [
                {
                  last_read: ownReads?.last_read ?? 0,
                  last_read_message_id: ownReads?.last_read_message_id,
                  unread_messages: unreadCount,
                  // `client.user` is `ClientUser` (all optional but `id`), so the cast holds only
                  // after connect. `blocked_user_ids` is supplied because the connect payload
                  // omits it when nothing is blocked.
                  user: {
                    ...client.user,
                    blocked_user_ids: client.user.blocked_user_ids ?? [],
                  } as UserResponse,
                },
              ],
            });
            queries = [...queries, ...upsertReadsQueries];
          }
        }
        // Executed here so the guard's write-first path can catch a missing channel row.
        if (executeOverride) {
          await this.executeSqlBatch(queries);
        }
        return queries;
      },
    );
  };

  /**
   * Hard or soft deletes the message, depending on `event.hard_delete`.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleDeleteMessage = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<'message.deleted'>;
    execute?: boolean;
  }) => {
    const { message, deleted_for_me, hard_delete = false } = event;

    if (message) {
      const deleteMethod = hard_delete ? this.hardDeleteMessage : this.softDeleteMessage;
      return await this.queriesWithChannelGuard(
        { event, execute },
        async (executeOverride) =>
          await deleteMethod({
            id: message.id,
            deleteForMe: deleted_for_me,
            execute: executeOverride,
          }),
      );
    }

    return [];
  };

  /**
   * Drops the message's pending tasks and hard deletes it.
   *
   * @param payload.messageId - The ID of the message we want to remove.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
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
   * Hard deletes the messages in one transaction.
   *
   * @param payload.ids - The IDs of the messages to hard delete.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public hardDeleteMessages = async ({
    ids,
    execute = true,
  }: {
    ids: string[];
    execute?: boolean;
  }) => {
    if (!ids.length) return [];
    const queries = (
      await Promise.all(ids.map((id) => this.hardDeleteMessage({ id, execute: false })))
    ).flat();

    if (execute) {
      await this.executeSqlBatch(queries);
    }

    return queries;
  };

  /**
   * Upserts a message and writes its channel row when that row is missing (the first optimistic
   * write in a new channel can precede the channel's persistence). Upserts because an UPDATE no-ops
   * on a missing row. When the row is missing and the channel is not loaded in memory, or the
   * message has no `cid`, nothing is written.
   *
   * @param payload.message - The message to persist. Its `cid` decides the guarded channel row.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public upsertMessageWithChannelGuard = async ({
    message,
    execute = true,
  }: {
    message: LocalMessage;
    execute?: boolean;
  }): Promise<ExecuteBatchDBQueriesType> => {
    const { cid } = message;
    if (!cid) return [];

    const messages = [message] as unknown as MessageResponse[];

    // Write first and probe for the channel only on failure, as in `queriesWithChannelGuard`.
    if (execute) {
      try {
        return await this.upsertMessages({ messages, execute: true });
      } catch (error) {
        if (await this.channelExists({ cid })) throw error;
      }
      return await this.upsertMessageBehindChannelGuard({ cid, messages, execute: true });
    }

    if (await this.channelExists({ cid })) {
      return await this.upsertMessages({ messages, execute: false });
    }

    return await this.upsertMessageBehindChannelGuard({ cid, messages, execute });
  };

  /** Writes the channel row ahead of the messages. Skips the write when no row can be built. */
  private upsertMessageBehindChannelGuard = async ({
    cid,
    execute,
    messages,
  }: {
    cid: string;
    execute: boolean;
    messages: MessageResponse[];
  }): Promise<ExecuteBatchDBQueriesType> => {
    const channel = this.client.channelManager.get(cid);
    if (!channel?.initialized || channel.pendingDisposal) {
      logger
        .withExtraTags('upsertMessageWithChannelGuard', cid)
        .warn('Skipping message persistence: the channel is not in the database.');
      return [];
    }

    const queries: ExecuteBatchDBQueriesType = [
      ...(await this.upsertChannelData({
        channel: channel.data as ChannelResponse,
        execute: false,
      })),
      ...(await this.upsertMessages({ messages, execute: false })),
    ];

    if (execute) {
      await this.executeSqlBatch(queries);
    }

    return queries;
  };

  /**
   * The channel's persisted messages with a local `failed` status, which `Channel.reload`
   * re-ingests. Built on {@link getChannels}, so a custom offline DB implements nothing extra.
   *
   * @param payload.cid - The channel whose failed messages to read.
   * @returns The failed messages, formatted.
   */
  public getFailedMessages = async ({
    cid,
  }: {
    cid: string;
  }): Promise<LocalMessage[]> => {
    const { initialized, userId } = this.state.getLatestValue();
    if (!initialized || !userId) return [];

    const channels = await this.getChannels({ cids: [cid], userId });
    const messages = channels?.[0]?.messages ?? [];

    return messages
      .map((message) => formatMessage(message))
      .filter((message) => message.status === 'failed');
  };

  /**
   * Upserts the reads of a read event.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.unreadMessages - An override of `event.unread_messages`.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleRead = async ({
    event,
    unreadMessages,
    execute = true,
  }: {
    event: EventPayload<
      | 'message.read'
      | 'message.read_locally'
      | 'notification.mark_read'
      | 'notification.mark_unread'
    >;
    unreadMessages?: number;
    execute?: boolean;
  }) => {
    const {
      last_read_message_id,
      // @ts-expect-error property missing
      unread_messages = 0,
      user,
      cid,
    } = event;
    // Mirrors what `Channel` writes into `state.read`: mark-unread uses the server's
    // `last_read_at`, other read events its `created_at`. `received_at` is the local clock, so only
    // a fallback.
    const last_read =
      (event.type === 'notification.mark_unread' ? event.last_read_at : undefined) ??
      event.created_at ??
      event.received_at ??
      nowNs();

    const overriddenUnreadMessages = unreadMessages ?? unread_messages;

    if (user?.id && cid) {
      return await this.queriesWithChannelGuard({ event, execute }, (executeOverride) =>
        this.upsertReads({
          cid,
          execute: executeOverride,
          reads: [
            {
              last_read,
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
   * Removes or upserts the member, forcing a channel upsert so `member_count` updates.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleMemberEvent = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<`member.${string}`>;
    execute?: boolean;
  }) => {
    const { member, cid, type } = event;

    if (member && cid) {
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
   * Updates the message behind the channel guard. Thread replies are ignored.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleMessageUpdatedEvent = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<'message.updated' | 'message.undeleted'>;
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
   * Sets `hidden` from the event type, as the event's channel does not carry it.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleChannelVisibilityEvent = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<'channel.visible' | 'channel.hidden'>;
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
   * Deletes the channel's messages (before `truncated_at` when set) and upserts the reads.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleChannelTruncatedEvent = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<'channel.truncated'>;
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

      let finalQueries = [...truncateQueries];

      // Same condition as in `handleNewMessage`.
      const userId = ownUser.id;
      const activeChannel = this.client.channelManager.get(cid);
      const tracksReadLocally = channelTracksReadLocally(activeChannel);
      if (activeChannel && (channelHasReadEvents(activeChannel) || tracksReadLocally)) {
        const ownReads = activeChannel.state.read[userId];

        let unreadCount = 0;
        if (truncated_at != null) {
          unreadCount = activeChannel.countUnread(truncated_at);
        }

        const upsertReadQueries = await this.upsertReads({
          cid,
          execute: false,
          reads: [
            {
              last_read: ownReads?.last_read ?? 0,
              last_read_message_id: ownReads?.last_read_message_id,
              unread_messages: unreadCount,
              user: {
                ...ownUser,
                blocked_user_ids: ownUser.blocked_user_ids ?? [],
              } as UserResponse,
            },
          ],
        });
        finalQueries = [...finalQueries, ...upsertReadQueries];
      }

      if (execute) {
        await this.executeSqlBatch(finalQueries);
      }

      return finalQueries;
    }

    return [];
  };

  /**
   * Maps `reaction.new`, `.updated` and `.deleted` to the matching reaction write.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleReactionEvent = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<`reaction.${string}`>;
    execute?: boolean;
  }) => {
    const { type, message, reaction } = event;

    if (!(message && reaction)) {
      return [];
    }

    const getReactionMethod = (type: EventType) => {
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
   * Maps `draft.updated` and `draft.deleted` to `upsertDraft` and `deleteDraft`.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  handleDraftEvent = async ({
    event,
    execute = true,
  }: {
    event: EventPayload<`draft.${string}`>;
    execute?: boolean;
  }) => {
    const { cid, draft, type } = event;

    if (!draft) return [];

    if (type === 'draft.updated') {
      return await this.upsertDraft({
        draft,
        execute,
      });
    }

    if (type === 'draft.deleted') {
      if (!cid) return [];

      return await this.deleteDraft({
        cid,
        parent_id: draft.parent_id,
        execute,
      });
    }

    return [];
  };

  /**
   * Routes an event to its handler by type. Used for WS events and for sync events.
   *
   * @param payload.event - The WS event we are trying to process.
   * @param payload.execute - Whether to immediately execute the queries. Defaults to `true`.
   * @returns The prepared queries.
   */
  public handleEvent = async ({
    event,
    execute = true,
  }: {
    event: Event;
    execute?: boolean;
  }) => {
    const { type } = event;

    if (type.startsWith('reaction')) {
      return await this.handleReactionEvent({
        event: event as EventPayload<`reaction.${string}`>,
        execute,
      });
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
      // The DB stores channel reads only, so thread read events are skipped.
      if (event.thread) return [];
      return this.handleRead({ event, unreadMessages: 0, execute });
    }

    // The client-only reset from `Channel.markReadLocally()`: persisted only for channels with a
    // local unread count, never for channels that track reads server-side.
    if (type === 'message.read_locally') {
      const localChannel = event.cid
        ? this.client.channelManager.get(event.cid)
        : undefined;
      if (channelTracksReadLocally(localChannel)) {
        return this.handleRead({ event, unreadMessages: 0, execute });
      }
      return [];
    }

    if (type === 'notification.mark_unread') {
      return this.handleRead({ event, execute });
    }

    if (type.startsWith('member.')) {
      return await this.handleMemberEvent({
        event: event as EventPayload<`member.${string}`>,
        execute,
      });
    }

    if (type === 'channel.hidden' || type === 'channel.visible') {
      return await this.handleChannelVisibilityEvent({ event, execute });
    }

    if (type === 'draft.updated' || type === 'draft.deleted') {
      return await this.handleDraftEvent({ event, execute });
    }

    // `notification.message_new` only upserts the channel data: its messages are stored when the
    // channel is watched or queried.
    if (
      (type === 'channel.updated' ||
        type === 'notification.message_new' ||
        type === 'notification.added_to_channel') &&
      event.channel
    ) {
      return await this.upsertChannelData({ channel: event.channel, execute });
    }

    if (
      (type === 'channel.deleted' ||
        type === 'notification.channel_deleted' ||
        type === 'notification.removed_from_channel') &&
      event.channel
    ) {
      return await this.deleteChannel({ cid: event.channel.cid, execute });
    }

    if (type === 'channel.truncated') {
      return await this.handleChannelTruncatedEvent({ event, execute });
    }

    return [];
  };

  /**
   * Executes the task now. On an {@link isEphemeral} failure the task goes to
   * `handleAddPendingTask`, and the error is rethrown. With an unhealthy socket it fails with an
   * `OfflineError` without executing.
   *
   * The payload carries the request options, including an `AbortSignal`. It is live while the task
   * runs now, but a replay from the table gets an inert `{}` when the store serializes the payload
   * (always across a restart), and `ApiClient` then runs the request uncancellable.
   *
   * @param payload.task - The pending task we want to execute.
   * @returns The response of the task's request.
   */
  public queueTask = async <T>({ task }: { task: PendingTask }): Promise<T> => {
    const attemptTaskExecution = async () => {
      if (!this.client.wsConnection?.isHealthy) {
        throw new OfflineError(
          'Cannot execute task because the connection has been lost.',
          { type: 'connection:lost' },
        );
      }
      return (await this.executeTask({ task })) as T;
    };
    try {
      return await attemptTaskExecution();
    } catch (e) {
      if (!this.shouldSkipQueueingTask(e as AxiosError<APIError>)) {
        await this.handleAddPendingTask({ task });
      }
      throw e;
    }
  };

  /** A definitive rejection (non-retryable server error or a cancelled request) is not queued. */
  private shouldSkipQueueingTask = (error: AxiosError<APIError>) => !isEphemeral(error);

  private isPendingSendMessageTask = (
    task: PendingTask,
  ): task is Extract<PendingTask, { type: 'send-message' }> =>
    task.type === 'send-message';

  /**
   * Folds an edit of a never-sent message into its queued `send-message` task, so a replay sends
   * the edited text once. The send task keeps its row and so its place in the queue. With no send
   * task the edit is queued on its own if `isMessageUpdateReplayable` allows it.
   *
   * A queued send is the only reliable sign the server never saw the message (a `failed` status can
   * also come from a rejected edit). The payloads are already `MessageRequest`s, so they merge by
   * plain spread: normalizing again would turn a flattened `mentioned_users` into `[undefined]`.
   */
  private handleUpdateMessagePendingTask = async (
    task: Extract<PendingTask, { type: 'update-message' }>,
  ) => {
    const [{ id }, { message }] = task.payload;
    const pendingTasks = await this.getPendingTasks({ messageId: id });
    const sendTask = pendingTasks.find(this.isPendingSendMessageTask);

    // No queued send, or one without an ID to rewrite (a task read from the DB always has one).
    if (sendTask?.id === undefined) {
      if (!isMessageUpdateReplayable(message)) return;

      await this.addPendingTask(task);
      return;
    }

    const [sendRequest, ...sendRequestOptions] = sendTask.payload;

    await this.updatePendingTask({
      id: sendTask.id,
      task: {
        ...sendTask,
        payload: [
          { ...sendRequest, message: { ...sendRequest.message, ...message } },
          ...sendRequestOptions,
        ],
      },
    });
  };

  /**
   * Stores the task. An edit of a never-sent message is folded into its queued send instead. With no
   * queued send, an edit `isMessageUpdateReplayable` refuses (attachments still on local URLs) is
   * dropped.
   *
   * @param payload.task - The pending task to store.
   */
  public handleAddPendingTask = async ({ task }: { task: PendingTask }) => {
    if (task.type === 'update-message') {
      await this.handleUpdateMessagePendingTask(task);
      return;
    }

    await this.addPendingTask(task);
  };

  /**
   * Runs the task through {@link QUEUEABLE_OPERATIONS}. With `isPendingTask` (a replay) it also
   * runs the operation's `onReplay`.
   */
  private executeTask = async <T extends QueueableType>(
    { task }: { task: PendingTaskOf<T> },
    isPendingTask = false,
  ) => {
    const result = await runQueueableOperation({ client: this.client, task });

    if (isPendingTask) {
      const operation = QUEUEABLE_OPERATIONS[task.type] as QueueableOperation<T>;
      operation.onReplay?.({ client: this.client, result, task });
    }

    return result;
  };

  /**
   * Replays the pending tasks in order and deletes each one that succeeded or was definitively
   * rejected. A task that failed for an ephemeral reason stays for the next run.
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
        const error = e as AxiosError<APIError>;
        if (!this.shouldSkipQueueingTask(error)) {
          continue;
        }
      }

      await this.deletePendingTask({
        id: task.id,
      });
    }
  };
}
