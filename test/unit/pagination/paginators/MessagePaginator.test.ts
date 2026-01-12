import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZERO_PAGE_CURSOR } from '../../../../src/pagination/paginators/BasePaginator';
import type { Interval } from '../../../../src/pagination/paginators/BasePaginator';
import { MessagePaginator } from '../../../../src/pagination/paginators/MessagePaginator';
import { ItemIndex } from '../../../../src/pagination/ItemIndex';
import type { Channel } from '../../../../src/channel';
import type {
  LocalMessage,
  MessagePaginationOptions,
  MessageResponse,
} from '../../../../src/types';
import { generateMessageDraft } from '../../test-utils/generateMessageDraft';
import { generateMsg } from '../../test-utils/generateMessage';
import { formatMessage } from '../../../../src';
import { DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE } from '../../../../src/constants';

const createMessage = (overrides: Partial<MessageResponse>): LocalMessage =>
  formatMessage(
    generateMsg({
      id: 'message-id',
      ...overrides,
    }),
  );

describe('MessagePaginator', () => {
  let channel: Channel;
  let itemIndex: ItemIndex<LocalMessage>;

  beforeEach(() => {
    channel = { cid: 'channel-id', query: vi.fn() } as unknown as Channel;
    itemIndex = new ItemIndex<LocalMessage>({ getId: (message) => message.id });
  });

  describe('constructor()', () => {
    it('applies defaults and builds comparator', () => {
      const paginator = new MessagePaginator({ channel });

      expect(paginator.pageSize).toBe(100);
      expect(paginator.id.startsWith('message-paginator-')).toBe(true);
      expect(paginator.state.getLatestValue()).toEqual({
        cursor: ZERO_PAGE_CURSOR,
        hasMoreHead: true,
        hasMoreTail: true,
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        offset: 0,
      });
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(1);

      const newer = createMessage({ id: 'b', created_at: '2021-01-01T00:00:00.000Z' });
      const older = createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' });
      expect(paginator.sortComparator(older, newer)).toBeLessThan(0);
      expect(paginator.sortComparator(newer, older)).toBeGreaterThan(0);

      const sameDateA = createMessage({
        id: 'a',
        created_at: '2021-01-01T00:00:00.000Z',
      });
      const sameDateB = createMessage({
        id: 'b',
        created_at: '2021-01-01T00:00:00.000Z',
      });
      expect(paginator.sortComparator(sameDateA, sameDateB)).toBeLessThan(0); // because of the same date, the tiebreaker kicks in
    });

    it('respects provided paginator options', () => {
      const doRequest = vi.fn();
      const paginator = new MessagePaginator({
        channel,
        id: 'custom-id',
        itemIndex,
        paginatorOptions: { doRequest, pageSize: 5 },
      });

      expect(paginator.pageSize).toBe(5);
      expect(paginator.id).toBe('custom-id');
      expect(paginator.sort).toEqual({ created_at: 1 });
      expect(paginator.config.doRequest).toBe(doRequest);
    });
  });

  describe('query shape handling', () => {
    it('returns always false for hasPaginationQueryShapeChanged', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const prev: MessagePaginationOptions = { id_gt: 'a', limit: 10 };
      const nextSameShape: MessagePaginationOptions = { id_gt: 'a', limit: 30 };
      const nextDifferent: MessagePaginationOptions = { id_gt: 'b', limit: 10 };

      expect(paginator.config.hasPaginationQueryShapeChanged(prev, nextSameShape)).toBe(
        false,
      );
      expect(paginator.config.hasPaginationQueryShapeChanged(prev, nextDifferent)).toBe(
        false,
      );
    });

    it('builds filters using the channel cid', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      expect(paginator.buildFilters()).toEqual({ cid: 'channel-id' });
    });

    it('computes next query shape from cursor and direction', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const currentState = paginator.state.getLatestValue();
      paginator.state.next({
        ...currentState,
        cursor: { headward: 'head-cursor', tailward: 'tail-cursor' },
      });

      // @ts-expect-error accessing protected method
      expect(paginator.getNextQueryShape({ direction: 'tailward' })).toEqual({
        id_lt: 'tail-cursor',
        limit: 100,
      });

      // @ts-expect-error accessing protected method
      expect(paginator.getNextQueryShape({ direction: 'headward' })).toEqual({
        id_gt: 'head-cursor',
        limit: 100,
      });
    });
  });

  describe('query()', () => {
    it('uses an existing query shape when provided and respects doRequest path', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        paginatorOptions: {
          doRequest: vi.fn().mockResolvedValue({
            cursor: { headward: 'head', tailward: 'tail' },
            items: [generateMsg({ id: '1' })],
          }),
        },
      });
      // @ts-expect-error setting protected field for test coverage
      paginator._nextQueryShape = {
        custom: 'shape',
      } as unknown as MessagePaginationOptions;
      // @ts-expect-error spying on protected method
      const getNextQueryShapeSpy = vi.spyOn(paginator, 'getNextQueryShape');

      const result = await paginator.query({ direction: 'headward' });

      expect(paginator.config.doRequest).toHaveBeenCalledWith({ custom: 'shape' });
      expect(result.headward).toBe('head');
      expect(result.tailward).toBeUndefined();
      expect(getNextQueryShapeSpy).not.toHaveBeenCalled();
    });

    it('formats channel query results and sets cursors based on direction', async () => {
      const messages = [
        { id: 'first', created_at: '2022-01-01T00:00:00.000Z' },
        { id: 'last', created_at: '2022-01-02T00:00:00.000Z' },
      ];
      (channel.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages,
      });
      const paginator = new MessagePaginator({ channel, itemIndex });
      // @ts-expect-error setting protected field for test coverage
      paginator._nextQueryShape = { id_gt: 'from-cursor', limit: 30 };

      const result = await paginator.query({});

      expect(channel.query).toHaveBeenCalledWith({
        messages: { id_gt: 'from-cursor', limit: 30 },
      });
      expect(result.tailward).toBe('first');
      expect(result.headward).toBe('last');
      expect(result.items[0].created_at).toBeInstanceOf(Date);
      expect(result.items[1].created_at).toBeInstanceOf(Date);
    });
  });

  describe('jumpToMessage()', () => {
    it('delegates to executeQuery with id_around payload', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      itemIndex.setOne(
        createMessage({ id: 'target-message', created_at: '2020-01-01T00:00:00.000Z' }),
      );
      const targetInterval: Interval = {
        id: 'interval-1',
        hasMoreHead: true,
        hasMoreTail: true,
        itemIds: ['target-message'],
        isHead: false,
        isTail: false,
      };
      const executeQuerySpy = vi
        .spyOn(paginator, 'executeQuery')
        .mockResolvedValue({ stateCandidate: {}, targetInterval });

      const result = await paginator.jumpToMessage('target-message', { pageSize: 13 });

      expect(executeQuerySpy).toHaveBeenCalledWith({
        queryShape: { id_around: 'target-message', limit: 13 },
        updateState: false,
      });
      expect(result).toBe(true);
    });

    it('updates cursor when jumping between already loaded intervals', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      const m4 = createMessage({
        cid: 'channel-id',
        id: 'm4',
        created_at: '2020-01-04T00:00:00.000Z',
      });
      const m5 = createMessage({
        cid: 'channel-id',
        id: 'm5',
        created_at: '2020-01-05T00:00:00.000Z',
      });
      const m8 = createMessage({
        cid: 'channel-id',
        id: 'm8',
        created_at: '2020-01-08T00:00:00.000Z',
      });
      const m9 = createMessage({
        cid: 'channel-id',
        id: 'm9',
        created_at: '2020-01-09T00:00:00.000Z',
      });

      // two disjoint anchored intervals
      paginator.ingestPage({ page: [m8, m9], isHead: true, setActive: true });
      paginator.ingestPage({ page: [m4, m5] });

      await paginator.jumpToMessage('m4');
      expect(paginator.cursor?.tailward).toBe('m4');

      await paginator.jumpToMessage('m9');
      // jumping back to the head interval should restore its tailward cursor
      expect(paginator.cursor?.tailward).toBe('m8');
    });
  });

  describe.todo('jumpToTheLatestMessage', () => {});

  describe('jumpToTheFirstUnreadMessage()', () => {
    it('uses unreadState snapshot even if channel read state is already "read"', async () => {
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read_message_id: null,
            },
          },
        },
        getClient: () => ({
          user: { id: 'user1' },
        }),
      } as unknown as Channel;

      const paginator = new MessagePaginator({
        channel: channelWithReadState,
        itemIndex,
      });
      paginator.setUnreadSnapshot({
        firstUnreadMessageId: 'm-unread',
        lastReadMessageId: 'm-read',
      });

      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage();

      expect(ok).toBe(true);
      expect(jumpSpy).toHaveBeenCalledWith('m-unread', undefined);
    });

    it('can ignore snapshot and rely on channel read state only', async () => {
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read_message_id: null,
            },
          },
        },
        getClient: () => ({
          user: { id: 'user1' },
        }),
      } as unknown as Channel;

      const paginator = new MessagePaginator({
        channel: channelWithReadState,
        itemIndex,
        unreadReferencePolicy: 'read-state-only',
      });
      paginator.setUnreadSnapshot({
        firstUnreadMessageId: 'm-unread',
        lastReadMessageId: 'm-read',
      });

      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage();

      expect(ok).toBe(false);
      expect(jumpSpy).not.toHaveBeenCalled();
    });
  });

  describe('filterQueryResults()', () => {
    it('removes shadowed messages', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      let items = [createMessage({ id: 'only' })];
      expect(paginator.filterQueryResults(items)).toEqual(items);

      items = [createMessage({ id: 'only', shadowed: true })];
      expect(paginator.filterQueryResults(items)).toEqual([]);
    });
  });

  describe.todo('postQueryReconcile and deriveCursor for', () => {});
  describe('linear pagination', () => {
    describe('updates the hasMoreTail flag only if the first message on page is the first message in interval', () => {
      it('no query shape is given', () => {
        // const paginator = new MessagePaginator({ channel, itemIndex });
        // paginator.postQueryReconcile({
        //   isFirstPage: true,
        //   requestedPageSize:
        //     queryChannelsOptions?.message_limit ||
        //     DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE,
        //   results: {
        //     items: channelState.messages.map(formatMessage),
        //   },
        // });
      });
      it('and direction is "tailward"', () => {
        // const paginator = new MessagePaginator({ channel, itemIndex });
        // paginator.config.deriveCursor({
        //   direction: 'tailward',
        //   isFirstPage: true,
        //   requestedPageSize:
        //     queryChannelsOptions?.message_limit ||
        //     DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE,
        //   results: {
        //     items: channelState.messages.map(formatMessage),
        //   },
        // });
      });
      it('query shape contains "created_at_before_or_equal"', () => {});
      it('query shape contains "created_at_before"', () => {});
      it('query shape contains "id_lt"', () => {});
      it('query shape contains "id_lte"', () => {});
      it('query shape contains "offset"', () => {});
      it('contains unrecognized query shape properties only', () => {});
    });
    it('updates the hasMoreTail flag if the page is empty', () => {});

    describe('updates the hasMoreHead flag only if the last message on page is the last message in interval', () => {
      it('and direction is "headward"', () => {});
      it('query shape contains "created_at_after_or_equal"', () => {});
      it('query shape contains "created_at_after"', () => {});
      it('query shape contains "id_gt"', () => {});
      it('query shape contains "id_gte"', () => {});
      it('query shape contains "offset"', () => {});
      it('contains unrecognized query shape properties only', () => {});
    });
    it('updates the hasMoreHead flag if the page is empty', () => {});
  });

  describe('interval head/tail semantics', () => {
    it('treats interval head as the newest edge (head is last itemId)', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      const older = createMessage({
        cid: 'channel-id',
        id: 'm1',
        created_at: '2020-01-01T00:00:00.000Z',
      });
      const newer = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: '2020-01-02T00:00:00.000Z',
      });
      itemIndex.setMany([older, newer]);

      const intervalA = paginator.makeInterval({ page: [older] });
      const intervalB = paginator.makeInterval({ page: [newer] });

      // @ts-expect-error accessing protected method
      const sorted = paginator.sortIntervals([intervalA, intervalB]);
      expect(sorted[0].id).toBe(intervalB.id);
      expect(sorted[1].id).toBe(intervalA.id);
    });

    it('ingests a newer live message into the head interval (not logical tail)', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      const m1 = createMessage({
        cid: 'channel-id',
        id: 'm1',
        created_at: '2020-01-01T00:00:00.000Z',
      });
      const m2 = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: '2020-01-02T00:00:00.000Z',
      });
      paginator.setItems({
        valueOrFactory: [m1, m2],
        isFirstPage: true,
        isLastPage: true,
      });

      const m3 = createMessage({
        cid: 'channel-id',
        id: 'm3',
        created_at: '2020-01-03T00:00:00.000Z',
      });
      paginator.ingestItem(m3);

      expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

      // @ts-expect-error accessing protected storage
      expect(paginator._itemIntervals.has('__logical_tail__')).toBe(false);
      // @ts-expect-error accessing protected storage
      expect(paginator._itemIntervals.has('__logical_head__')).toBe(false);
    });
  });

  describe('jump pagination + local filtering', () => {
    it('marks jump interval as head when the newest message in the raw page is shadowed', async () => {
      // postQueryReconcile override reads `channel.getClient().user.id`
      (channel as unknown as { getClient: () => { user: { id: string } } }).getClient =
        () => ({
          user: { id: 'user1' },
        });
      // also needs read state access for first page snapshot side effects
      (channel as unknown as { state?: { read?: Record<string, unknown> } }).state = {
        read: {},
      };

      const paginator = new MessagePaginator({ channel, itemIndex });

      const m1 = createMessage({
        cid: 'channel-id',
        id: 'm1',
        created_at: '2020-01-01T00:00:00.000Z',
      });
      const m2 = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: '2020-01-02T00:00:00.000Z',
      });
      const m3 = createMessage({
        cid: 'channel-id',
        id: 'm3',
        created_at: '2020-01-03T00:00:00.000Z',
      });
      const around = createMessage({
        cid: 'channel-id',
        id: 'm4',
        created_at: '2020-01-04T00:00:00.000Z',
      });
      // newest message is shadowed -> filtered out before interval ingestion
      const newestShadowed = createMessage({
        cid: 'channel-id',
        id: 'm5',
        created_at: '2020-01-05T00:00:00.000Z',
        shadowed: true,
      });

      const { targetInterval } = await paginator.postQueryReconcile({
        isFirstPage: true,
        queryShape: { id_around: around.id, limit: 5 },
        requestedPageSize: 5,
        results: { items: [m1, m2, m3, around, newestShadowed] },
        updateState: false,
      });

      expect(targetInterval).toBeTruthy();
      expect((targetInterval as unknown as { isHead: boolean }).isHead).toBe(true);
      expect((targetInterval as unknown as { isTail: boolean }).isTail).toBe(false);
    });
  });

  it('cannot be customized', () => {
    const paginator = new MessagePaginator({ channel, itemIndex });
  });
});
