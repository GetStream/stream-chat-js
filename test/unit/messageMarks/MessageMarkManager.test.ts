import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Event,
  LocalMessage,
  MessageMarkWithUserResponse,
  QueryMessageMarksFilter,
  StreamChat,
  TimestampNS,
  UserResponse,
} from '../../../src';
import { MessageMarkManager } from '../../../src/messageMarks';
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

  const loadedPaginator = async (filter?: { type: string }) => {
    const paginator = manager.getOrCreatePaginator({ filter, messageId: 'message' });
    vi.spyOn(client, 'queryMessageMarks').mockResolvedValueOnce(
      response([markWithUser('b', 2), markWithUser('a', 1)]),
    );
    await paginator.toTail();
    return paginator;
  };

  it('is created by the client', () => {
    expect(manager).toBeInstanceOf(MessageMarkManager);
  });

  it('reuses the list of a message and filter, with what it loaded', async () => {
    const paginator = await loadedPaginator({ type: 'played' });

    expect(
      manager.getOrCreatePaginator({ filter: { type: 'played' }, messageId: 'message' }),
    ).toBe(paginator);
    expect(
      manager.getOrCreatePaginator({ filter: { type: 'played' }, messageId: 'message' })
        .items,
    ).toHaveLength(2);
    expect(manager.getOrCreatePaginator({ messageId: 'message' })).not.toBe(paginator);
    expect(
      manager.getOrCreatePaginator({ filter: { type: 'played' }, messageId: 'other' }),
    ).not.toBe(paginator);
  });

  it('keys a list on its message and its whole filter', () => {
    // Filter fields the API may add later: cast, as the generated type only has `type` today.
    const filter = (value: object) => value as QueryMessageMarksFilter;
    const played = manager.getOrCreatePaginator({
      filter: filter({ type: 'played', user_id: 'u1' }),
      messageId: 'message',
    });

    expect(
      manager.getOrCreatePaginator({
        filter: filter({ user_id: 'u1', type: 'played' }),
        messageId: 'message',
      }),
    ).toBe(played);
    expect(
      manager.getOrCreatePaginator({
        filter: filter({ type: 'played', user_id: 'u2' }),
        messageId: 'message',
      }),
    ).not.toBe(played);
    expect(manager.getOrCreatePaginator({ filter: {}, messageId: 'message' })).toBe(
      manager.getOrCreatePaginator({ messageId: 'message' }),
    );
  });

  it('applies paginatorOptions when it creates the list', () => {
    const paginator = manager.getOrCreatePaginator({
      messageId: 'message',
      paginatorOptions: { pageSize: 25 },
    });

    const again = manager.getOrCreatePaginator({
      messageId: 'message',
      paginatorOptions: { pageSize: 5 },
    });

    expect(again).toBe(paginator);
    expect(paginator.pageSize).toBe(25);
  });

  it('accepts only what the marks API supports', () => {
    manager.getOrCreatePaginator({
      messageId: 'message',
      // @ts-expect-error marks have no sort: the API returns them newest first
      sort: [{ direction: 1, field: 'created_at' }],
    });
  });

  it('subscribes only once it holds a list', () => {
    expect(manager.hasSubscriptions).toBe(false);

    manager.getOrCreatePaginator({ messageId: 'message' });

    expect(manager.hasSubscriptions).toBe(true);
  });

  describe('message.mark_added', () => {
    it("adds the mark, with the event's user, to every list of its message", async () => {
      const all = await loadedPaginator();
      const played = await loadedPaginator({ type: 'played' });
      const other = manager.getOrCreatePaginator({ messageId: 'other' });
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
    const shown = await loadedPaginator();
    const hidden = await loadedPaginator({ type: 'played' });
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
    expect(manager.getOrCreatePaginator({ messageId: 'message' })).not.toBe(paginator);
  });

  it('keeps the lists of a soft-deleted message', async () => {
    const paginator = await loadedPaginator();

    client.dispatchEvent({
      message: { id: 'message' } as LocalMessage,
      type: 'message.deleted',
    } as unknown as Event);

    expect(manager.getOrCreatePaginator({ messageId: 'message' })).toBe(paginator);
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
      expect(manager.getOrCreatePaginator({ messageId: 'message' })).not.toBe(paginator);
    });

    it('drops the lists of a message older than the cutoff', async () => {
      const paginator = await loadedPaginator();

      client.dispatchEvent(truncated(200));

      expect(manager.getOrCreatePaginator({ messageId: 'message' })).not.toBe(paginator);
    });

    it('keeps the lists of a message newer than the cutoff', async () => {
      const paginator = await loadedPaginator();

      client.dispatchEvent(truncated(50));

      expect(paginator.items).toHaveLength(2);
      expect(manager.getOrCreatePaginator({ messageId: 'message' })).toBe(paginator);
    });
  });

  it('drops everything on disconnect', async () => {
    const paginator = await loadedPaginator();

    await client.disconnectUser();

    expect(manager.hasSubscriptions).toBe(false);
    expect(manager.getOrCreatePaginator({ messageId: 'message' })).not.toBe(paginator);
  });
});
