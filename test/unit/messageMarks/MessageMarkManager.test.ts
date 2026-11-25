import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Event,
  LocalMessage,
  MessageMarkWithUserResponse,
  StreamChat,
  TimestampNS,
  UserResponse,
} from '../../../src';
import { MessageMarkManager } from '../../../src/messageMarks';
import { MessageMarkPaginator } from '../../../src/pagination/paginators/MessageMarkPaginator';
import { getClientWithUser } from '../test-utils/getClient';

const user = (id: string) => ({ id, name: id.toUpperCase() }) as UserResponse;

const markWithUser = (
  userId: string,
  createdAt: number,
): MessageMarkWithUserResponse => ({
  created_at: createdAt as TimestampNS,
  message_id: 'message',
  type: 'played',
  user: user(userId),
  user_id: userId,
});

const markAdded = (
  userId: string,
  createdAt: number,
  { messageId = 'message', withUser = true } = {},
) =>
  ({
    created_at: createdAt,
    mark: {
      created_at: createdAt as TimestampNS,
      message_id: messageId,
      type: 'played',
      user_id: userId,
    },
    message_id: messageId,
    type: 'message.mark_added',
    ...(withUser ? { user: user(userId) } : {}),
  }) as unknown as Event;

const response = (marks: MessageMarkWithUserResponse[], next?: string) => ({
  duration: '',
  marks,
  ...(next ? { next } : {}),
});

describe('MessageMarkManager', () => {
  let client: StreamChat;
  let manager: MessageMarkManager;

  beforeEach(() => {
    client = getClientWithUser({ id: 'author' });
    manager = client.messageMarks;
  });

  const registered = (id: string, filter?: { type: string }, messageId = 'message') =>
    manager.registerPaginator({
      paginator: new MessageMarkPaginator(client, { filter, id, messageId }),
    });

  const loadedPaginator = async (id = 'all', filter?: { type: string }) => {
    const paginator = registered(id, filter);
    vi.spyOn(client, 'queryMessageMarks').mockResolvedValueOnce(
      response([markWithUser('b', 2), markWithUser('a', 1)]),
    );
    await paginator.toTail();
    return paginator;
  };

  it('is created by the client', () => {
    expect(manager).toBeInstanceOf(MessageMarkManager);
  });

  it('finds a registered list by its id, with what it loaded', async () => {
    const paginator = await loadedPaginator('played-by:message', { type: 'played' });

    expect(manager.getPaginatorById('played-by:message')).toBe(paginator);
    expect(manager.getPaginatorById('played-by:message')?.items).toHaveLength(2);
    expect(manager.getPaginatorById('other')).toBeUndefined();
    expect(manager.paginators).toEqual([paginator]);
  });

  it('replaces a list registered with the same id', () => {
    const first = registered('list');
    const second = registered('list');

    expect(manager.getPaginatorById('list')).toBe(second);
    expect(manager.paginators).toEqual([second]);
    expect(first).not.toBe(second);
  });

  it('gives a list without an id a generated one', () => {
    const paginator = manager.registerPaginator({
      paginator: new MessageMarkPaginator(client, { messageId: 'message' }),
    });

    expect(paginator.id).toMatch(/^message-mark-paginator-/);
    expect(manager.getPaginatorById(paginator.id)).toBe(paginator);
  });

  it('removes a list by itself or by its id, keeping what it loaded', async () => {
    const byInstance = await loadedPaginator('a');
    const byId = await loadedPaginator('b');

    expect(manager.removePaginator(byInstance)).toBe(byInstance);
    expect(manager.removePaginator('b')).toBe(byId);
    expect(manager.removePaginator('b')).toBeUndefined();
    expect(manager.paginators).toEqual([]);
    expect(byInstance.items).toHaveLength(2);

    client.dispatchEvent(markAdded('c', 3));

    expect(byId.items?.map((mark) => mark.user_id)).toEqual(['b', 'a']);
  });

  it('accepts only what the marks API supports', () => {
    // @ts-expect-error marks have no sort: the API returns them newest first
    new MessageMarkPaginator(client, { messageId: 'message', sort: [] });
  });

  it('subscribes only once it holds a list', () => {
    expect(manager.hasSubscriptions).toBe(false);

    registered('list');

    expect(manager.hasSubscriptions).toBe(true);
  });

  describe('message.mark_added', () => {
    it("adds the mark, with the event's user, to every list of its message", async () => {
      const all = await loadedPaginator('all');
      const played = await loadedPaginator('played', { type: 'played' });
      const other = registered('other', undefined, 'other');
      const query = vi.spyOn(client, 'queryMessageMarks');
      query.mockClear();

      client.dispatchEvent(markAdded('c', 3));

      expect(all.items?.map((mark) => mark.user_id)).toEqual(['c', 'b', 'a']);
      expect(played.items?.map((mark) => mark.user_id)).toEqual(['c', 'b', 'a']);
      expect(played.items?.[0].user.name).toBe('C');
      expect(other.items).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    });

    it('skips a mark that comes without a user', async () => {
      const paginator = await loadedPaginator();
      const query = vi.spyOn(client, 'queryMessageMarks');
      query.mockClear();

      client.dispatchEvent(markAdded('c', 3, { withUser: false }));

      expect(paginator.items?.map((mark) => mark.user_id)).toEqual(['b', 'a']);
      expect(paginator.isStateStale).toBe(false);
      expect(query).not.toHaveBeenCalled();
    });
  });

  it('marks every list stale on connection.recovered, and an active one reloads', async () => {
    const shown = await loadedPaginator('shown');
    const hidden = await loadedPaginator('hidden', { type: 'played' });
    shown.activate();
    const spy = vi.spyOn(client, 'queryMessageMarks');
    spy.mockClear();
    spy.mockResolvedValueOnce(
      response([markWithUser('c', 3), markWithUser('b', 2)], 'c1'),
    );

    client.dispatchEvent({ type: 'connection.recovered' } as Event);

    await vi.waitFor(() =>
      expect(shown.items?.map((mark) => mark.user_id)).toEqual(['c', 'b']),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(hidden.isStateStale).toBe(true);
  });

  it('drops the lists of a hard-deleted message', async () => {
    const paginator = await loadedPaginator();

    client.dispatchEvent({
      hard_delete: true,
      message: { id: 'message' } as LocalMessage,
      type: 'message.deleted',
    } as unknown as Event);

    expect(paginator.items).toBeUndefined();
    expect(manager.getPaginatorById('all')).toBeUndefined();
  });

  it('keeps the lists of a soft-deleted message', async () => {
    const paginator = await loadedPaginator();

    client.dispatchEvent({
      message: { id: 'message' } as LocalMessage,
      type: 'message.deleted',
    } as unknown as Event);

    expect(manager.getPaginatorById('all')).toBe(paginator);
  });

  describe('channel.truncated', () => {
    const truncated = (truncatedAt?: number) =>
      ({
        channel: truncatedAt === undefined ? {} : { truncated_at: truncatedAt },
        cid: 'messaging:trail',
        type: 'channel.truncated',
      }) as unknown as Event;

    beforeEach(() => {
      client.messageStore.upsert({
        cid: 'messaging:trail',
        created_at: 100 as TimestampNS,
        id: 'message',
      } as LocalMessage);
    });

    it('drops the lists of a fully truncated channel', async () => {
      const paginator = await loadedPaginator();

      client.dispatchEvent(truncated());

      expect(paginator.items).toBeUndefined();
      expect(manager.getPaginatorById('all')).toBeUndefined();
    });

    it('drops the lists of a message older than the cutoff', async () => {
      const paginator = await loadedPaginator();

      client.dispatchEvent(truncated(200));

      expect(manager.getPaginatorById('all')).toBeUndefined();
    });

    it('keeps the lists of a message newer than the cutoff', async () => {
      const paginator = await loadedPaginator();

      client.dispatchEvent(truncated(50));

      expect(paginator.items).toHaveLength(2);
      expect(manager.getPaginatorById('all')).toBe(paginator);
    });
  });

  it('empties and drops everything on disconnect', async () => {
    const paginator = await loadedPaginator();

    await client.disconnectUser();

    expect(manager.hasSubscriptions).toBe(false);
    expect(paginator.items).toBeUndefined();
    expect(manager.getPaginatorById('all')).toBeUndefined();
  });
});
