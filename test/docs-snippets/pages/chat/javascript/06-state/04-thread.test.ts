import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, LocalMessage, StreamChat, Thread } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/04-thread.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('thread');
  let client: StreamChat;
  let channel: Channel;
  let parentMessage: LocalMessage;
  let openedThread: Thread;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId, { members: [{ user_id: userId }] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
    const { message: parent } = await channel.sendMessage({
      message: { text: 'parent' },
    });
    await channel.sendMessage({ message: { text: 'reply', parent_id: parent.id } });
    await retry(() => {
      expect(channel.messagePaginator.getItem(parent.id)).toBeDefined();
      return Promise.resolve();
    });
    parentMessage = channel.messagePaginator.getItem(parent.id) as LocalMessage;
  });

  afterAll(async () => {
    client.threads.unregisterSubscriptions();
    await disconnectClients(client);
    await cleanup.run();
  });

  it('opens a thread', async () => {
    // #region snippet docs="chat/javascript/06-state/04-thread.md" heading="Initialization" tab="JavaScript" index=1
    client.threads.registerSubscriptions();

    const thread = client.threads.ensure({ channel, parentMessage });

    thread.activate();
    // #endregion snippet

    openedThread = thread;
    await retry(() => {
      expect(thread.messagePaginator.items?.map((reply) => reply.text)).toEqual([
        'reply',
      ]);
      return Promise.resolve();
    });
  });

  it('queries threads', async () => {
    const parentMessageId = parentMessage.id;

    // #region snippet docs="chat/javascript/06-state/04-thread.md" heading="Initialization" tab="JavaScript" index=2
    // One thread, by its parent message id
    const queriedThread = await client.getThreadAndHydrate(
      { message_id: parentMessageId },
      { watch: true },
    );

    // Several threads
    const { threads } = await client.queryThreadsAndHydrate({
      watch: true,
      limit: 10,
    });
    // #endregion snippet

    // Both resolve to the thread already opened: one instance per thread
    expect(queriedThread).toBe(openedThread);
    expect(threads).toEqual([openedThread]);
    expect(threads[0]).toBe(openedThread);
    expect(queriedThread.state.getLatestValue().replyCount).toBe(1);
  });

  it('reads thread state', () => {
    const thread = openedThread;

    // #region snippet docs="chat/javascript/06-state/04-thread.md" heading="Reading" tab="JavaScript" index=1
    // Parent message, participants, reply count
    const {
      parentMessage: parent,
      participants,
      replyCount,
    } = thread.state.getLatestValue();

    // Replies: the same API as channel messages
    const { items: replies, hasMoreTail } =
      thread.messagePaginator.state.getLatestValue();
    // #endregion snippet

    expect(parent.id).toBe(parentMessage.id);
    expect(participants?.map((participant) => participant.user_id)).toEqual([userId]);
    expect(replyCount).toBe(1);
    expect(replies).toHaveLength(1);
    // Only known once older replies were requested
    expect(typeof hasMoreTail).toBe('boolean');
  });

  it('subscribes to replies', async () => {
    const thread = openedThread;
    const renderReplies = vi.fn();

    // #region snippet docs="chat/javascript/06-state/04-thread.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = thread.messagePaginator.state.subscribeWithSelector(
      ({ items }) => ({ items }),
      ({ items }) => renderReplies(items),
    );
    // #endregion snippet

    try {
      const { message } = await channel.sendMessage({
        message: { text: 'another reply', parent_id: thread.id },
      });
      await retry(() => {
        expect(renderReplies).toHaveBeenLastCalledWith(
          expect.arrayContaining([expect.objectContaining({ id: message.id })]),
        );
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
    }
  });

  it('refreshes active threads after a reconnect', async () => {
    // A fresh thread: the one opened above stays active
    const { message: parent } = await channel.sendMessage({
      message: { text: 'active parent' },
    });
    await channel.sendMessage({
      message: { text: 'active reply', parent_id: parent.id },
    });
    await retry(() => {
      expect(channel.messagePaginator.getItem(parent.id)?.reply_count).toBe(1);
      return Promise.resolve();
    });
    const thread = client.threads.ensure({
      channel,
      parentMessage: channel.messagePaginator.getItem(parent.id) as LocalMessage,
    });

    // #region snippet docs="chat/javascript/06-state/04-thread.md" heading="Active thread" tab="JavaScript" index=1
    // While the thread is on screen
    const release = thread.activate();

    // When the thread leaves the screen
    release();
    // #endregion snippet

    expect(thread.state.getLatestValue().active).toBe(false);

    const reloadSpy = vi.spyOn(thread, 'reload');
    const reconnect = async () => {
      const recovered = new Promise<void>((resolve) => {
        const { unsubscribe } = client.on('connection.recovered', () => {
          unsubscribe();
          resolve();
        });
      });
      await client.closeConnection();
      await client.openConnection();
      await recovered;
    };
    try {
      // An inactive thread isn't reloaded after a reconnect...
      await reconnect();
      expect(reloadSpy).not.toHaveBeenCalled();

      // ...but the next time it's activated
      const releaseStale = thread.activate();
      await retry(() => {
        expect(reloadSpy).toHaveBeenCalledTimes(1);
        return Promise.resolve();
      });

      // An active thread is reloaded after a reconnect
      await reconnect();
      releaseStale();
      expect(reloadSpy).toHaveBeenCalledTimes(2);
    } finally {
      reloadSpy.mockRestore();
    }
  });
});
