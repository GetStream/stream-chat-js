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

const DOCS = 'chat/javascript/06-state/06-thread-list.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherUserId = uniqueId('other');
  const channelId = uniqueId('thread-list');
  let client: StreamChat;
  let otherClient: StreamChat;
  let channel: Channel;
  let parentId: string;

  /** The other member replies in the listed thread: a new reply the list learns about. */
  const replyFromOtherUser = async (text: string) => {
    const otherChannel = otherClient.channel('messaging', channelId);
    await otherChannel.watch();
    await otherChannel.sendMessage({ message: { text, parent_id: parentId } });
  };

  const waitForStaleOrder = () =>
    retry(() => {
      expect(client.threads.state.getLatestValue().isThreadOrderStale).toBe(true);
      return Promise.resolve();
    });

  beforeAll(async () => {
    cleanup.users.push(userId, otherUserId);
    client = await getClientSideClient({ id: userId });
    otherClient = await getClientSideClient({ id: otherUserId });
    channel = client.channel('messaging', channelId, {
      members: [{ user_id: userId }, { user_id: otherUserId }],
    });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
    const { message: parent } = await channel.sendMessage({
      message: { text: 'parent' },
    });
    await channel.sendMessage({ message: { text: 'reply', parent_id: parent.id } });
    parentId = parent.id;
  });

  afterAll(async () => {
    client.threads.deactivate();
    client.threads.unregisterSubscriptions();
    await disconnectClients(client, otherClient);
    await cleanup.run();
  });

  it('loads the thread list', async () => {
    // #region snippet docs="chat/javascript/06-state/06-thread-list.md" heading="Initialization" tab="JavaScript" index=1
    client.threads.registerSubscriptions();

    // When the list is on screen
    client.threads.activate();

    // When the list leaves the screen
    client.threads.deactivate();
    // #endregion snippet

    await retry(() => {
      expect(client.threads.paginator.items?.map((thread) => thread.id)).toEqual([
        parentId,
      ]);
      return Promise.resolve();
    });
    expect(client.threads.state.getLatestValue().active).toBe(false);
  });

  it('reloads on activate when replies arrived while inactive', async () => {
    const reloadSpy = vi.spyOn(client.threads.paginator, 'reload');
    try {
      // `deactivate()` doesn't stop updates: the new reply is still noticed
      await replyFromOtherUser('while inactive');
      await waitForStaleOrder();
      expect(reloadSpy).not.toHaveBeenCalled();

      client.threads.activate();
      await retry(() => {
        expect(reloadSpy).toHaveBeenCalledTimes(1);
        expect(client.threads.state.getLatestValue().isThreadOrderStale).toBe(false);
        return Promise.resolve();
      });
    } finally {
      client.threads.deactivate();
      reloadSpy.mockRestore();
    }
  });

  it('reads the thread list', () => {
    // #region snippet docs="chat/javascript/06-state/06-thread-list.md" heading="Reading" tab="JavaScript" index=1
    // The thread list
    const { items: threads, isLoading } = client.threads.paginator.state.getLatestValue();

    // Unread threads
    const { unreadThreadCount } = client.threads.state.getLatestValue();
    // #endregion snippet

    expect(threads?.map((thread) => thread.id)).toEqual([parentId]);
    expect(isLoading).toBe(false);
    expect(typeof unreadThreadCount).toBe('number');
  });

  it('subscribes to the thread list', () => {
    const renderThreadList = vi.fn();

    // #region snippet docs="chat/javascript/06-state/06-thread-list.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = client.threads.paginator.state.subscribeWithSelector(
      ({ items }) => ({ items }),
      ({ items }) => renderThreadList(items),
    );
    // #endregion snippet

    try {
      expect(renderThreadList).toHaveBeenCalledTimes(1);
      expect(renderThreadList).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: parentId }),
      ]);
    } finally {
      unsubscribe();
    }
  });

  it('updates listed threads, and flags the list for a reload', async () => {
    const [listedThread] = client.threads.paginator.items ?? [];
    const repliesBefore = listedThread?.state.getLatestValue().replyCount ?? 0;
    const renderReloadPrompt = vi.fn();

    // A listed thread updates live from the reply...
    await replyFromOtherUser('live');
    await retry(() => {
      expect(listedThread?.state.getLatestValue().replyCount).toBe(repliesBefore + 1);
      return Promise.resolve();
    });
    // ...while the list only learns that its order may be out of date
    await waitForStaleOrder();

    // #region snippet docs="chat/javascript/06-state/06-thread-list.md" heading="WebSocket events" tab="JavaScript" index=1
    const unsubscribeBanner = client.threads.state.subscribeWithSelector(
      ({ isThreadOrderStale, unseenThreadIds }) => ({
        isThreadOrderStale,
        unseenThreadIds,
      }),
      ({ isThreadOrderStale, unseenThreadIds }) =>
        renderReloadPrompt(isThreadOrderStale || unseenThreadIds.length > 0),
    );

    // When the user taps the prompt
    await client.threads.reload();
    // #endregion snippet

    try {
      // Shown while stale, hidden again by the reload
      expect(renderReloadPrompt.mock.calls).toEqual([[true], [false]]);
      expect(client.threads.paginator.items?.map((thread) => thread.id)).toEqual([
        parentId,
      ]);
    } finally {
      unsubscribeBanner();
    }
  });

  it('reloads the list after a reconnect', async () => {
    const reloadSpy = vi.spyOn(client.threads, 'reload');
    try {
      await client.closeConnection();
      await client.openConnection();
      await retry(() => {
        expect(reloadSpy).toHaveBeenCalledWith({ force: true });
        return Promise.resolve();
      });
    } finally {
      reloadSpy.mockRestore();
    }
  });
});

describe(`${DOCS} (pagination)`, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('thread-pages');
  const cid = `messaging:${channelId}`;
  // One page (25 threads) plus two
  const THREAD_COUNT = 27;
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    await serverClient.chat.channel('messaging', channelId).getOrCreate({
      data: { created_by_id: userId, members: [{ user_id: userId }] },
    });
    cleanup.channels.push(cid);
    // Parent + reply by the user, in parallel batches
    for (let batch = 0; batch < THREAD_COUNT; batch += 9) {
      await Promise.all(
        Array.from({ length: Math.min(9, THREAD_COUNT - batch) }, async (_, i) => {
          const parent = await sendServerMessage(serverClient, cid, {
            text: `parent ${batch + i}`,
            user_id: userId,
          });
          await sendServerMessage(serverClient, cid, {
            text: `reply ${batch + i}`,
            user_id: userId,
            parent_id: parent.id,
          });
        }),
      );
    }
  });

  afterAll(async () => {
    client.threads.deactivate();
    client.threads.unregisterSubscriptions();
    await disconnectClients(client);
    await cleanup.run();
  });

  it('loads more threads', async () => {
    // Nothing happens before `activate()` loaded the first page
    await client.threads.paginator.toTail();
    expect(client.threads.paginator.items).toBeUndefined();

    client.threads.registerSubscriptions();
    client.threads.activate();
    await retry(() => {
      expect(client.threads.paginator.items).toHaveLength(25);
      return Promise.resolve();
    });

    // #region snippet docs="chat/javascript/06-state/06-thread-list.md" heading="Loading more threads" tab="JavaScript" index=1
    const { hasMoreTail } = client.threads.paginator.state.getLatestValue();

    if (hasMoreTail) {
      await client.threads.paginator.toTail();
    }
    // #endregion snippet

    expect(hasMoreTail).toBe(true);
    expect(client.threads.paginator.items).toHaveLength(THREAD_COUNT);
    expect(client.threads.paginator.state.getLatestValue().hasMoreTail).toBe(false);
  });

  it('configures the page size', async () => {
    // A client whose thread list hasn't loaded yet
    const client = await getClientSideClient({ id: userId });
    const querySpy = vi.spyOn(client, 'queryThreadsAndHydrate');
    try {
      expect(client.threads.paginator.pageSize).toBe(25);

      // #region snippet docs="chat/javascript/06-state/06-thread-list.md" heading="Configure the query" tab="JavaScript" index=1
      client.threads.paginator.updateConfig({ pageSize: 10 });
      // #endregion snippet

      client.threads.registerSubscriptions();
      client.threads.activate();
      await retry(() => {
        expect(client.threads.paginator.items).toHaveLength(10);
        return Promise.resolve();
      });
      expect(client.threads.paginator.hasMoreTail).toBe(true);
      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, participant_limit: 10, reply_limit: 10 }),
      );
    } finally {
      client.threads.deactivate();
      client.threads.unregisterSubscriptions();
      await disconnectClients(client);
    }
  });
});
