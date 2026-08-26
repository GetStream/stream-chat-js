import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMessage, StreamChat, Thread } from '../../../src';
import type { Channel, LocalMessage, MessageResponse } from '../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../src/utils';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';

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
});
