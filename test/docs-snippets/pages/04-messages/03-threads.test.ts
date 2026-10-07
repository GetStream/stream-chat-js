import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../src';
import type { Channel } from '../../../../src';
import {
  createUserToken,
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { sendServerMessage } from '../../helpers/server';
import { retry } from '../../helpers/wait';

describe('_default/04-messages/03-threads.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherId = uniqueId('other');
  const channelId = uniqueId('general');
  const cid = `messaging:${channelId}`;
  let client: StreamChat;
  let channel: Channel;
  let parentMessageId: string;
  /** Replies by `otherId` in the `parentMessageId` thread, oldest first. */
  const replyIds: string[] = [];
  /** Threads `userId` takes part in, including `parentMessageId`. */
  const threadIds: string[] = [];
  /**
   * Threads created by `userId`, oldest first. A thread's `created_by_user_id` is the
   * author of its first reply, so the `parentMessageId` thread (first replied to by
   * `otherId`) isn't one of them.
   */
  const ownThreadIds: string[] = [];

  const threadUnreadCount = async (id: string) => {
    const { threads } = await client.getUnreadCount();
    return threads.find((thread) => thread.parent_message_id === id)?.unread_count ?? 0;
  };

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: otherId }]);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId, { members: [userId, otherId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();

    const { message } = await channel.sendMessage({ text: 'Parent message' });
    parentMessageId = message.id;
    threadIds.push(parentMessageId);

    for (let i = 1; i <= 5; i++) {
      const reply = await sendServerMessage(serverClient, cid, {
        text: `Reply ${i}`,
        user_id: otherId,
        parent_id: parentMessageId,
      });
      replyIds.push(reply.id);
    }

    // More threads started by `userId`, so thread queries have a second page.
    for (let i = 1; i <= 11; i++) {
      const parent = await sendServerMessage(serverClient, cid, {
        text: `Parent ${i}`,
        user_id: userId,
      });
      await sendServerMessage(serverClient, cid, {
        text: `Thread reply ${i}`,
        user_id: userId,
        parent_id: parent.id,
      });
      threadIds.push(parent.id);
      ownThreadIds.push(parent.id);
    }
  });

  afterAll(async () => {
    client.threads.unregisterSubscriptions();
    await disconnectClients(client);
    await cleanup.run();
  });

  it('starts a thread', async () => {
    // #region snippet docs="_default/04-messages/03-threads.md" heading="Starting a Thread" tab="JavaScript" index=1
    const reply = await channel.sendMessage({
      text: 'This is a reply in a thread',
      parent_id: parentMessageId,
      show_in_channel: false,
    });
    // #endregion snippet

    expect(reply.message.parent_id).toBe(parentMessageId);
    expect(reply.message.show_in_channel).toBeFalsy();
  });

  it('paginates thread replies', async () => {
    const olderReplyId = replyIds[2];

    // #region snippet docs="_default/04-messages/03-threads.md" heading="Paginating Thread Replies" tab="JavaScript" index=1
    // COPY: olderReplyId="42"
    // Get the latest 20 replies
    const replies = await channel.getReplies(parentMessageId, { limit: 20 });

    // Get older replies (before message with ID "42")
    const olderReplies = await channel.getReplies(parentMessageId, {
      limit: 20,
      id_lte: olderReplyId,
    });

    // Get oldest replies first
    const oldestFirst = await channel.getReplies(parentMessageId, { limit: 20 }, [
      { created_at: 1 },
    ]);
    // #endregion snippet

    const replyMessageIds = replies.messages.map((m) => m.id);
    expect(replyMessageIds).toEqual(expect.arrayContaining(replyIds));
    expect(olderReplies.messages.map((m) => m.id)).toEqual(replyIds.slice(0, 3));
    expect(oldestFirst.messages[0].id).toBe(replyIds[0]);
  });

  it('sends an inline reply', async () => {
    const originalMessageId = parentMessageId;

    // #region snippet docs="_default/04-messages/03-threads.md" heading="Inline Replies" tab="JavaScript" index=1
    const message = await channel.sendMessage({
      text: 'I agree with this point',
      quoted_message_id: originalMessageId,
    });
    // #endregion snippet

    expect(message.message.quoted_message_id).toBe(originalMessageId);
    expect(message.message.quoted_message?.id).toBe(originalMessageId);
  });

  it('queries threads', async () => {
    // #region snippet docs="_default/04-messages/03-threads.md" heading="Querying Threads" tab="JavaScript" index=1
    const { threads } = await client.queryThreads();

    for (const thread of threads) {
      const state = thread.state.getLatestValue();
      console.log(state.parentMessage.text);
      console.log(state.replies);
      console.log(state.participants);
      console.log(state.read);
    }
    // #endregion snippet

    expect(threads.length).toBeGreaterThan(0);
    expect(threads.every((thread) => threadIds.includes(thread.id))).toBe(true);
  });

  it('filters, sorts and paginates threads', async () => {
    const createdByUserId = userId;

    // #region snippet docs="_default/04-messages/03-threads.md" heading="Supported Sort Fields" tab="JavaScript" index=1
    // COPY: createdByUserId="user-1"
    // Get threads created by a specific user, sorted by creation date
    const { threads, next } = await client.queryThreads({
      filter: {
        created_by_user_id: { $eq: createdByUserId },
        updated_at: { $gte: '2024-01-01T00:00:00Z' },
      },
      sort: [{ created_at: -1 }],
      limit: 10,
    });

    // Get next page
    const { threads: page2 } = await client.queryThreads({
      filter: {
        created_by_user_id: { $eq: createdByUserId },
        updated_at: { $gte: '2024-01-01T00:00:00Z' },
      },
      sort: [{ created_at: -1 }],
      limit: 10,
      next,
    });
    // #endregion snippet

    expect(threads).toHaveLength(10);
    expect(next).toBeTruthy();
    expect([...threads, ...page2].map((thread) => thread.id)).toEqual(
      [...ownThreadIds].reverse(),
    );
  });

  it('gets a thread by id', async () => {
    // #region snippet docs="_default/04-messages/03-threads.md" heading="Getting a Thread by ID" tab="JavaScript" index=1
    const thread = await client.getThread(parentMessageId, {
      watch: true,
      reply_limit: 10,
      participant_limit: 25,
    });
    // #endregion snippet

    expect(thread.id).toBe(parentMessageId);
    const { replies, participants } = thread.state.getLatestValue();
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.length).toBeLessThanOrEqual(10);
    expect(participants?.map((p) => p.user_id)).toEqual(
      expect.arrayContaining([userId, otherId]),
    );
  });

  it('updates the thread title and custom data', async () => {
    const threadId = parentMessageId;

    // #region snippet docs="_default/04-messages/03-threads.md" heading="Updating Thread Title and Custom Data" tab="JavaScript" index=1
    // Set properties
    const { thread } = await client.partialUpdateThread(threadId, {
      set: {
        title: 'Project Discussion',
        priority: 'high',
      },
    });

    // Remove properties
    await client.partialUpdateThread(threadId, {
      unset: ['priority'],
    });
    // #endregion snippet

    expect(thread.title).toBe('Project Discussion');
    expect(thread).toMatchObject({ priority: 'high' });
    const updated = (
      await client.getThread(threadId, { watch: false })
    ).state.getLatestValue();
    expect(updated.title).toBe('Project Discussion');
    expect(updated.custom).not.toHaveProperty('priority');
  });

  it('reads the total unread thread count after connecting', async () => {
    // `otherId` takes part in the `parentMessageId` thread; a new reply makes it unread for them.
    await sendServerMessage(serverClient, cid, {
      text: 'Unread for other',
      user_id: userId,
      parent_id: parentMessageId,
    });
    const readerId = otherId;
    const token = createUserToken(readerId);
    const client = new StreamChat(process.env.STREAM_API_KEY as string, {
      allowServerSideConnect: true,
    });

    try {
      // #region snippet docs="_default/04-messages/03-threads.md" heading="Total Unread Threads" tab="JavaScript" index=1
      // COPY: readerId="user-id"
      const response = await client.connectUser({ id: readerId }, token);
      console.log(response?.me?.unread_threads);

      // Or access via thread manager
      client.threads.registerSubscriptions();
      const { unreadThreadCount } = client.threads.state.getLatestValue();
      // #endregion snippet

      expect(response?.me?.unread_threads).toBeGreaterThan(0);
      expect(unreadThreadCount).toBe(response?.me?.unread_threads);
    } finally {
      client.threads.unregisterSubscriptions();
      await client.disconnectUser();
    }
  });

  it('marks a thread as read and unread', async () => {
    await sendServerMessage(serverClient, cid, {
      text: 'Another reply',
      user_id: otherId,
      parent_id: parentMessageId,
    });
    await retry(async () =>
      expect(await threadUnreadCount(parentMessageId)).toBeGreaterThan(0),
    );
    // Check the read state right after `markRead`, before the region goes on to `markUnread`.
    const markRead = channel.markRead.bind(channel);
    let unreadAfterMarkRead: number | undefined;
    const markReadSpy = vi.spyOn(channel, 'markRead').mockImplementation(async (data) => {
      const result = await markRead(data);
      unreadAfterMarkRead = await threadUnreadCount(parentMessageId);
      return result;
    });
    const markUnreadSpy = vi.spyOn(channel, 'markUnread');

    // #region snippet docs="_default/04-messages/03-threads.md" heading="Marking Threads as Read or Unread" tab="JavaScript" index=1
    // Mark thread as read
    await channel.markRead({ thread_id: parentMessageId });

    // Mark thread as unread
    await channel.markUnread({ thread_id: parentMessageId });
    // #endregion snippet

    const [readResult] = await Promise.all(markReadSpy.mock.results.map((r) => r.value));
    const [unreadResult] = await Promise.all(
      markUnreadSpy.mock.results.map((r) => r.value),
    );
    expect(readResult).not.toBeNull();
    expect(unreadResult).not.toBeNull();
    expect(unreadAfterMarkRead).toBe(0);
    await retry(async () =>
      expect(await threadUnreadCount(parentMessageId)).toBeGreaterThan(0),
    );
  });

  it('gets the unread count per thread', async () => {
    // #region snippet docs="_default/04-messages/03-threads.md" heading="Unread Count Per Thread" tab="JavaScript" index=1
    const response = await client.getUnreadCount();

    console.log(response.total_unread_threads_count);

    for (const thread of response.threads) {
      console.log(thread.parent_message_id);
      console.log(thread.unread_count);
      console.log(thread.last_read);
    }
    // #endregion snippet

    expect(response.total_unread_threads_count).toBeGreaterThan(0);
    expect(response.threads.map((t) => t.parent_message_id)).toContain(parentMessageId);
  });

  it('uses the thread manager', async () => {
    // #region snippet docs="_default/04-messages/03-threads.md" heading="Thread Manager" tab="JavaScript" index=1
    // Access the client's thread manager
    const threadManager = client.threads;

    // Subscribe to state updates
    const unsubscribe = threadManager.state.subscribe((state) => {
      console.log(state.threads);
      console.log(state.unreadThreadCount);
    });

    // Load threads
    await threadManager.reload();

    // Load more threads
    await threadManager.loadNextPage();

    // Access current state
    const { threads } = threadManager.state.getLatestValue();
    // #endregion snippet

    unsubscribe();
    expect(threads.map((thread) => thread.id).sort()).toEqual([...threadIds].sort());
  });

  it('handles events for a single thread', async () => {
    // #region snippet docs="_default/04-messages/03-threads.md" heading="Event Handling" tab="JavaScript" index=1
    const { threads } = await client.queryThreads({ watch: true, limit: 10 });
    const [thread] = threads;

    // Register event handlers for a single thread
    thread.registerSubscriptions();

    const unsubscribe = thread.state.subscribe((state) => {
      console.log(state.replies);
    });
    // #endregion snippet

    try {
      const reply = await sendServerMessage(serverClient, cid, {
        text: 'Live reply',
        user_id: otherId,
        parent_id: thread.id,
      });
      await retry(() => {
        expect(thread.state.getLatestValue().replies.map((r) => r.id)).toContain(
          reply.id,
        );
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
      thread.unregisterSubscriptions();
    }
  });

  it('registers thread manager subscriptions', async () => {
    // A fresh client, so the manager hasn't loaded any threads yet.
    const client = await getClientSideClient({ id: userId });

    try {
      // #region snippet docs="_default/04-messages/03-threads.md" heading="Event Handling" tab="JavaScript" index=2
      const threadManager = client.threads;
      threadManager.registerSubscriptions();

      await threadManager.reload();

      // All threads are now listening to channel events
      const { threads } = threadManager.state.getLatestValue();
      // #endregion snippet

      expect(threads.map((thread) => thread.id)).toContain(parentMessageId);
      const thread = threadManager.threadsById[parentMessageId];
      const reply = await sendServerMessage(serverClient, cid, {
        text: 'Managed reply',
        user_id: otherId,
        parent_id: parentMessageId,
      });
      await retry(() => {
        expect(thread?.state.getLatestValue().replies.map((r) => r.id)).toContain(
          reply.id,
        );
        return Promise.resolve();
      });
    } finally {
      client.threads.unregisterSubscriptions();
      await disconnectClients(client);
    }
  });
});
