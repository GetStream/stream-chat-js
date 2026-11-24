import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MessageMarkWithUserResponse,
  StreamChat,
  TimestampNS,
} from '../../../../src';
import { MessageMarkPaginator } from '../../../../src/pagination/paginators/MessageMarkPaginator';
import { getClientWithUser } from '../../test-utils/getClient';

const makeMark = (
  userId: string,
  createdAt: number,
  { messageId = 'message', type = 'played' } = {},
): MessageMarkWithUserResponse => ({
  created_at: createdAt as TimestampNS,
  message_id: messageId,
  type,
  user: { id: userId } as MessageMarkWithUserResponse['user'],
  user_id: userId,
});

const response = (marks: MessageMarkWithUserResponse[], next?: string) => ({
  duration: '',
  marks,
  ...(next ? { next } : {}),
});

const userIds = (paginator: MessageMarkPaginator) =>
  paginator.items?.map((mark) => mark.user_id);

describe('MessageMarkPaginator', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
  });

  describe('paging', () => {
    it('queries the marks of its message and keeps them newest first', async () => {
      const paginator = new MessageMarkPaginator(client, {
        messageId: 'message',
        paginatorOptions: { pageSize: 2 },
      });
      const spy = vi
        .spyOn(client, 'queryMessageMarks')
        .mockResolvedValue(response([makeMark('a', 2), makeMark('b', 1)], 'c1'));

      await paginator.toTail();

      expect(spy).toHaveBeenCalledWith({ id: 'message' }, { limit: 2 });
      expect(userIds(paginator)).toEqual(['a', 'b']);
      expect(paginator.items?.[0].user.id).toBe('a');
      expect(paginator.getItem('message:a:played')?.user_id).toBe('a');
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.cursor?.tailward).toBe('c1');
    });

    it('sends the cursor as `next` and stops on a page without one', async () => {
      const paginator = new MessageMarkPaginator(client, {
        messageId: 'message',
        paginatorOptions: { pageSize: 2 },
      });
      const spy = vi.spyOn(client, 'queryMessageMarks');
      spy.mockResolvedValueOnce(response([makeMark('a', 3), makeMark('b', 2)], 'c1'));
      await paginator.toTail();

      spy.mockResolvedValueOnce(response([makeMark('b', 2), makeMark('c', 1)]));
      await paginator.toTail();

      expect(spy.mock.calls[1]).toEqual([{ id: 'message' }, { limit: 2, next: 'c1' }]);
      expect(userIds(paginator)).toEqual(['a', 'b', 'c']);
      expect(paginator.hasMoreTail).toBe(false);
      expect(paginator.cursor?.tailward).toBeNull();
    });

    it('does not paginate backward', async () => {
      const paginator = new MessageMarkPaginator(client, { messageId: 'message' });
      const spy = vi
        .spyOn(client, 'queryMessageMarks')
        .mockResolvedValue(response([makeMark('a', 1)]));
      await paginator.toTail();
      spy.mockClear();

      await paginator.toHead();

      expect(spy).not.toHaveBeenCalled();
      expect(paginator.hasMoreHead).toBe(false);
    });

    it('sends its filter with every page', async () => {
      const paginator = new MessageMarkPaginator(client, {
        filter: { type: 'played' },
        messageId: 'message',
        paginatorOptions: { pageSize: 2 },
      });
      const spy = vi.spyOn(client, 'queryMessageMarks');
      spy.mockResolvedValueOnce(response([makeMark('a', 2), makeMark('b', 1)], 'c1'));
      await paginator.toTail();
      spy.mockResolvedValueOnce(response([makeMark('c', 0)]));
      await paginator.toTail();

      expect(spy.mock.calls.map(([, request]) => request)).toEqual([
        { filter: { type: 'played' }, limit: 2 },
        { filter: { type: 'played' }, limit: 2, next: 'c1' },
      ]);
    });
  });

  describe('live marks', () => {
    const loaded = async (filter?: { type: string }) => {
      const paginator = new MessageMarkPaginator(client, {
        filter,
        messageId: 'message',
        paginatorOptions: { pageSize: 2 },
      });
      vi.spyOn(client, 'queryMessageMarks').mockResolvedValueOnce(
        response([makeMark('b', 2), makeMark('a', 1)]),
      );
      await paginator.toTail();
      return paginator;
    };

    it('puts a new mark at the head, however much newer it is', async () => {
      const paginator = await loaded();

      paginator.ingestItem(makeMark('c', 1_000_000));

      expect(userIds(paginator)).toEqual(['c', 'b', 'a']);
    });

    it('puts a new mark at the head after more pages loaded', async () => {
      const paginator = new MessageMarkPaginator(client, {
        messageId: 'message',
        paginatorOptions: { pageSize: 2 },
      });
      const spy = vi.spyOn(client, 'queryMessageMarks');
      spy.mockResolvedValueOnce(response([makeMark('d', 4), makeMark('c', 3)], 'c1'));
      await paginator.toTail();
      spy.mockResolvedValueOnce(response([makeMark('b', 2), makeMark('a', 1)]));
      await paginator.toTail();

      paginator.ingestItem(makeMark('e', 1_000_000));

      expect(userIds(paginator)).toEqual(['e', 'd', 'c', 'b', 'a']);
    });

    it('keeps a mark it already has in place', async () => {
      const paginator = await loaded();

      paginator.ingestItem(makeMark('b', 2));

      expect(userIds(paginator)).toEqual(['b', 'a']);
    });

    it('ignores marks its filter or its message does not match', async () => {
      const paginator = await loaded({ type: 'played' });

      paginator.ingestItem(makeMark('c', 3, { type: 'acme.viewed' }));
      paginator.ingestItem(makeMark('d', 4, { messageId: 'other' }));

      expect(userIds(paginator)).toEqual(['b', 'a']);
    });
  });

  describe('staleness', () => {
    const loaded = async () => {
      const paginator = new MessageMarkPaginator(client, {
        messageId: 'message',
        paginatorOptions: { pageSize: 2 },
      });
      const spy = vi.spyOn(client, 'queryMessageMarks');
      spy.mockResolvedValueOnce(response([makeMark('b', 2), makeMark('a', 1)]));
      await paginator.toTail();
      spy.mockClear();
      return { paginator, spy };
    };

    it('reloads an active list at once, showing the loading state', async () => {
      const { paginator, spy } = await loaded();
      paginator.activate();
      spy.mockResolvedValueOnce(response([makeMark('c', 3), makeMark('b', 2)], 'c1'));

      paginator.markStale();
      expect(paginator.items).toBeUndefined();
      expect(paginator.isLoading).toBe(true);

      await vi.waitFor(() => expect(userIds(paginator)).toEqual(['c', 'b']));
      expect(spy).toHaveBeenCalledWith({ id: 'message' }, { limit: 2 });
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.isStateStale).toBe(false);
    });

    it('waits for an inactive list to be activated', async () => {
      const { paginator, spy } = await loaded();
      spy.mockResolvedValueOnce(response([makeMark('c', 3), makeMark('b', 2)], 'c1'));

      paginator.markStale();
      expect(spy).not.toHaveBeenCalled();
      expect(userIds(paginator)).toEqual(['b', 'a']);
      expect(paginator.isStateStale).toBe(true);

      paginator.activate();
      await vi.waitFor(() => expect(userIds(paginator)).toEqual(['c', 'b']));
      expect(paginator.isStateStale).toBe(false);
    });

    it('needs no reload before the first page', async () => {
      const paginator = new MessageMarkPaginator(client, { messageId: 'message' });
      const spy = vi.spyOn(client, 'queryMessageMarks');

      paginator.activate();
      paginator.markStale();

      expect(spy).not.toHaveBeenCalled();
      expect(paginator.isStateStale).toBe(false);
    });

    it('stays active until every consumer releases it', () => {
      const paginator = new MessageMarkPaginator(client, { messageId: 'message' });
      const releaseA = paginator.activate();
      const releaseB = paginator.activate();

      releaseA();
      releaseA();
      expect(paginator.active).toBe(true);

      releaseB();
      expect(paginator.active).toBe(false);
    });
  });
});
