import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { sendServerMessage } from '../../../../helpers/server';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/02-messages.md';
// One more than the first page `watch()` loads (100)
const MESSAGE_COUNT = 110;

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('messages');
  const cid = `messaging:${channelId}`;
  const messageIds: string[] = [];
  let client: StreamChat;
  let watchedChannel: Channel;

  /** The id of the newest loaded message. */
  const newestId = (channel: Channel) =>
    [...(channel.messagePaginator.items ?? [])].sort(
      (a, b) => b.created_at - a.created_at,
    )[0]?.id;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    await serverClient.chat
      .channel('messaging', channelId)
      .getOrCreate({ data: { created_by_id: userId, members: [{ user_id: userId }] } });
    cleanup.channels.push(cid);
    // In parallel batches, so the order within a batch is not fixed
    for (let batch = 0; batch < MESSAGE_COUNT / 10; batch++) {
      const messages = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          sendServerMessage(serverClient, cid, {
            text: `message ${batch * 10 + i}`,
            user_id: userId,
          }),
        ),
      );
      messageIds.push(...messages.map((message) => message.id));
    }
    const { message: pinned } = await serverClient.chat.updateMessagePartial({
      id: messageIds[0],
      set: { pinned: true },
      user_id: userId,
    });
    expect(pinned?.pinned).toBe(true);
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('loads messages', async () => {
    const channel = client.channel('messaging', channelId);
    await channel.watch();

    watchedChannel = channel;
    // `watch()` loads the first page (100 messages)
    expect(channel.messagePaginator.items).toHaveLength(100);
    expect(channel.messagePaginator.state.getLatestValue().hasMoreTail).toBe(true);
  });

  it('loads older messages', async () => {
    const channel = watchedChannel;

    // #region snippet docs="chat/javascript/06-state/02-messages.md" heading="Loading older messages" tab="JavaScript" index=1
    const { hasMoreTail } = channel.messagePaginator.state.getLatestValue();

    if (hasMoreTail) {
      await channel.messagePaginator.toTail();
    }
    // #endregion snippet

    expect(hasMoreTail).toBe(true);
    // `toTail()` loaded the rest
    expect(channel.messagePaginator.items).toHaveLength(MESSAGE_COUNT);
    expect(channel.messagePaginator.state.getLatestValue().hasMoreTail).toBe(false);
  });

  it('reads messages', () => {
    const channel = watchedChannel;
    const messageId = messageIds[5];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="chat/javascript/06-state/02-messages.md" heading="Reading" tab="JavaScript" index=1
      // Messages on screen, loading and pagination flags
      const { items, isLoading, hasMoreTail } =
        channel.messagePaginator.state.getLatestValue();

      // Latest message of the channel
      const lastMessage = channel.messagePaginator.lastMessage;

      // Any loaded message by id
      const message = client.messageStore.get(messageId);

      // Did it send? "sending", "received" or "failed"
      console.log(message?.status);

      // Pinned messages
      const { items: pinnedMessages } =
        channel.pinnedMessagesPaginator.state.getLatestValue();
      // #endregion snippet

      expect(items).toHaveLength(MESSAGE_COUNT);
      expect(isLoading).toBe(false);
      expect(hasMoreTail).toBe(false);
      expect(lastMessage?.id).toBe(newestId(channel));
      expect(message?.id).toBe(messageId);
      expect(logSpy).toHaveBeenCalledWith('received');
      expect(pinnedMessages?.map((pinned) => pinned.id)).toEqual([messageIds[0]]);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('subscribes to messages', async () => {
    const channel = watchedChannel;
    const renderMessages = vi.fn();
    const renderPreview = vi.fn();

    // #region snippet docs="chat/javascript/06-state/02-messages.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = channel.messagePaginator.state.subscribeWithSelector(
      (state) => ({ items: state.items }),
      ({ items }) => renderMessages(items),
    );

    // The latest message is reactive through `aggregateState`
    const unsubscribeLastMessage =
      channel.messagePaginator.aggregateState.subscribeWithSelector(
        (state) => ({ lastMessage: state.lastMessage }),
        ({ lastMessage }) => renderPreview(lastMessage),
      );
    // #endregion snippet

    try {
      expect(renderPreview).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: newestId(channel) }),
      );
      const { message } = await channel.sendMessage({ message: { text: 'newest' } });
      await retry(() => {
        expect(renderPreview).toHaveBeenLastCalledWith(
          expect.objectContaining({ id: message.id }),
        );
        expect(renderMessages).toHaveBeenLastCalledWith(
          expect.arrayContaining([expect.objectContaining({ id: message.id })]),
        );
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
      unsubscribeLastMessage();
    }
  });

  it('jumps to a message', async () => {
    const channel = watchedChannel;
    const messageId = messageIds[0];
    const scrollToMessage = vi.fn();

    // #region snippet docs="chat/javascript/06-state/02-messages.md" heading="Jumping to a message" tab="JavaScript" index=1
    await channel.messagePaginator.jumpToMessage(messageId);

    const { signal } = channel.messagePaginator.messageFocusSignal.getLatestValue();
    scrollToMessage(signal?.messageId);
    // #endregion snippet

    expect(scrollToMessage).toHaveBeenCalledWith(messageId);
    expect(channel.messagePaginator.items?.map((message) => message.id)).toContain(
      messageId,
    );
  });

  it('works the same for thread replies', async () => {
    const channel = watchedChannel;
    const { message: parent } = await channel.sendMessage({
      message: { text: 'thread parent' },
    });
    const replyIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const reply = await sendServerMessage(serverClient, cid, {
        text: `reply ${i}`,
        user_id: userId,
        parent_id: parent.id,
      });
      replyIds.push(reply.id);
    }
    // Loads the thread with its latest replies (3 by default)
    const thread = await client.getThreadAndHydrate(
      { message_id: parent.id },
      { watch: true },
    );
    const releaseThread = thread.activate();
    const replyId = replyIds[0];

    try {
      await retry(() => {
        expect(thread.messagePaginator.items?.length).toBeGreaterThan(0);
        expect(thread.messagePaginator.isLoading).toBe(false);
        return Promise.resolve();
      });

      // #region snippet docs="chat/javascript/06-state/02-messages.md" heading="Thread replies" tab="JavaScript" index=1
      // Replies on screen, loading and pagination flags
      const {
        items: replies,
        isLoading,
        hasMoreTail,
      } = thread.messagePaginator.state.getLatestValue();

      // Load older replies
      if (hasMoreTail) {
        await thread.messagePaginator.toTail();
      }

      // Jump to a reply
      await thread.messagePaginator.jumpToMessage(replyId);
      // #endregion snippet

      expect(replies?.length).toBeGreaterThan(0);
      expect(isLoading).toBe(false);
      // Replies are in the message store too
      expect(client.messageStore.get(replyId)?.parent_id).toBe(thread.id);
      // Every reply is loaded, and the jump focused the target reply
      expect(thread.messagePaginator.items?.map((reply) => reply.id).sort()).toEqual(
        [...replyIds].sort(),
      );
      expect(
        thread.messagePaginator.messageFocusSignal.getLatestValue().signal?.messageId,
      ).toBe(replyId);
    } finally {
      releaseThread();
    }
  });

  it('configures the page size', async () => {
    const channel = watchedChannel;
    const messageAt = (index: number) => {
      const message = channel.messagePaginator.getItem(messageIds[index]);
      if (!message) throw new Error('message not loaded');
      return message;
    };
    const parentMessage = messageAt(1);
    // The defaults
    expect(channel.messagePaginator.pageSize).toBe(100);
    expect(channel.pinnedMessagesPaginator.pageSize).toBe(100);
    expect(
      client.threads.ensure({ channel, parentMessage: messageAt(2) }).messagePaginator
        .pageSize,
    ).toBe(50);

    try {
      // #region snippet docs="chat/javascript/06-state/02-messages.md" heading="Configure the query" tab="JavaScript" index=1
      client.config.set({
        // Every channel message list and thread reply list
        messagePaginator: { pageSize: 50 },
        // Overrides for thread replies and pinned messages
        thread: { messagePaginator: { pageSize: 25 } },
        channel: { pinnedMessagesPaginator: { pageSize: 20 } },
      });
      // #endregion snippet

      const thread = client.threads.ensure({ channel, parentMessage });
      expect(channel.messagePaginator.pageSize).toBe(50);
      expect(thread.messagePaginator.pageSize).toBe(25);
      expect(channel.pinnedMessagesPaginator.pageSize).toBe(20);

      // The first page `watch()` loads has the same size
      const otherClient = await getClientSideClient({ id: userId });
      try {
        otherClient.config.set({ messagePaginator: { pageSize: 15 } });
        const otherChannel = otherClient.channel('messaging', channelId);
        await otherChannel.watch();
        expect(otherChannel.messagePaginator.items).toHaveLength(15);
        expect(otherChannel.messagePaginator.hasMoreTail).toBe(true);
      } finally {
        await disconnectClients(otherClient);
      }
    } finally {
      client.config.reset();
    }
    expect(channel.messagePaginator.pageSize).toBe(100);
  });
});
