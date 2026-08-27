import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMessage, StreamChat, Thread } from '../../../src';
import type { Channel, LocalMessage, MessageResponse } from '../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../src/utils';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';
import { MockOfflineDB } from '../offline-support/MockOfflineDB';
import type { PendingTask, StableWSConnection } from '../../../src';

/**
 * Where an optimistic edit/delete LANDS, as opposed to what it does once it gets there
 * (`MessageOperations.test.ts`).
 *
 * The interesting case is a thread's PARENT message edited or deleted from inside the open thread,
 * which is how the UI SDKs route it while a thread is on screen. The reply paginator's local filter is
 * `{ cid, parent_id: thread.id }` and a parent has no `parent_id`, so it cannot hold the parent — the
 * write has to reach the client-global message store instead, the same way `applyReactionLocally` does.
 */
const CURRENT_USER = { id: 'me' };

const connect = () => {
  const client = new StreamChat('apiKey');
  client.user = CURRENT_USER;
  return client;
};

const createChannel = (client: StreamChat) => {
  const { channel: channelResponse } = generateChannel();
  const channel = client.channel(channelResponse.type, channelResponse.id);
  channel.initialized = true;
  return channel;
};

const seedChannel = (channel: Channel, message: MessageResponse) =>
  channel.messagePaginator.ingestPage({
    isHead: true,
    isTail: true,
    page: [formatMessage(message)],
    setActive: true,
  });

describe('optimistic edit/delete routing', () => {
  let client: StreamChat;
  let channel: Channel;

  beforeEach(() => {
    client = connect();
    channel = createChannel(client);
  });

  /**
   * A thread whose parent is registered in the message store (which `registerSubscriptions` does), so
   * `state.parentMessage` is a projection of the canonical copy.
   */
  const setupThread = ({ seedParentInChannel = false } = {}) => {
    const parentId = uuidv4();
    const parentMessage = generateMsg({
      cid: channel.cid,
      id: parentId,
      text: 'parent before',
    }) as MessageResponse;
    if (seedParentInChannel) seedChannel(channel, parentMessage);

    const thread = new Thread({ client, channel, parentMessage });
    thread.registerSubscriptions();

    const reply = generateMsg({
      cid: channel.cid,
      parent_id: parentId,
      text: 'reply before',
    }) as MessageResponse;
    thread.messagePaginator.ingestPage({
      isHead: true,
      isTail: true,
      page: [formatMessage(reply)],
      setActive: true,
    });

    return { parentId, parentMessage, reply, thread };
  };

  const parentProjection = (thread: Thread) =>
    thread.state.getLatestValue().parentMessage;

  /**
   * A `show_in_channel` reply is held by BOTH lists — the channel paginator's filter is just `{ cid }`
   * — so a hard delete has to clear both. `Thread`'s own `remove` already reaches into the channel;
   * this is the mirror, for a reply deleted from the channel list while its thread is loaded.
   */
  describe('show_in_channel reply hard-deleted from the channel', () => {
    const setupSharedReply = () => {
      const parentId = uuidv4();
      const parentMessage = generateMsg({
        cid: channel.cid,
        id: parentId,
      }) as MessageResponse;
      const thread = new Thread({ client, channel, parentMessage });
      thread.registerSubscriptions();

      const reply = generateMsg({
        cid: channel.cid,
        parent_id: parentId,
        show_in_channel: true,
        text: 'shown in both',
      }) as MessageResponse;

      // Held by both lists, which is what `show_in_channel` means.
      seedChannel(channel, reply);
      thread.messagePaginator.ingestPage({
        isHead: true,
        isTail: true,
        page: [formatMessage(reply)],
        setActive: true,
      });

      // Only threads the manager knows about are reachable from `Channel`.
      client.threads.state.partialNext({ threads: [thread] });

      return { reply, thread };
    };

    it('clears it from the thread reply list as well as the channel', async () => {
      const { reply, thread } = setupSharedReply();
      vi.spyOn(client, 'deleteMessage').mockResolvedValue({} as never);

      expect(channel.messagePaginator.getItem(reply.id)).toBeDefined();
      expect(thread.messagePaginator.getItem(reply.id)).toBeDefined();

      await channel.deleteMessageWithLocalUpdate({
        localMessage: formatMessage(reply) as LocalMessage,
        options: { hard: true },
      });

      expect(channel.messagePaginator.getItem(reply.id)).toBeUndefined();
      // Without the mirror this stayed behind until the `message.deleted` event arrived — and for a
      // hard delete queued offline, not until the next reconnect.
      expect(thread.messagePaginator.getItem(reply.id)).toBeUndefined();
    });

    it('leaves threads belonging to other channels alone', async () => {
      const { reply } = setupSharedReply();
      const otherChannel = createChannel(client);
      const otherParent = generateMsg({ cid: otherChannel.cid }) as MessageResponse;
      const otherThread = new Thread({
        channel: otherChannel,
        client,
        parentMessage: otherParent,
      });
      otherThread.registerSubscriptions();
      // Same id in another channel's thread: only the deleting channel's threads may be touched.
      otherThread.messagePaginator.ingestPage({
        isHead: true,
        isTail: true,
        page: [formatMessage({ ...reply, cid: otherChannel.cid })],
        setActive: true,
      });
      client.threads.state.partialNext({
        threads: [...client.threads.state.getLatestValue().threads, otherThread],
      });
      vi.spyOn(client, 'deleteMessage').mockResolvedValue({} as never);

      await channel.deleteMessageWithLocalUpdate({
        localMessage: formatMessage(reply) as LocalMessage,
        options: { hard: true },
      });

      expect(otherThread.messagePaginator.getItem(reply.id)).toBeDefined();
    });
  });

  describe('thread parent edited from inside the thread', () => {
    it('reflects the optimistic edit on the parent projection', async () => {
      const { parentId, parentMessage, thread } = setupThread();
      // Never resolves during the assertion window: the optimistic state is what is under test, not
      // the reconcile.
      vi.spyOn(client, 'updateMessage').mockReturnValue(new Promise(() => {}) as never);

      thread.updateMessageWithLocalUpdate({
        localMessage: {
          ...formatMessage(parentMessage),
          text: 'parent after',
        } as LocalMessage,
      });

      // Before the routing fix this went to the reply paginator, whose filter rejected it for having no
      // `parent_id`, and the edit was silently dropped.
      expect(parentProjection(thread)?.text).toBe('parent after');
    });

    it('reflects it on the channel copy too when the channel holds the parent', async () => {
      const { parentId, parentMessage, thread } = setupThread({
        seedParentInChannel: true,
      });
      vi.spyOn(client, 'updateMessage').mockReturnValue(new Promise(() => {}) as never);

      thread.updateMessageWithLocalUpdate({
        localMessage: {
          ...formatMessage(parentMessage),
          text: 'parent after',
        } as LocalMessage,
      });

      expect(channel.messagePaginator.getItem(parentId)?.text).toBe('parent after');
      expect(parentProjection(thread)?.text).toBe('parent after');
    });

    it('does not add the parent to the reply list', async () => {
      const { parentId, parentMessage, thread } = setupThread();
      vi.spyOn(client, 'updateMessage').mockReturnValue(new Promise(() => {}) as never);

      thread.updateMessageWithLocalUpdate({
        localMessage: {
          ...formatMessage(parentMessage),
          text: 'parent after',
        } as LocalMessage,
      });

      expect(
        thread.messagePaginator.items?.some((message) => message.id === parentId),
      ).toBe(false);
    });

    it('reflects an optimistic delete of the parent', async () => {
      const { parentMessage, thread } = setupThread({ seedParentInChannel: true });
      vi.spyOn(client, 'deleteMessage').mockReturnValue(new Promise(() => {}) as never);

      thread.deleteMessageWithLocalUpdate({
        localMessage: formatMessage(parentMessage) as LocalMessage,
      });

      expect(parentProjection(thread)?.type).toBe('deleted');
      expect(parentProjection(thread)?.deleted_at).toBeInstanceOf(Date);
      // `deletedAt` sits on the thread state root, derived from the parent by the store projection —
      // so this also proves the write went through the store rather than the reply paginator.
      expect(thread.state.getLatestValue().deletedAt).toBeTruthy();
    });
  });

  describe('thread reply', () => {
    it('removes a show_in_channel reply from the channel list too on a hard delete', async () => {
      const { parentId, thread } = setupThread();
      // A reply the author chose to also post to the channel is held by BOTH paginators, so removing it
      // from the reply list alone leaves a ghost in the main list.
      const shown = generateMsg({
        cid: channel.cid,
        parent_id: parentId,
        show_in_channel: true,
      }) as MessageResponse;
      seedChannel(channel, shown);
      thread.messagePaginator.ingestItem(formatMessage(shown));
      expect(channel.messagePaginator.getItem(shown.id)).toBeDefined();
      vi.spyOn(client, 'deleteMessage').mockReturnValue(new Promise(() => {}) as never);

      thread.deleteMessageWithLocalUpdate({
        localMessage: formatMessage(shown) as LocalMessage,
        options: { hard: true },
      });

      expect(thread.messagePaginator.getItem(shown.id)).toBeUndefined();
      expect(channel.messagePaginator.getItem(shown.id)).toBeUndefined();
    });

    it('still routes an optimistic edit into the reply paginator', async () => {
      const { reply, thread } = setupThread();
      vi.spyOn(client, 'updateMessage').mockReturnValue(new Promise(() => {}) as never);

      thread.updateMessageWithLocalUpdate({
        localMessage: { ...formatMessage(reply), text: 'reply after' } as LocalMessage,
      });

      expect(thread.messagePaginator.getItem(reply.id)?.text).toBe('reply after');
    });
  });

  describe('channel message', () => {
    it('routes an optimistic edit into the channel paginator', async () => {
      const message = generateMsg({
        cid: channel.cid,
        text: 'before',
      }) as MessageResponse;
      seedChannel(channel, message);
      vi.spyOn(client, 'updateMessage').mockReturnValue(new Promise(() => {}) as never);

      channel.updateMessageWithLocalUpdate({
        localMessage: { ...formatMessage(message), text: 'after' } as LocalMessage,
      });

      expect(channel.messagePaginator.getItem(message.id)?.text).toBe('after');
    });

    it('marks an optimistic soft delete as deleted in the channel paginator', async () => {
      const message = generateMsg({ cid: channel.cid }) as MessageResponse;
      seedChannel(channel, message);
      vi.spyOn(client, 'deleteMessage').mockReturnValue(new Promise(() => {}) as never);

      channel.deleteMessageWithLocalUpdate({
        localMessage: formatMessage(message) as LocalMessage,
      });

      expect(channel.messagePaginator.getItem(message.id)?.type).toBe('deleted');
      expect(channel.messagePaginator.getItem(message.id)?.deleted_at).toBeInstanceOf(
        Date,
      );
    });

    it('removes the message from the channel paginator for an optimistic hard delete', async () => {
      const message = generateMsg({ cid: channel.cid }) as MessageResponse;
      seedChannel(channel, message);
      vi.spyOn(client, 'deleteMessage').mockReturnValue(new Promise(() => {}) as never);

      channel.deleteMessageWithLocalUpdate({
        localMessage: formatMessage(message) as LocalMessage,
        options: { hard: true },
      });

      expect(channel.messagePaginator.getItem(message.id)).toBeUndefined();
    });
  });

  /**
   * Whether a failed mutation settles as `failed` or is left pending, driven end to end rather than by an
   * injected `isQueued` (which is what `MessageOperations.test.ts` does).
   *
   * The distinction only exists because the OFFLINE QUEUE can refuse a task the error's shape says is
   * perfectly retryable: `handleAddPendingTask` drops an `update-message` whose payload still points at a
   * local attachment URL, because nothing could ever replay it. Inferring "retryable error + offline DB ⇒
   * queued" therefore left such an edit looking pending forever, with nothing coming to finish it.
   */
  describe('a failed edit, queued or not', () => {
    /**
     * A `MockOfflineDB` with a real in-memory pending-task table: the SQL layer is faked, the queue
     * semantics are not. `queueTask` and `handleAddPendingTask` are inherited, so the decision under test
     * is the production one.
     */
    const enableOfflineDb = () => {
      const db = new MockOfflineDB({ client });
      client.setOfflineDBApi(db);
      db.state.partialNext({ initialized: true, userId: CURRENT_USER.id });

      const pendingTasks: PendingTask[] = [];
      db.addPendingTask.mockImplementation(async (task: PendingTask) => {
        pendingTasks.push(task);
        return [];
      });
      db.getPendingTasks.mockImplementation(async (conditions?: { messageId?: string }) =>
        pendingTasks.filter(
          (task) => !conditions?.messageId || task.messageId === conditions.messageId,
        ),
      );
      db.channelExists.mockResolvedValue(true);
      db.upsertMessages.mockResolvedValue([]);
      db.updateMessage.mockResolvedValue([]);

      // Offline: `queueTask` short-circuits before any HTTP, and the direct attempt that
      // `client.updateMessage` falls through to fails too.
      client.wsConnection = { isHealthy: false } as StableWSConnection;
      vi.spyOn(client, '_updateMessage').mockRejectedValue(
        Object.assign(new Error('network down'), { code: 9 }),
      );

      return { db, pendingTasks };
    };

    const editMessageWithAttachment = async (asset_url: string) => {
      const message = generateMsg({
        attachments: [{ asset_url, type: 'file' }],
        cid: channel.cid,
        id: uuidv4(),
        text: 'before',
      }) as MessageResponse;
      seedChannel(channel, message);

      await expect(
        channel.updateMessageWithLocalUpdate({
          localMessage: { ...formatMessage(message), text: 'after' } as LocalMessage,
        }),
      ).rejects.toThrow();

      return channel.messagePaginator.getItem(message.id);
    };

    it('settles FAILED when the queue refused the task, however retryable the error looked', async () => {
      const { pendingTasks } = enableOfflineDb();

      // A local URI is exactly what `isMessageUpdateReplayable` refuses.
      const edited = await editMessageWithAttachment('file:///tmp/local.pdf');

      expect(pendingTasks).toHaveLength(0);
      expect(edited?.status).toBe('failed');
      expect(edited?.error).toBeDefined();
      // The edit itself survives — reverting would destroy text the user typed.
      expect(edited?.text).toBe('after');
    });

    it('stays pending when the task WAS queued, with no failed state on the message', async () => {
      const { pendingTasks } = enableOfflineDb();

      const edited = await editMessageWithAttachment('https://example.com/remote.pdf');

      expect(pendingTasks.map((task) => task.type)).toEqual(['update-message']);
      expect(edited?.status).not.toBe('failed');
      expect(edited?.error).toBeUndefined();
      expect(edited?.text).toBe('after');
    });
  });
});
