import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZERO_PAGE_CURSOR } from '../../../../src/pagination/paginators/BasePaginator';
import type { Interval } from '../../../../src/pagination/paginators/BasePaginator';
import { MessagePaginator } from '../../../../src/pagination/paginators/MessagePaginator';
import { StoreBackedItemIndex } from '../../../../src/entityStore/StoreBackedItemIndex';
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
  let itemIndex: StoreBackedItemIndex<LocalMessage>;

  beforeEach(() => {
    channel = {
      cid: 'channel-id',
      getReplies: vi.fn(),
      query: vi.fn(),
    } as unknown as Channel;
    // The paginator calls `channel.getClient().getReplies(...)`; point that at the same spy so
    // the assertions below keep reading `channel.getReplies`.
    (channel as unknown as { getClient: () => unknown }).getClient = () => channel;
    itemIndex = new StoreBackedItemIndex<LocalMessage>({
      getEntityId: (message) => message.id,
    });
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
      expect(paginator.aggregateState.getLatestValue()).toEqual({
        lastMessage: null,
        seededLastMessageAt: null,
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
      expect(paginator.sort).toEqual([{ field: 'created_at', direction: 1 }]);
      expect(paginator.config.doRequest).toBe(doRequest);
    });

    it('respects provided sort option', () => {
      const paginator = new MessagePaginator({
        channel,
        sort: [{ field: 'created_at', direction: -1 }],
      });

      expect(paginator.sort).toEqual([{ field: 'created_at', direction: -1 }]);
      expect(paginator.requestSort).toEqual([{ field: 'created_at', direction: -1 }]);
      expect(paginator.itemOrder).toEqual([{ field: 'created_at', direction: -1 }]);

      const newer = createMessage({ id: 'b', created_at: '2021-01-01T00:00:00.000Z' });
      const older = createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' });
      expect(paginator.sortComparator(older, newer)).toBeGreaterThan(0);
    });

    it('prefers requestSort over deprecated sort alias', () => {
      const paginator = new MessagePaginator({
        channel,
        requestSort: [{ field: 'created_at', direction: 1 }],
        sort: [{ field: 'created_at', direction: -1 }],
      });

      expect(paginator.requestSort).toEqual([{ field: 'created_at', direction: 1 }]);
      expect(paginator.sort).toEqual([{ field: 'created_at', direction: 1 }]);
      expect(paginator.itemOrder).toEqual([{ field: 'created_at', direction: 1 }]);
    });

    it('uses itemOrder when provided to decouple in-memory order from request sort', () => {
      const paginator = new MessagePaginator({
        channel,
        requestSort: [{ field: 'created_at', direction: -1 }],
        itemOrder: [{ field: 'created_at', direction: 1 }],
      });

      expect(paginator.requestSort).toEqual([{ field: 'created_at', direction: -1 }]);
      expect(paginator.itemOrder).toEqual([{ field: 'created_at', direction: 1 }]);
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
      expect(paginator.buildMatchFilters()).toEqual({ cid: 'channel-id' });
    });

    it('builds thread-scoped filters when parentMessageId is provided', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      expect(paginator.buildMatchFilters()).toEqual({
        cid: 'channel-id',
        parent_id: 'parent-1',
      });
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

    it('queries replies endpoint when parentMessageId is provided', async () => {
      const messages = [
        { id: 'first-reply', created_at: '2022-01-01T00:00:00.000Z' },
        { id: 'last-reply', created_at: '2022-01-02T00:00:00.000Z' },
      ];
      (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages,
      });
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      // @ts-expect-error setting protected field for test coverage
      paginator._nextQueryShape = { id_gt: 'from-cursor', limit: 30 };

      const result = await paginator.query({});

      expect(channel.getReplies).toHaveBeenCalledWith({
        parent_id: 'parent-1',
        id_gt: 'from-cursor',
        limit: 30,
        sort: [{ field: 'created_at', direction: 1 }],
      });
      expect(channel.query).not.toHaveBeenCalled();
      expect(result.tailward).toBe('first-reply');
      expect(result.headward).toBe('last-reply');
      expect(result.items[0].created_at).toBeInstanceOf(Date);
      expect(result.items[1].created_at).toBeInstanceOf(Date);
    });

    it('keeps items ordered chronologically when itemOrder is ascending and request sort is descending', async () => {
      const messages = [
        { id: 'newest-reply', created_at: '2022-01-03T00:00:00.000Z' },
        { id: 'middle-reply', created_at: '2022-01-02T00:00:00.000Z' },
        { id: 'oldest-reply', created_at: '2022-01-01T00:00:00.000Z' },
      ];
      (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages,
      });
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
        requestSort: [{ field: 'created_at', direction: -1 }],
        itemOrder: [{ field: 'created_at', direction: 1 }],
      });
      // @ts-expect-error setting protected field for test coverage
      paginator._nextQueryShape = { id_gt: 'from-cursor', limit: 30 };

      const result = await paginator.query({});

      expect(channel.getReplies).toHaveBeenCalledWith({
        parent_id: 'parent-1',
        id_gt: 'from-cursor',
        limit: 30,
        sort: [{ field: 'created_at', direction: -1 }],
      });
      expect(result.items.map((message) => message.id)).toEqual([
        'oldest-reply',
        'middle-reply',
        'newest-reply',
      ]);
      expect(result.tailward).toBe('oldest-reply');
      expect(result.headward).toBe('newest-reply');
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

    it('emits merged state when jump resolves inside the active interval', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const existing = createMessage({
        cid: 'channel-id',
        id: 'm-existing',
        created_at: '2020-01-01T00:00:00.000Z',
      });
      const target = createMessage({
        cid: 'channel-id',
        id: 'm-target',
        created_at: '2020-01-02T00:00:00.000Z',
      });

      const activeInterval = paginator.ingestPage({
        page: [existing],
        isHead: true,
        isTail: true,
        setActive: true,
      });

      const partialNextSpy = vi.spyOn(paginator.state, 'partialNext');
      vi.spyOn(paginator, 'executeQuery').mockImplementation(async () => {
        itemIndex.setOne(target);
        if (activeInterval?.itemIds) {
          activeInterval.itemIds = [existing.id, target.id];
        }
        return {
          stateCandidate: {
            hasMoreHead: false,
            hasMoreTail: false,
            items: [existing, target],
            isLoading: false,
          },
          targetInterval: activeInterval ?? null,
        };
      });

      const ok = await paginator.jumpToMessage(target.id);

      expect(ok).toBe(true);
      expect(partialNextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ id: existing.id }),
            expect.objectContaining({ id: target.id }),
          ]),
        }),
      );
      expect(paginator.items?.map((m) => m.id)).toEqual([existing.id, target.id]);
    });

    it('does not weld a disjoint id_around jump into the loaded head (no missing middle)', async () => {
      const mk = (id: string, day: string) =>
        createMessage({
          cid: 'channel-id',
          id,
          created_at: `2020-01-${day}T00:00:00.000Z`,
        });
      const paginator = new MessagePaginator({ channel, itemIndex });
      // Head loaded; older messages still available (isTail:false) → a real gap exists below it.
      paginator.ingestPage({
        page: [mk('m8', '08'), mk('m9', '09'), mk('m10', '10')],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      // Jump to an OLD message that is NOT loaded; the id_around query returns a disjoint older
      // window (gap m4-m7 between it and the loaded head).
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        user: undefined,
        notifications: { addError: () => {} },
        getReplies: channel.getReplies,
      });
      (channel.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [
          generateMsg({ id: 'm1', created_at: '2020-01-01T00:00:00.000Z' }),
          generateMsg({ id: 'm2', created_at: '2020-01-02T00:00:00.000Z' }),
          generateMsg({ id: 'm3', created_at: '2020-01-03T00:00:00.000Z' }),
        ],
      });

      await paginator.jumpToMessage('m2');

      // The jumped window and the head must stay SEPARATE intervals, not welded across the gap.
      expect(paginator.itemIntervals.length).toBe(2);
      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('can re-jump to the same message after jumping back to the latest (regression)', async () => {
      const mk = (id: string, day: string) =>
        createMessage({
          cid: 'channel-id',
          id,
          created_at: `2020-01-${day}T00:00:00.000Z`,
        });
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestPage({
        page: [mk('m8', '08'), mk('m9', '09'), mk('m10', '10')],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        user: undefined,
        notifications: { addError: () => {} },
        getReplies: channel.getReplies,
      });
      (channel.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [
          generateMsg({ id: 'm1', created_at: '2020-01-01T00:00:00.000Z' }),
          generateMsg({ id: 'm2', created_at: '2020-01-02T00:00:00.000Z' }),
          generateMsg({ id: 'm3', created_at: '2020-01-03T00:00:00.000Z' }),
        ],
      });

      // 1) jump to an old message
      expect(await paginator.jumpToMessage('m2')).toBe(true);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

      // 2) jump back to the latest (scroll-to-bottom button)
      await paginator.jumpToTheLatestMessage();
      expect(paginator.items?.map((m) => m.id)).toEqual(['m8', 'm9', 'm10']);

      // 3) jump to the SAME old message again - must work, not no-op
      expect(await paginator.jumpToMessage('m2')).toBe(true);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    });
  });

  describe('jumpToTheLatestMessage', () => {
    it('jumps to the newest loaded message when the head is already loaded (no query)', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      const m1 = createMessage({ id: 'm1', created_at: '2020-01-01T00:00:00.000Z' });
      const m2 = createMessage({ id: 'm2', created_at: '2020-01-02T00:00:00.000Z' });
      paginator.ingestPage({
        page: [m1, m2],
        isHead: true,
        isTail: true,
        setActive: true,
      });

      const result = await paginator.jumpToTheLatestMessage();

      expect(result).toBe(true);
      expect(channel.getReplies).not.toHaveBeenCalled();
      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2']);
    });

    it('loads and anchors the real head when only live content is loaded', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      // Only live-ingested content: a logical head, nothing anchored (a thread created this session).
      paginator.ingestItem(
        createMessage({
          id: 'mine',
          cid: 'channel-id',
          parent_id: 'parent-1',
          created_at: '2020-01-05T00:00:00.000Z',
        }),
      );
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        user: undefined,
        getReplies: channel.getReplies,
      });
      (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [
          createMessage({
            id: 'mine',
            cid: 'channel-id',
            parent_id: 'parent-1',
            created_at: '2020-01-05T00:00:00.000Z',
          }),
          createMessage({
            id: 'peer',
            cid: 'channel-id',
            parent_id: 'parent-1',
            created_at: '2020-01-06T00:00:00.000Z',
          }),
        ],
      });

      const result = await paginator.jumpToTheLatestMessage();

      // One headward query anchors the real head, so scroll-to-bottom out of an un-anchored window
      // lands on the true newest messages rather than the lone live item. Self-correcting.
      expect(result).toBe(true);
      expect(channel.getReplies).toHaveBeenCalledTimes(1);
      expect(paginator.items?.map((i) => i.id)).toEqual(['mine', 'peer']);
    });

    it('succeeds when a headward query hits the dataset edge (empty) - "all loaded" case', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      const m4 = createMessage({ id: 'm4', created_at: '2020-01-04T00:00:00.000Z' });
      const m5 = createMessage({ id: 'm5', created_at: '2020-01-05T00:00:00.000Z' });
      // A non-head window is active (as after jumping to an older message) with a headward cursor,
      // so the "load newer" query is cursor-based (an incremental load, not a first-page reset).
      paginator.ingestPage({
        page: [m4, m5],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      paginator.state.partialNext({
        cursor: { headward: 'm5', tailward: 'm4' },
        hasMoreHead: true,
      });
      expect((paginator.itemIntervals[0] as unknown as { isHead: boolean }).isHead).toBe(
        false,
      );
      // postQueryReconcile reads the client to take an unread snapshot; no user => snapshot skipped.
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        user: undefined,
        getReplies: channel.getReplies,
      });
      // No newer messages exist on the server → the headward query returns an empty page.
      (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
      });

      const result = await paginator.jumpToTheLatestMessage();

      // The empty edge response flags the active interval as the head, so the newest loaded message
      // (m5) is the latest and the jump succeeds - no "Jump to latest message unsuccessful" error.
      expect(result).toBe(true);
      expect((paginator.itemIntervals[0] as unknown as { isHead: boolean }).isHead).toBe(
        true,
      );
      expect(paginator.items?.map((message) => message.id)).toEqual(['m4', 'm5']);
    });
  });

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
      expect(jumpSpy).toHaveBeenCalledWith(
        'm-unread',
        expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
      );
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

    it('falls back to created_at_around query when unread ids are missing and lastReadAt exists', async () => {
      const lastReadAt = new Date('2021-01-02T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: lastReadAt,
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
      const executeQuerySpy = vi.spyOn(paginator, 'executeQuery').mockResolvedValue({
        stateCandidate: {
          items: [
            createMessage({ created_at: '2021-01-01T00:00:00.000Z', id: 'm-read' }),
            createMessage({ created_at: '2021-01-03T00:00:00.000Z', id: 'm-unread' }),
          ],
        },
        targetInterval: null,
      });
      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage({ pageSize: 25 });

      expect(ok).toBe(true);
      expect(executeQuerySpy).toHaveBeenCalledWith({
        queryShape: { created_at_around: lastReadAt, limit: 25 },
        updateState: false,
      });
      expect(jumpSpy).toHaveBeenCalledWith(
        'm-unread',
        expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
      );
      // The inferred boundary is NOT persisted into the snapshot (persisting firstUnreadMessageId
      // would look like an explicit mark-unread and suppress auto-mark-read).
      expect(paginator.unreadStateSnapshot.getLatestValue()).toEqual({
        firstUnreadMessageId: null,
        lastReadAt: null,
        lastReadMessageId: null,
        unreadCount: 0,
      });
    });

    it('jumps to the first unread message when the queried page starts after lastReadAt', async () => {
      const lastReadAt = new Date('2021-01-01T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: lastReadAt,
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
      vi.spyOn(paginator, 'executeQuery').mockResolvedValue({
        stateCandidate: {
          items: [
            createMessage({
              created_at: '2021-01-02T00:00:00.000Z',
              id: 'm-first-unread',
            }),
            createMessage({
              created_at: '2021-01-03T00:00:00.000Z',
              id: 'm-newer-unread',
            }),
          ],
        },
        targetInterval: null,
      });
      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage();

      expect(ok).toBe(true);
      expect(jumpSpy).toHaveBeenCalledWith(
        'm-first-unread',
        expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
      );
      // Not persisted — see note above.
      expect(paginator.unreadStateSnapshot.getLatestValue()).toEqual({
        firstUnreadMessageId: null,
        lastReadAt: null,
        lastReadMessageId: null,
        unreadCount: 0,
      });
    });

    it('infers the first unread from the already-loaded window (no query) and jumps to it, not the last read message', async () => {
      const lastReadAt = new Date('2021-01-02T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: lastReadAt,
              last_read_message_id: 'm-read',
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
      // Loaded newest window straddles the last-read boundary (some read, some unread) — the common
      // "a few unreads at the bottom" case where no extra request is needed.
      paginator.state.partialNext({
        items: [
          createMessage({ created_at: '2021-01-01T00:00:00.000Z', id: 'm-read' }),
          createMessage({ created_at: '2021-01-03T00:00:00.000Z', id: 'm-unread' }),
        ],
      });
      const executeQuerySpy = vi.spyOn(paginator, 'executeQuery');
      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage();

      expect(ok).toBe(true);
      // No extra network round trip — the loaded window already straddles the boundary.
      expect(executeQuerySpy).not.toHaveBeenCalled();
      // Lands ON (and highlights) the first unread message, not the last read one.
      expect(jumpSpy).toHaveBeenCalledWith(
        'm-unread',
        expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
      );
      // The inferred boundary is NOT written back to the snapshot.
      expect(paginator.unreadStateSnapshot.getLatestValue()).toEqual({
        firstUnreadMessageId: null,
        lastReadAt: null,
        lastReadMessageId: null,
        unreadCount: 0,
      });
    });

    it('re-seeds the unread snapshot from the current read state on demand (reopen from cache)', () => {
      const lastReadAt = new Date('2021-05-01T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: lastReadAt,
              last_read_message_id: 'm-42',
              unread_messages: 3,
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
      // Simulate a stale snapshot frozen from a previous open (e.g. an explicit mark-unread).
      paginator.setUnreadSnapshot({
        firstUnreadMessageId: 'stale-old-id',
        lastReadAt: new Date('2020-01-01T00:00:00.000Z'),
        lastReadMessageId: 'stale-old-id',
        unreadCount: 99,
      });

      paginator.seedUnreadSnapshot();

      expect(paginator.unreadStateSnapshot.getLatestValue()).toEqual({
        firstUnreadMessageId: null,
        lastReadAt,
        lastReadMessageId: 'm-42',
        unreadCount: 3,
      });
    });

    it('falls back to jumping to the last read message when no last-read timestamp is available', async () => {
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: undefined,
              last_read_message_id: 'm-read',
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
      const executeQuerySpy = vi.spyOn(paginator, 'executeQuery');
      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage();

      expect(ok).toBe(true);
      expect(executeQuerySpy).not.toHaveBeenCalled();
      expect(jumpSpy).toHaveBeenCalledWith(
        'm-read',
        expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
      );
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

  describe('messageFocusSignal', () => {
    it('emits focus signal with unique token and does not auto-dismiss', async () => {
      vi.useFakeTimers();
      const paginator = new MessagePaginator({ channel, itemIndex });

      const first = paginator.emitMessageFocusSignal({
        messageId: 'm1',
        reason: 'jump-to-message',
        ttlMs: 3000,
      });
      const second = paginator.emitMessageFocusSignal({
        messageId: 'm1',
        reason: 'jump-to-message',
        ttlMs: 3000,
      });

      expect(second.token).toBeGreaterThan(first.token);
      expect(paginator.messageFocusSignal.getLatestValue().signal?.token).toBe(
        second.token,
      );

      // The dismissal countdown is not started on emit — it must be scheduled explicitly once the
      // message is viewed, so a signal emitted while its list is hidden survives until then.
      vi.advanceTimersByTime(10000);
      expect(paginator.messageFocusSignal.getLatestValue().signal?.token).toBe(
        second.token,
      );
      vi.useRealTimers();
    });

    it('starts the dismissal countdown from scheduleMessageFocusSignalClear (viewed moment)', async () => {
      vi.useFakeTimers();
      const paginator = new MessagePaginator({ channel, itemIndex });

      const signal = paginator.emitMessageFocusSignal({
        messageId: 'm1',
        reason: 'jump-to-message',
        ttlMs: 3000,
      });

      // Time can pass while the message is off-screen without dismissing it.
      vi.advanceTimersByTime(5000);
      expect(paginator.messageFocusSignal.getLatestValue().signal).not.toBe(null);

      // Once viewed, the TTL is measured from this moment.
      paginator.scheduleMessageFocusSignalClear({ token: signal.token });
      vi.advanceTimersByTime(2999);
      expect(paginator.messageFocusSignal.getLatestValue().signal?.token).toBe(
        signal.token,
      );
      vi.advanceTimersByTime(1);
      expect(paginator.messageFocusSignal.getLatestValue().signal).toBe(null);
      vi.useRealTimers();
    });

    it('scheduleMessageFocusSignalClear is a no-op for a stale token', async () => {
      vi.useFakeTimers();
      const paginator = new MessagePaginator({ channel, itemIndex });

      paginator.emitMessageFocusSignal({
        messageId: 'm1',
        reason: 'jump-to-message',
        ttlMs: 3000,
      });
      const current = paginator.emitMessageFocusSignal({
        messageId: 'm2',
        reason: 'jump-to-message',
        ttlMs: 3000,
      });

      // A schedule request carrying a superseded token must not dismiss the current signal.
      paginator.scheduleMessageFocusSignalClear({ token: current.token - 1 });
      vi.advanceTimersByTime(3000);
      expect(paginator.messageFocusSignal.getLatestValue().signal?.token).toBe(
        current.token,
      );
      vi.useRealTimers();
    });
  });

  describe('applyMessageDeletionForUser()', () => {
    it('soft deletes user messages and quoted messages in paginator items', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const deletedAt = new Date('2025-02-01T14:01:30.000Z');

      const bannedUser = { id: 'banned-user' };
      const otherUser = { id: 'other-user' };
      const bannedMessage = createMessage({ id: 'banned-message', user: bannedUser });
      const quoteCarrier = createMessage({
        id: 'quote-carrier',
        quoted_message: bannedMessage,
        quoted_message_id: bannedMessage.id,
        user: otherUser,
      });

      paginator.setItems({
        valueOrFactory: [bannedMessage, quoteCarrier],
        isFirstPage: true,
        isLastPage: true,
      });

      paginator.applyMessageDeletionForUser({
        userId: bannedUser.id,
        hardDelete: false,
        deletedAt,
      });

      const deletedFromPaginator = paginator.getItem(bannedMessage.id);
      expect(deletedFromPaginator?.type).toBe('deleted');
      expect(deletedFromPaginator?.deleted_at?.toISOString()).toBe(
        deletedAt.toISOString(),
      );

      const quoteCarrierFromPaginator = paginator.getItem(quoteCarrier.id);
      expect(quoteCarrierFromPaginator?.quoted_message?.type).toBe('deleted');
      expect(quoteCarrierFromPaginator?.quoted_message?.deleted_at?.toISOString()).toBe(
        deletedAt.toISOString(),
      );
    });

    it('hard deletes user messages and marks quoted messages as deleted', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const deletedAt = new Date('2025-02-01T14:01:30.000Z');

      const bannedUser = { id: 'banned-user' };
      const otherUser = { id: 'other-user' };
      const bannedMessage = createMessage({
        id: 'banned-message-hard',
        user: bannedUser,
      });
      const quoteCarrier = createMessage({
        id: 'quote-carrier-hard',
        quoted_message: bannedMessage,
        quoted_message_id: bannedMessage.id,
        user: otherUser,
      });

      paginator.setItems({
        valueOrFactory: [bannedMessage, quoteCarrier],
        isFirstPage: true,
        isLastPage: true,
      });

      paginator.applyMessageDeletionForUser({
        userId: bannedUser.id,
        hardDelete: true,
        deletedAt,
      });

      expect(paginator.items?.find((m) => m.id === bannedMessage.id)).toBeUndefined();

      const quoteCarrierFromPaginator = paginator.getItem(quoteCarrier.id);
      expect(quoteCarrierFromPaginator?.quoted_message?.type).toBe('deleted');
      expect(quoteCarrierFromPaginator?.quoted_message?.deleted_at?.toISOString()).toBe(
        deletedAt.toISOString(),
      );
    });
  });

  describe('reflectQuotedMessageUpdate()', () => {
    it('updates quoted_message for cached items that quote provided message', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const quoted = createMessage({
        id: 'quoted-1',
        text: 'before update',
      });
      const quoteCarrier = createMessage({
        id: 'carrier-1',
        quoted_message_id: quoted.id,
        quoted_message: quoted,
      });
      const nonCarrier = createMessage({
        id: 'other-1',
        quoted_message_id: 'another-quoted-id',
      });

      paginator.setItems({
        valueOrFactory: [quoted, quoteCarrier, nonCarrier],
        isFirstPage: true,
        isLastPage: true,
      });

      const updatedQuoted = {
        ...quoted,
        text: 'after update',
      };
      paginator.reflectQuotedMessageUpdate(updatedQuoted);

      expect(paginator.getItem(quoteCarrier.id)?.quoted_message?.text).toBe(
        'after update',
      );
      expect(paginator.getItem(nonCarrier.id)?.quoted_message).toBeUndefined();
    });
  });

  describe('reflectUserUpdate()', () => {
    it('patches the user on cached messages authored by the user and re-emits the active window', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const byA1 = createMessage({
        id: 'a1',
        user: { id: 'A' },
        created_at: '2021-01-01T00:00:00.000Z',
      });
      const byB = createMessage({
        id: 'b1',
        user: { id: 'B' },
        created_at: '2021-01-02T00:00:00.000Z',
      });
      const byA2 = createMessage({
        id: 'a2',
        user: { id: 'A' },
        created_at: '2021-01-03T00:00:00.000Z',
      });

      paginator.setItems({
        valueOrFactory: [byA1, byB, byA2],
        isFirstPage: true,
        isLastPage: true,
      });

      paginator.reflectUserUpdate({ id: 'A', name: 'Renamed A' });

      expect(paginator.getItem('a1')?.user?.name).toBe('Renamed A');
      expect(paginator.getItem('a2')?.user?.name).toBe('Renamed A');
      expect(paginator.getItem('b1')?.user?.name).not.toBe('Renamed A');
      // the active window is re-emitted with the updated user object
      expect(paginator.items?.find((m) => m.id === 'a1')?.user?.name).toBe('Renamed A');
    });
  });

  describe('reflectReaction()', () => {
    const currentUserId = 'me';
    const reaction = (type: string, userId: string) => ({
      created_at: '2021-01-01T00:00:00.000Z',
      message_id: 'r1',
      type,
      user_id: userId,
    });

    beforeEach(() => {
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        userID: currentUserId,
        getReplies: channel.getReplies,
      });
    });

    const seed = (
      paginator: MessagePaginator,
      ownReactions: ReturnType<typeof reaction>[],
    ) => {
      paginator.setItems({
        valueOrFactory: [
          createMessage({
            created_at: '2021-01-01T00:00:00.000Z',
            id: 'r1',
            latest_reactions: ownReactions,
            own_reactions: ownReactions,
          }),
        ],
        isFirstPage: true,
        isLastPage: true,
      });
    };

    it("preserves the current user's own_reactions when another user reacts", () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      seed(paginator, [reaction('love', currentUserId)]);

      paginator.reflectReaction({
        message: createMessage({
          id: 'r1',
          // server event omits our own_reactions and carries the merged groups
          own_reactions: [],
          reaction_groups: {
            like: { count: 1, sum_scores: 1 } as never,
            love: { count: 1, sum_scores: 1 } as never,
          },
        }),
        reaction: reaction('like', 'other'),
      });

      const updated = paginator.getItem('r1');
      expect(updated?.own_reactions?.map((r) => r.type)).toEqual(['love']);
      // the event's server-computed reaction_groups are applied as-is
      expect(updated?.reaction_groups?.like).toBeDefined();
    });

    it("adds the current user's reaction to own_reactions", () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      seed(paginator, []);

      paginator.reflectReaction({
        message: createMessage({ id: 'r1' }),
        reaction: reaction('love', currentUserId),
      });

      expect(paginator.getItem('r1')?.own_reactions?.map((r) => r.type)).toEqual([
        'love',
      ]);
    });

    it('removes the reaction from own_reactions on reaction.deleted', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      seed(paginator, [reaction('love', currentUserId)]);

      paginator.reflectReaction({
        message: createMessage({ id: 'r1', own_reactions: [] }),
        reaction: reaction('love', currentUserId),
        removed: true,
      });

      expect(paginator.getItem('r1')?.own_reactions ?? []).toEqual([]);
    });

    it('does not add another user reaction to own_reactions', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      seed(paginator, []);

      paginator.reflectReaction({
        message: createMessage({ id: 'r1' }),
        reaction: reaction('love', 'other'),
      });

      expect(paginator.getItem('r1')?.own_reactions ?? []).toEqual([]);
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

  describe('seedFirstPageSync()', () => {
    const msg = (id: string, day: string) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: `2020-01-${day}T00:00:00.000Z`,
      });

    it('seeds a latest page as the head window (nothing newer to load)', () => {
      // First-page reconcile reads the client for the unread snapshot; no user => snapshot skipped.
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        user: undefined,
        getReplies: channel.getReplies,
      });
      const paginator = new MessagePaginator({ channel, itemIndex });
      // Fewer messages than the requested page size => dataset edges reached both ways.
      paginator.seedFirstPageSync([msg('m8', '08'), msg('m9', '09')], 100);

      expect(paginator.headmostItem?.id).toBe('m9');
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.hasMoreTail).toBe(false);
    });

    it('seeds an around/jump open as a middle window, not the head', () => {
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        user: undefined,
        getReplies: channel.getReplies,
      });
      const paginator = new MessagePaginator({ channel, itemIndex });
      // A full page centered on m6: messages exist on both sides beyond this window, so the
      // paginator must NOT flag it as the latest (head) page — regression for a channel opened
      // via `messages: { id_around }` rather than the latest page.
      paginator.seedFirstPageSync(
        [
          msg('m4', '04'),
          msg('m5', '05'),
          msg('m6', '06'),
          msg('m7', '07'),
          msg('m8', '08'),
        ],
        5,
        { id_around: 'm6' },
      );

      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
    });
  });

  describe('latest window, truncation & live message routing', () => {
    const msg = (id: string, day: string) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: `2020-01-${day}T00:00:00.000Z`,
      });

    describe('headItems / headmostItem', () => {
      it('reflect the active head window', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m8', 'm9']);
        expect(paginator.headItems.map((m) => m.id)).toEqual(['m8', 'm9']);
        expect(paginator.headmostItem?.id).toBe('m9');
      });

      it('reflect the head window even while an older window is active (after a jump)', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          setActive: false,
        });
        // an older, disjoint window is now the active one
        paginator.ingestPage({
          page: [msg('m4', '04'), msg('m5', '05')],
          setActive: true,
        });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m4', 'm5']); // active window
        expect(paginator.headItems.map((m) => m.id)).toEqual(['m8', 'm9']); // newest window
        expect(paginator.headmostItem?.id).toBe('m9');
      });

      it('return the newest loaded window even when it is not flagged isHead (query/hydration seed)', () => {
        // The query/hydration seed does not reliably mark a latest page as isHead, so headItems
        // uses the head-most *loaded* window rather than requiring the flag.
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m4', '04'), msg('m5', '05')],
          setActive: true,
        });

        expect(paginator.headItems.map((m) => m.id)).toEqual(['m4', 'm5']);
        expect(paginator.headmostItem?.id).toBe('m5');
      });

      it('are empty when nothing is loaded', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        expect(paginator.headItems).toEqual([]);
        expect(paginator.headmostItem).toBeUndefined();
      });
    });

    describe('truncate()', () => {
      it('drops messages strictly older than truncated_at and keeps the rest', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m5', '05'), msg('m9', '09')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.truncate({ truncatedAt: new Date('2020-01-05T00:00:00.000Z') });

        // m1 dropped; m5 kept (equal, not strictly older); m9 kept
        expect(paginator.items?.map((m) => m.id)).toEqual(['m5', 'm9']);
        expect(paginator.getItem('m1')).toBeUndefined();
        expect(paginator.getItem('m5')).toBeTruthy();
      });

      it('marks the interval that spanned the cutoff as the new tail', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // isHead but NOT isTail → hasMoreTail starts true
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m5', '05'), msg('m9', '09')],
          isHead: true,
          setActive: true,
        });
        expect(paginator.hasMoreTail).toBe(true);

        paginator.truncate({ truncatedAt: new Date('2020-01-05T00:00:00.000Z') });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m5', 'm9']);
        // it lost its oldest member → nothing older remains → it is now the tail
        expect(paginator.hasMoreTail).toBe(false);
      });

      it('leaves an interval that did not span the cutoff untouched (keeps hasMoreTail)', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // active newer window, not a tail (older messages may still be unloaded)
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          setActive: true,
        });
        // a separate, older, disjoint window
        paginator.ingestPage({ page: [msg('m2', '02'), msg('m3', '03')] });

        paginator.truncate({ truncatedAt: new Date('2020-01-05T00:00:00.000Z') });

        // the older window was entirely older than the cutoff → dropped
        expect(paginator.getItem('m2')).toBeUndefined();
        expect(paginator.getItem('m3')).toBeUndefined();
        // the active (newer) window did not span the cutoff → unchanged, still expects older pages
        expect(paginator.items?.map((m) => m.id)).toEqual(['m8', 'm9']);
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('re-emits the active window only once (batched)', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02'), msg('m3', '03'), msg('m9', '09')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        const partialNextSpy = vi.spyOn(paginator.state, 'partialNext');
        paginator.truncate({ truncatedAt: new Date('2020-01-05T00:00:00.000Z') });

        // three messages removed, but a single state emission
        expect(paginator.items?.map((m) => m.id)).toEqual(['m9']);
        expect(partialNextSpy).toHaveBeenCalledTimes(1);
      });

      it('activates the surviving window instead of blanking when the active window is truncated away', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // a surviving newer window
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          setActive: false,
        });
        // the active window is an older, disjoint one
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          setActive: true,
        });
        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2']);

        paginator.truncate({ truncatedAt: new Date('2020-01-05T00:00:00.000Z') });

        // active window removed entirely, but we show the surviving window — NOT an empty list
        expect(paginator.getItem('m1')).toBeUndefined();
        expect(paginator.items?.map((m) => m.id)).toEqual(['m8', 'm9']);
      });

      it('falls back to the nearest (tail-most) surviving window when several survive', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          setActive: false,
        });
        paginator.ingestPage({
          page: [msg('m5', '05'), msg('m6', '06')],
          setActive: false,
        });
        // active is the oldest window
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          setActive: true,
        });

        paginator.truncate({ truncatedAt: new Date('2020-01-04T00:00:00.000Z') });

        // active [m1,m2] removed; nearest survivor to where it was = the oldest survivor [m5,m6]
        expect(paginator.items?.map((m) => m.id)).toEqual(['m5', 'm6']);
      });

      it('splits at the correct point with duplicate timestamps at the boundary', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [
            msg('m1', '01'),
            msg('m3a', '03'),
            msg('m3b', '03'),
            msg('m5', '05'),
            msg('m7', '07'),
          ],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        // cutoff 04: everything strictly older (m1, both m3*) dropped; m5, m7 kept
        paginator.truncate({ truncatedAt: new Date('2020-01-04T00:00:00.000Z') });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m5', 'm7']);
        expect(paginator.getItem('m3b')).toBeUndefined();
      });

      it('is a no-op for an invalid cutoff date', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m1', '01')],
          isHead: true,
          isTail: true,
          setActive: true,
        });
        const partialNextSpy = vi.spyOn(paginator.state, 'partialNext');

        paginator.truncate({ truncatedAt: new Date('not-a-date') });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m1']);
        expect(partialNextSpy).not.toHaveBeenCalled();
      });
    });

    describe('message.new routing (replaces the isUpToDate flag)', () => {
      it('appends a newer message when the head window is active', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.ingestItem(msg('m3', '03'));

        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
        expect(paginator.headmostItem?.id).toBe('m3');
      });

      it('does not inject a newer message into an older active window (viewer scrolled away)', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          setActive: false,
        });
        paginator.ingestPage({
          page: [msg('m4', '04'), msg('m5', '05')],
          setActive: true,
        });

        paginator.ingestItem(msg('m10', '10'));

        // the viewed (older) window is unchanged — the new message is not pushed onto it
        expect(paginator.items?.map((m) => m.id)).toEqual(['m4', 'm5']);
      });
    });
  });

  describe('mergeNewestPage()', () => {
    const m = (id: string, day: string, overrides: Partial<MessageResponse> = {}) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: `2020-01-${day}T00:00:00.000Z`,
        ...overrides,
      });

    // Loads a newest (head-anchored) window. `isTail` controls whether older items remain:
    // isTail:false => older loadable (hasMoreTail true); isTail:true => complete (hasMoreTail false).
    const setupLoadedHead = ({ isTail }: { isTail: boolean }) => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      const m1 = m('m1', '01');
      const m2 = m('m2', '02');
      const m3 = m('m3', '03', { text: 'original' });
      paginator.ingestPage({ page: [m1, m2, m3], isHead: true, isTail, setActive: true });
      return { paginator, m1, m2, m3 };
    };

    it('reconciles in-place edits and appends new messages without a query', () => {
      const { paginator, m1, m2 } = setupLoadedHead({ isTail: true });
      // While offline: m3 was edited and m4/m5 arrived; the hydrated newest window carries both.
      const editedM3 = m('m3', '03', { text: 'edited' });
      const m4 = m('m4', '04');
      const m5 = m('m5', '05');

      paginator.mergeNewestPage([m1, m2, editedM3, m4, m5]);

      expect(paginator.items?.map((message) => message.id)).toEqual([
        'm1',
        'm2',
        'm3',
        'm4',
        'm5',
      ]);
      expect(paginator.getItem('m3')?.text).toBe('edited');
      // No network — the caller already holds the page.
      expect(channel.getReplies).not.toHaveBeenCalled();
    });

    it('does not blank the list when the page is empty (never wipes)', () => {
      const { paginator } = setupLoadedHead({ isTail: true });
      let sawUndefinedItems = false;
      const unsubscribe = paginator.state.subscribe((state) => {
        if (typeof state.items === 'undefined') sawUndefinedItems = true;
      });

      paginator.mergeNewestPage([]);
      unsubscribe();

      expect(sawUndefinedItems).toBe(false);
      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('keeps hasMoreTail and anchors the tail cursor to the loaded oldest when merging a partial newest window', () => {
      // Only the newest window is loaded and older items still exist (hasMoreTail true). A live partial
      // merge passes no requestedLimit, so the flag stays conservative (true) — hasMoreTail is only ever
      // lowered by a caller-supplied requestedLimit bounded by pageSize that comes back short. Here it
      // stays true and the cursor anchors to the loaded oldest (m1) — the correct "load older" anchor.
      const { paginator, m1, m2 } = setupLoadedHead({ isTail: false });
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);

      const editedM3 = m('m3', '03', { text: 'edited' });
      paginator.mergeNewestPage([m1, m2, editedM3]);

      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe('m1');
      expect(paginator.getItem('m3')?.text).toBe('edited');
    });

    it('resets to the fetched window when it is DISJOINT from the loaded head (>= a page arrived while away)', () => {
      const { paginator } = setupLoadedHead({ isTail: false });
      // A newest window that shares NO id with the loaded [m1,m2,m3]: more than a page arrived while
      // offline, so there is a gap between the loaded set and this window. Merging would silently
      // weld across the gap (dropping the in-between messages); instead we reset to this window.
      const m10 = m('m10', '10');
      const m11 = m('m11', '11');
      const m12 = m('m12', '12');

      paginator.mergeNewestPage([m10, m11, m12]);

      const state = paginator.state.getLatestValue();
      // The list is the fresh contiguous window — no silent gap, stale older items dropped from view.
      expect(state.items?.map((message) => message.id)).toEqual(['m10', 'm11', 'm12']);
      // A single interval (no gap-weld), at the newest, with older still loadable...
      expect(paginator.itemIntervals).toHaveLength(1);
      expect(state.hasMoreHead).toBe(false);
      expect(state.hasMoreTail).toBe(true);
      // ...and the cursor is re-anchored to this window's oldest item, so "load older" continues
      // contiguously from here (id_lt m10) and refills the gap instead of skipping it.
      expect(state.cursor?.tailward).toBe('m10');
    });

    it('sets hasMoreHead false after merging the head window', () => {
      const { paginator } = setupLoadedHead({ isTail: false });

      paginator.mergeNewestPage([m('m4', '04')]);

      expect(paginator.state.getLatestValue().hasMoreHead).toBe(false);
    });

    it('is a no-op when the newest slice is not loaded (not anchored at head)', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      paginator.ingestPage({
        page: [m('m4', '04'), m('m5', '05')],
        isHead: false,
        isTail: false,
        setActive: true,
      });

      paginator.mergeNewestPage([m('m6', '06')]);

      // m6 not merged; the loaded window is unchanged.
      expect(paginator.items?.map((message) => message.id)).toEqual(['m4', 'm5']);
      expect(paginator.getItem('m6')).toBeUndefined();
    });

    it('anchors a newest page beside a middle island without welding it or stealing the view', () => {
      // The branch's entry condition in its riskiest shape: only a middle island loaded, plus a live
      // arrival — logical head, no anchored head. Must not weld across the gap or move the reader.
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      paginator.ingestPage({
        page: [m('m4', '04'), m('m5', '05')],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      // Arrived live while the reader sits on the middle island → logical head.
      paginator.ingestItem(m('live', '20', { parent_id: 'parent-1' }));

      paginator.mergeNewestPage([m('m30', '30'), m('m31', '31')]);

      // Reader stays put; the page is anchored as its own island for their return, not welded in.
      expect(paginator.items?.map((message) => message.id)).toEqual(['m4', 'm5']);
      expect(paginator.getItem('m30')).toBeDefined();
    });

    it('never strands a live item that is older than the fetched page', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      // Unsent local message, older than anything the server has.
      paginator.ingestItem(m('local-old', '01', { parent_id: 'parent-1' }));
      // Newest page, short — so it reads as "reached the start" — and all newer than local-old.
      paginator.mergeNewestPage([m('s1', '05'), m('s2', '06')]);

      // The worry was that anchoring a SHORT page (which looks like "reached the channel start")
      // while holding an older live item would strand it: invisible, with "load older" switched off
      // so it could never be reached. It does not — the item stays indexed and the tail stays open.
      // The worry: a short page reads as "reached the start", so an older live item could be dropped
      // from view AND cut off by "load older" being disabled. It is not — still indexed, tail open.
      expect(paginator.items?.map((i) => i.id)).toEqual(['s1', 's2']);
      expect(paginator.getItem('local-old')).toBeDefined();
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
    });

    it('keeps a live item that arrived during the fetch, alongside the anchored page', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      // Two live items: one the page also has, one that arrived DURING the fetch (newer).
      paginator.ingestItem(m('mine', '05', { parent_id: 'parent-1' }));
      paginator.ingestItem(m('during-fetch', '30', { parent_id: 'parent-1' }));

      paginator.mergeNewestPage([m('mine', '05'), m('s2', '06')]);

      // The fold absorbs the shared item and keeps the newer one above the page rather than losing
      // it. `hasMoreHead` false because the head is now anchored.
      expect(paginator.items?.map((i) => i.id)).toEqual(['mine', 's2', 'during-fetch']);
      expect(paginator.state.getLatestValue().hasMoreHead).toBe(false);
    });

    it('is a no-op when nothing is loaded', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });

      paginator.mergeNewestPage([m('m1', '01')]);

      expect(paginator.items).toBeUndefined();
    });

    it('treats a window sharing only the loaded newest id as OVERLAP, not disjoint (boundary)', () => {
      const { paginator, m3 } = setupLoadedHead({ isTail: false });
      // Exactly one shared id (the loaded newest, m3): the minimal-overlap boundary. This must merge
      // (append m4/m5, keep older loadable), NOT reset to the window.
      paginator.mergeNewestPage([m3, m('m4', '04'), m('m5', '05')]);

      expect(paginator.items?.map((message) => message.id)).toEqual([
        'm1',
        'm2',
        'm3',
        'm4',
        'm5',
      ]);
      expect(paginator.itemIntervals).toHaveLength(1);
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      // The tail cursor anchors to the loaded oldest (m1), derived from the merged interval.
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe('m1');
    });

    // Builds the "jumped away" shape: the newest slice is loaded as one interval, and a separate
    // OLDER interval (as after jumping to a quoted message) is the active/visible one. itemIntervals[0]
    // is the head, but the ACTIVE interval is the older window - the case the active-interval guard
    // must skip so the caller is not yanked to the newest.
    const setupHeadPlusActiveJumpedInterval = () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      paginator.ingestPage({
        page: [m('m8', '08'), m('m9', '09'), m('m10', '10')],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      paginator.ingestPage({
        page: [m('m1', '01'), m('m2', '02'), m('m3', '03')],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      return paginator;
    };

    it('is a no-op when a separate jumped interval is active, preserving the caller position', () => {
      const paginator = setupHeadPlusActiveJumpedInterval();
      // Precondition: two intervals, the head at [0], but the older jumped window is what is shown.
      expect(paginator.itemIntervals).toHaveLength(2);
      expect((paginator.itemIntervals[0] as unknown as { isHead: boolean }).isHead).toBe(
        true,
      );
      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);

      // A newest window overlapping the loaded head. The head is loaded but NOT the active interval,
      // so the merge is skipped: the caller stays on the jumped window (no yank to the newest).
      paginator.mergeNewestPage([m('m9', '09'), m('m10', '10'), m('m11', '11')]);

      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.itemIntervals).toHaveLength(2);
      // The incoming page was not ingested at all.
      expect(paginator.getItem('m11')).toBeUndefined();
    });

    it('discards ALL intervals including a separate stale one on a disjoint reset (head active)', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      // The head is loaded AND active; a separate older interval is also loaded (setActive: false),
      // e.g. it lingers from an earlier jump the caller has since scrolled back from.
      paginator.ingestPage({
        page: [m('m8', '08'), m('m9', '09'), m('m10', '10')],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      paginator.ingestPage({
        page: [m('m1', '01'), m('m2', '02'), m('m3', '03')],
        isHead: false,
        isTail: false,
        setActive: false,
      });
      expect(paginator.itemIntervals).toHaveLength(2);

      // A newest window disjoint from the head (shares no id). The reset clears every interval, so
      // the stale older one is dropped too; only the fetched window remains.
      paginator.mergeNewestPage([m('m20', '20'), m('m21', '21'), m('m22', '22')]);

      const state = paginator.state.getLatestValue();
      expect(paginator.itemIntervals).toHaveLength(1);
      expect(state.items?.map((message) => message.id)).toEqual(['m20', 'm21', 'm22']);
      // The previously loaded items (head + older) are no longer part of the visible set.
      expect(state.items?.some((message) => message.id === 'm1')).toBe(false);
      expect(state.items?.some((message) => message.id === 'm8')).toBe(false);
    });
  });

  describe('mergeNewestPage() — destructive reconciliation', () => {
    // A channel (main list) message with a distinct created_at derived from `minute`, so ordering and
    // the reconciliation window are unambiguous. Server-confirmed ('received') unless overridden.
    const msg = (id: string, minute: number, overrides: Partial<MessageResponse> = {}) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: new Date(Date.UTC(2020, 0, 1, 0, minute, 0)).toISOString(),
        ...overrides,
      });

    // Loads a newest (head-anchored, active) window from `messages` (any order; sorted on ingest).
    const loadHead = (
      messages: LocalMessage[],
      { isTail = false }: { isTail?: boolean } = {},
    ) => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });
      paginator.ingestPage({ page: messages, isHead: true, isTail, setActive: true });
      return paginator;
    };

    const ids = (paginator: MessagePaginator) =>
      paginator.items?.map((message) => message.id);

    // ── WITHIN the returned page's span (default, no options — unconditionally safe) ──────────────

    it('default (no options): drops a hard-deleted message within the returned page span', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ]);
      // m3 hard-deleted while offline: the authoritative newest page comes back without it.
      paginator.mergeNewestPage([msg('m1', 1), msg('m2', 2), msg('m4', 4), msg('m5', 5)]);
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm4', 'm5']);
      expect(paginator.getItem('m3')).toBeUndefined();
    });

    it('drops several hard-deleted messages in one pass', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
        msg('m6', 6),
      ]);
      // m2 and m4 hard-deleted.
      paginator.mergeNewestPage([msg('m1', 1), msg('m3', 3), msg('m5', 5), msg('m6', 6)]);
      expect(ids(paginator)).toEqual(['m1', 'm3', 'm5', 'm6']);
    });

    it('reconciles deletions AND additions delivered by the same page', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
      ]);
      // m3 hard-deleted; m5 and m6 arrived while offline — all in the one authoritative page.
      paginator.mergeNewestPage([
        msg('m1', 1),
        msg('m2', 2),
        msg('m4', 4),
        msg('m5', 5),
        msg('m6', 6),
      ]);
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm4', 'm5', 'm6']);
      expect(paginator.getItem('m3')).toBeUndefined();
    });

    it('keeps a soft-deleted message (the server still returns it, so it is in the page)', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      paginator.mergeNewestPage([
        msg('m1', 1),
        msg('m2', 2, { type: 'deleted', deleted_at: '2020-01-01T00:10:00.000Z' }),
        msg('m3', 3),
      ]);
      expect(paginator.getItem('m2')).toBeDefined();
      expect(paginator.getItem('m2')?.type).toBe('deleted');
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
    });

    // ── OLDER than the returned page (must be left untouched unless the page reached the start) ───

    it('leaves loaded messages older than the returned page untouched (full page, start not reached)', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
        msg('m6', 6),
      ]);
      // A full page (returned === requested) covering only the newest four; m4 was hard-deleted, so
      // m2 slid into the window: page = [m2,m3,m5,m6]. Older m1 is below the page and MUST stay.
      paginator.mergeNewestPage(
        [msg('m2', 2), msg('m3', 3), msg('m5', 5), msg('m6', 6)],
        {},
      );
      expect(paginator.getItem('m4')).toBeUndefined(); // within-window delete removed
      expect(paginator.getItem('m1')).toBeDefined(); // older-than-page kept
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm5', 'm6']);
    });

    it('keeps a below-window delete even when the page proves reached-start — reconcile is window-only (data-loss safe)', () => {
      // m1 (oldest) hard-deleted → a bounded re-fetch (requestedLimit 4 <= pageSize) returns [m2,m3,m4],
      // short, which DOES prove reached-start (hasMoreTail goes false). But m1 sits BELOW the returned
      // window, and reconcile is window-only — it never removes anything older than the page's oldest —
      // so m1 is KEPT rather than risk deleting a merely-not-fetched message; the stale ghost self-heals
      // on a cold load. requestedLimit moved only the flag, never a deletion.
      const paginator = loadHead(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        { isTail: true },
      );
      paginator.mergeNewestPage([msg('m2', 2), msg('m3', 3), msg('m4', 4)], {
        requestedLimit: 4,
      });
      expect(paginator.getItem('m1')).toBeDefined();
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(false);
    });

    it('keeps the oldest loaded message when the page did NOT prove it reached the start', () => {
      const paginator = loadHead(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {
          isTail: true,
        },
      );
      // A FULL page (returned === requested) that simply does not reach m1 → cannot claim m1 deleted.
      paginator.mergeNewestPage([msg('m2', 2), msg('m3', 3), msg('m4', 4)], {});
      expect(paginator.getItem('m1')).toBeDefined();
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4']);
    });

    // ── AT/ABOVE the newest returned message: trailing deletes (need a pre-fetch snapshot) ────────

    it('keeps a hard-deleted NEWEST message without a snapshot (documented limitation)', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ]);
      // m5 (newest) deleted; the page's newest is now m4. No snapshot ⇒ the top edge is ambiguous.
      paginator.mergeNewestPage(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {},
      );
      expect(paginator.getItem('m5')).toBeDefined();
    });

    it('drops a hard-deleted NEWEST message WITH a snapshot and recomputes lastMessage', () => {
      const loaded = [
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ];
      const paginator = loadHead(loaded);
      expect(paginator.lastMessage?.id).toBe('m5');
      const candidateIds = new Set(loaded.map((message) => message.id));

      paginator.mergeNewestPage(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {
          candidateIds,
        },
      );

      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(paginator.getItem('m5')).toBeUndefined();
      expect(paginator.lastMessage?.id).toBe('m4'); // tracked latest fell back to the newest survivor
    });

    it('drops multiple hard-deleted trailing messages with a snapshot', () => {
      const loaded = [
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ];
      const paginator = loadHead(loaded);
      const candidateIds = new Set(loaded.map((message) => message.id));

      paginator.mergeNewestPage([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
        candidateIds,
      });

      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.lastMessage?.id).toBe('m3');
    });

    // ── The live-race: a message that arrived during the fetch must never be pruned ──────────────

    it('keeps a message that arrived live during the fetch while dropping a trailing ghost', () => {
      // Loaded before the fetch: m1..m4 plus a soon-to-be-deleted newest ghost m5.
      const loadedBefore = [
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ];
      const paginator = loadHead(loadedBefore);
      const candidateIds = new Set(loadedBefore.map((message) => message.id)); // snapshot BEFORE fetch

      // During the fetch a brand-new message m6 arrives via WS and is ingested into the head.
      paginator.ingestItem(msg('m6', 6));
      expect(paginator.getItem('m6')).toBeDefined();

      // The server's authoritative page (computed before m6 existed) has m5 deleted and lacks m6.
      paginator.mergeNewestPage(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {
          candidateIds,
        },
      );

      // m5 (ghost, in the snapshot) removed; m6 (live arrival, NOT in the snapshot) kept.
      expect(paginator.getItem('m5')).toBeUndefined();
      expect(paginator.getItem('m6')).toBeDefined();
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4', 'm6']);
    });

    // ── Provenance: never reconcile away local-only (unsent) messages ────────────────────────────

    it('never removes optimistic (sending), failed, or error-type local messages', () => {
      const loaded = [
        msg('m1', 1),
        msg('sending', 2, { status: 'sending' }),
        msg('failed', 3, { status: 'failed' }),
        msg('err', 4, { type: 'error' }),
        msg('m5', 5),
      ];
      const paginator = loadHead(loaded);
      const candidateIds = new Set(loaded.map((message) => message.id));

      // The server page only has the confirmed m1 + m5; the local-only ones the server never saw.
      paginator.mergeNewestPage([msg('m1', 1), msg('m5', 5)], {
        candidateIds,
      });

      expect(paginator.getItem('sending')).toBeDefined();
      expect(paginator.getItem('failed')).toBeDefined();
      expect(paginator.getItem('err')).toBeDefined();
      expect(paginator.getItem('m1')).toBeDefined();
      expect(paginator.getItem('m5')).toBeDefined();
    });

    it('removes a hard-deleted confirmed message while keeping a co-located failed one', () => {
      const loaded = [
        msg('m1', 1),
        msg('failed', 2, { status: 'failed' }),
        msg('m3', 3),
        msg('m4', 4),
      ];
      const paginator = loadHead(loaded);
      const candidateIds = new Set(loaded.map((message) => message.id));

      // m3 hard-deleted; the failed send was never on the server. Page: [m1, m4].
      paginator.mergeNewestPage([msg('m1', 1), msg('m4', 4)], {
        candidateIds,
      });

      expect(paginator.getItem('m3')).toBeUndefined();
      expect(paginator.getItem('failed')).toBeDefined();
      expect(ids(paginator)).toEqual(['m1', 'failed', 'm4']);
    });

    // ── Empty page: whole channel emptied (or a missed truncate) ─────────────────────────────────

    it('empties the list when the channel returns no messages (with a snapshot)', () => {
      const loaded = [msg('m1', 1), msg('m2', 2), msg('m3', 3)];
      const paginator = loadHead(loaded);
      const candidateIds = new Set(loaded.map((message) => message.id));

      paginator.mergeNewestPage([], { candidateIds });

      expect(paginator.items).toEqual([]);
      expect(paginator.lastMessage).toBeNull();
    });

    it('does NOT blank on an empty page without a snapshot (safe default)', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      paginator.mergeNewestPage([]);
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
    });

    it('keeps a live arrival on an empty page (only snapshot ids are removed)', () => {
      const loadedBefore = [msg('m1', 1), msg('m2', 2)];
      const paginator = loadHead(loadedBefore);
      const candidateIds = new Set(loadedBefore.map((message) => message.id));

      // A live message arrives during the fetch, then the (stale) empty page comes back.
      paginator.ingestItem(msg('m3', 3));
      paginator.mergeNewestPage([], { candidateIds });

      expect(paginator.getItem('m1')).toBeUndefined();
      expect(paginator.getItem('m2')).toBeUndefined();
      expect(paginator.getItem('m3')).toBeDefined();
      expect(ids(paginator)).toEqual(['m3']);
    });

    // ── Structural guards preserved ──────────────────────────────────────────────────────────────

    it('does not reconcile on a disjoint reset (the rebuilt window is already authoritative)', () => {
      const loaded = [msg('m1', 1), msg('m2', 2), msg('m3', 3)];
      const paginator = loadHead(loaded);
      const candidateIds = new Set(loaded.map((message) => message.id));

      // A fully-disjoint newest window (100+ arrived). Rebuild replaces the loaded set; no extra prune.
      paginator.mergeNewestPage([msg('m10', 10), msg('m11', 11), msg('m12', 12)], {
        candidateIds,
      });

      expect(ids(paginator)).toEqual(['m10', 'm11', 'm12']);
    });

    it('reconciles the hidden head but preserves the view when the caller jumped to a separate older window', () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });
      paginator.ingestPage({
        page: [msg('m8', 8), msg('m9', 9), msg('m10', 10)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        isHead: false,
        isTail: false,
        setActive: true,
      });

      // Active window is the older [m1,m2,m3]; the head holds m8,m9,m10 (m9 "deleted" server-side).
      paginator.mergeNewestPage([msg('m8', 8), msg('m10', 10)], {
        candidateIds: new Set(['m8', 'm9', 'm10']),
      });

      // The view (the older window) is preserved — no yank to the head — but the hidden-head ghost m9
      // is still pruned, so returning to the head later (scroll-to-latest) won't surface it.
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.getItem('m9')).toBeUndefined();
    });

    it('is idempotent — a second reconcile against the same page removes nothing more', () => {
      const loaded = [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)];
      const paginator = loadHead(loaded);

      paginator.mergeNewestPage([msg('m1', 1), msg('m3', 3), msg('m4', 4)], {
        candidateIds: new Set(loaded.map((message) => message.id)),
      });
      expect(ids(paginator)).toEqual(['m1', 'm3', 'm4']);

      paginator.mergeNewestPage([msg('m1', 1), msg('m3', 3), msg('m4', 4)], {
        candidateIds: new Set(['m1', 'm3', 'm4']),
      });
      expect(ids(paginator)).toEqual(['m1', 'm3', 'm4']);
    });

    // ── Reconcile is window-only: nothing older than the returned page's oldest is ever removed (no cap) ──

    it('keeps every loaded message older than the returned page — window-only reconcile never deletes below it (data-loss guard)', () => {
      // DATA-LOSS GUARD. 105 loaded; a reload over-requests all 105 but the server caps the page at the
      // newest 100 — the 5 oldest sit BELOW the returned page's oldest. Reconcile is window-only: it
      // never removes anything older than the returned page's oldest, so none of the 5 are deleted.
      // requestedLimit only tunes hasMoreTail, never a deletion — the window-only reconcile holds for ANY
      // page that covers only part of the loaded window.
      const all = Array.from({ length: 105 }, (_, i) =>
        msg(`msg-${String(i).padStart(3, '0')}`, i),
      );
      const paginator = loadHead(all, { isTail: true });
      const page = all.slice(5); // a page covering only the newest 100 of the 105 loaded

      paginator.mergeNewestPage(page, {
        requestedLimit: all.length, // reload asks for all 105; the server caps the returned page at 100
        candidateIds: new Set(all.map((message) => message.id)),
      });

      // All 105 kept: nothing was actually deleted, and the 5 oldest are below the returned page.
      expect(paginator.items?.length).toBe(105);
      expect(paginator.getItem('msg-000')).toBeDefined();
      expect(paginator.getItem('msg-004')).toBeDefined();
    });

    it('an over-request capped to the newest part keeps hasMoreTail and anchors the tail cursor to the true loaded oldest', () => {
      // A reload over-requests all 105 but the server caps the page at the newest 100. An over-request
      // (105 > pageSize 100) can be silently server-capped, so a short page CANNOT prove reached-start —
      // hasMoreTail stays true and the tail cursor anchors to the true oldest LOADED (msg-000), not the
      // page's oldest — so "load older" resumes contiguously from the real bottom of the window.
      const all = Array.from({ length: 105 }, (_, i) =>
        msg(`msg-${String(i).padStart(3, '0')}`, i),
      );
      const paginator = loadHead(all, { isTail: true });

      paginator.mergeNewestPage(all.slice(5), {
        requestedLimit: all.length,
        candidateIds: new Set(all.map((message) => message.id)),
      });

      const state = paginator.state.getLatestValue();
      expect(state.hasMoreTail).toBe(true);
      expect(state.cursor?.tailward).toBe('msg-000');
    });

    it('a bounded short page reaches the channel start: trailing deletes still removed, hasMoreTail false, cursor cleared', () => {
      // The newest two are hard-deleted so the reconnect page comes back short. The trailing deletes
      // (m4, m5) are still removed — they are at/above the newest returned message and the pre-fetch
      // snapshot proves them gone. The request was BOUNDED (requestedLimit 5 <= pageSize 100) and came
      // back short, so it DOES prove reached-start: hasMoreTail goes false, the interval's isTail goes
      // true, and the tail cursor is cleared. No spurious "load older".
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ]);
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);

      // m4 + m5 hard-deleted while offline: only the surviving newest come back.
      paginator.mergeNewestPage([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
        requestedLimit: 5,
        candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
      });

      const state = paginator.state.getLatestValue();
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']); // trailing deletes removed via snapshot
      expect(state.hasMoreTail).toBe(false);
      expect(state.cursor?.tailward).toBe(null);
      expect((paginator.itemIntervals[0] as { isTail?: boolean }).isTail).toBe(true);
    });

    // ── hasMoreTail derivation: bounded (reliable) vs over-request (conservative), no hardcoded cap ──

    describe('hasMoreTail derivation (requestedLimit vs pageSize)', () => {
      it('a bounded short page proves reached-start → hasMoreTail false, cursor cleared (no spurious "load older")', () => {
        // The channel is smaller than a page: a bounded open (requestedLimit <= pageSize) returns every
        // message and comes back short. That reliably proves reached-start — pageSize <= the server's max
        // page size is the same invariant executeQuery pagination relies on — so hasMoreTail is false.
        // This is the fix for the spurious top spinner + double pagination on first open.
        const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
        paginator.mergeNewestPage([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
          requestedLimit: 25,
        });
        const state = paginator.state.getLatestValue();
        expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']); // nothing removed
        expect(state.hasMoreTail).toBe(false);
        expect(state.cursor?.tailward).toBe(null);
        expect((paginator.itemIntervals[0] as { isTail?: boolean }).isTail).toBe(true);
      });

      it('a bounded FULL page does NOT assert reached-start → hasMoreTail true (older may remain)', () => {
        // A bounded request that comes back FULL (length === requested) means older messages may still
        // exist, so "load older" stays enabled and the cursor anchors to the loaded oldest.
        const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
        paginator.mergeNewestPage([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
          requestedLimit: 3,
        });
        const state = paginator.state.getLatestValue();
        expect(state.hasMoreTail).toBe(true);
        expect(state.cursor?.tailward).toBe('m1');
      });

      it('an OVER-request short page (> pageSize, possibly server-capped) never asserts reached-start → hasMoreTail true, below-window kept', () => {
        // reload re-fetches the whole loaded window to reconcile as much as possible; that over-request
        // (> pageSize) can be silently server-capped, so a short page proves nothing about reaching the
        // start. Bias to true so a merely-capped page is never mistaken for the channel's start — the
        // data-loss-safe direction, needing no hardcoded max page size.
        const paginator = new MessagePaginator({
          channel,
          itemIndex: new StoreBackedItemIndex<LocalMessage>({
            getEntityId: (message) => message.id,
          }),
          paginatorOptions: { pageSize: 3 },
        });
        paginator.ingestPage({
          page: [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
          isHead: true,
          isTail: true,
          setActive: true,
        });
        // reload over-requests 4 (> pageSize 3); the server caps the returned page at the newest 3.
        paginator.mergeNewestPage([msg('m2', 2), msg('m3', 3), msg('m4', 4)], {
          requestedLimit: 4,
        });
        expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
        expect(paginator.getItem('m1')).toBeDefined(); // below-window delete never removed (data-loss safe)
      });
    });

    // ── reached-start probe: the ONLY cap-free way to prune the oldest-run below the returned window ──

    describe('reached-start probe (below-window reconciliation)', () => {
      const mockQuery = () => channel.query as unknown as ReturnType<typeof vi.fn>;
      const mockGetReplies = () =>
        channel.getReplies as unknown as ReturnType<typeof vi.fn>;
      const flushProbe = (p: MessagePaginator) =>
        (p as unknown as { _belowWindowReconcile?: Promise<void> })._belowWindowReconcile;
      const makePaginator = (pageSize: number, parentMessageId?: string) =>
        new MessagePaginator({
          channel,
          parentMessageId,
          itemIndex: new StoreBackedItemIndex<LocalMessage>({
            getEntityId: (message) => message.id,
          }),
          paginatorOptions: { pageSize },
        });
      // Fully-loaded head (isTail → hasMoreTail false, so condition A holds).
      const loadFull = (paginator: MessagePaginator, page: LocalMessage[]) =>
        paginator.ingestPage({ page, isHead: true, isTail: true, setActive: true });

      it('probe empty → prunes the oldest-run ghost below the window and settles hasMoreTail', async () => {
        // pageSize 3 so requestedLimit 5 is an OVER-request: the sync merge cannot prove reached-start
        // (biases hasMoreTail true, keeps m1 window-only) — the probe is the SOLE driver here.
        const paginator = makePaginator(3);
        loadFull(paginator, [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
          msg('m5', 5),
        ]);
        expect(paginator.state.getLatestValue().hasMoreTail).toBe(false); // A precondition

        // m1 (oldest) hard-deleted offline; reload over-requests all 5, server returns the survivors.
        mockQuery().mockResolvedValue({ messages: [] }); // nothing older than m2 → reached start
        paginator.mergeNewestPage(
          [msg('m2', 2), msg('m3', 3), msg('m4', 4), msg('m5', 5)],
          { requestedLimit: 5, candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']) },
        );
        // Sync merge kept m1 (window-only) and biased hasMoreTail true (over-request):
        expect(paginator.getItem('m1')).toBeDefined();
        expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);

        await flushProbe(paginator);

        expect(channel.query).toHaveBeenCalledWith({
          messages: { limit: 1, id_lt: 'm2' },
        });
        expect(paginator.getItem('m1')).toBeUndefined(); // pruned by the probe
        expect(ids(paginator)).toEqual(['m2', 'm3', 'm4', 'm5']);
        expect(paginator.state.getLatestValue().hasMoreTail).toBe(false); // settled
        expect(paginator.state.getLatestValue().cursor?.tailward).toBe(null);
      });

      it('probe returns an older message → keeps the below-window items (truncated, not the start)', async () => {
        const paginator = makePaginator(3);
        loadFull(paginator, [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
          msg('m5', 5),
        ]);
        // Reload over-requests 5; server caps and returns only the newest 3 — m1,m2 fall below.
        mockQuery().mockResolvedValue({ messages: [msg('m2', 2)] }); // older content exists
        paginator.mergeNewestPage([msg('m3', 3), msg('m4', 4), msg('m5', 5)], {
          requestedLimit: 5,
          candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
        });

        await flushProbe(paginator);

        expect(channel.query).toHaveBeenCalledWith({
          messages: { limit: 1, id_lt: 'm3' },
        });
        expect(paginator.getItem('m1')).toBeDefined(); // kept — no data loss on a truncated reload
        expect(paginator.getItem('m2')).toBeDefined();
        expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      });

      it('does NOT probe when we were not at the channel start (hasMoreTail was true)', async () => {
        const paginator = makePaginator(3);
        // isTail false → hasMoreTail true → condition A fails.
        paginator.ingestPage({
          page: [msg('m3', 3), msg('m4', 4), msg('m5', 5)],
          isHead: true,
          isTail: false,
          setActive: true,
        });
        expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
        paginator.mergeNewestPage([msg('m4', 4), msg('m5', 5)], {
          requestedLimit: 3,
          candidateIds: new Set(['m3', 'm4', 'm5']),
        });
        await flushProbe(paginator);
        expect(channel.query).not.toHaveBeenCalled();
        expect(paginator.getItem('m3')).toBeDefined();
      });

      it('does NOT probe a small-page caller (requestedLimit < loaded) — a list hydrate cannot reach the start', async () => {
        const paginator = makePaginator(3);
        loadFull(paginator, [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
          msg('m5', 5),
        ]);
        // A list-hydrate-style page: asked for only 2, far fewer than the 5 loaded.
        paginator.mergeNewestPage([msg('m4', 4), msg('m5', 5)], {
          requestedLimit: 2,
          candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
        });
        await flushProbe(paginator);
        expect(channel.query).not.toHaveBeenCalled();
        expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']); // nothing pruned
      });

      it('does NOT probe when the oldest is still in the page (a middle delete — within-span handles it)', async () => {
        const paginator = makePaginator(3);
        loadFull(paginator, [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
          msg('m5', 5),
        ]);
        // m3 deleted; reload returns [m1,m2,m4,m5] — the oldest (m1) is still present.
        paginator.mergeNewestPage(
          [msg('m1', 1), msg('m2', 2), msg('m4', 4), msg('m5', 5)],
          {
            requestedLimit: 5,
            candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
          },
        );
        await flushProbe(paginator);
        expect(channel.query).not.toHaveBeenCalled();
        expect(paginator.getItem('m3')).toBeUndefined(); // removed by within-span, not the probe
        expect(ids(paginator)).toEqual(['m1', 'm2', 'm4', 'm5']);
      });

      it('threads probe via getReplies', async () => {
        const paginator = makePaginator(3, 'parent-1');
        const reply = (id: string, minute: number) =>
          msg(id, minute, { parent_id: 'parent-1' });
        loadFull(paginator, [
          reply('r1', 1),
          reply('r2', 2),
          reply('r3', 3),
          reply('r4', 4),
        ]);
        mockGetReplies().mockResolvedValue({ messages: [] }); // nothing older than r2
        paginator.mergeNewestPage([reply('r2', 2), reply('r3', 3), reply('r4', 4)], {
          requestedLimit: 4,
          candidateIds: new Set(['r1', 'r2', 'r3', 'r4']),
        });
        await flushProbe(paginator);
        expect(channel.getReplies).toHaveBeenCalledWith({
          parent_id: 'parent-1',
          limit: 1,
          id_lt: 'r2',
        });
        expect(channel.query).not.toHaveBeenCalled();
        expect(paginator.getItem('r1')).toBeUndefined();
      });

      it('aborts the prune if the head interval changed while the probe was in flight', async () => {
        const paginator = makePaginator(3);
        loadFull(paginator, [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
          msg('m5', 5),
        ]);
        let resolveProbe: () => void = () => undefined;
        mockQuery().mockReturnValue(
          new Promise((resolve) => {
            resolveProbe = () => resolve({ messages: [] });
          }),
        );
        paginator.mergeNewestPage(
          [msg('m2', 2), msg('m3', 3), msg('m4', 4), msg('m5', 5)],
          { requestedLimit: 5, candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']) },
        );
        // The head interval goes away (a reset/jump) before the probe resolves.
        paginator.setIntervals([]);
        resolveProbe();
        await expect(flushProbe(paginator)).resolves.toBeUndefined(); // no throw, guard bailed
      });

      it('trailing deletes covered by new arrivals become within-span: removes them, merges the new, keeps the below-window oldest', async () => {
        // Loaded fully before going offline.
        const paginator = makePaginator(3);
        loadFull(paginator, [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
          msg('m5', 5),
        ]);

        mockQuery().mockResolvedValue({ messages: [msg('m1', 1)] }); // probe: m1 IS older than m2 → keep it
        paginator.mergeNewestPage(
          [msg('m2', 2), msg('m3', 3), msg('m6', 6), msg('m7', 7), msg('m8', 8)],
          { requestedLimit: 5, candidateIds: new Set(['m1', 'm2', 'm3', 'm4', 'm5']) },
        );

        // Sync: m4/m5 within-span → gone; m6/m7/m8 merged; m1 below the window kept pending the probe.
        expect(paginator.getItem('m4')).toBeUndefined();
        expect(paginator.getItem('m5')).toBeUndefined();
        expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm6', 'm7', 'm8']);

        await flushProbe(paginator);

        // The below-window oldest (m1) was probed and is real → kept. Final = the server truth.
        expect(channel.query).toHaveBeenCalledWith({
          messages: { limit: 1, id_lt: 'm2' },
        });
        expect(paginator.getItem('m1')).toBeDefined();
        expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm6', 'm7', 'm8']);
      });
    });

    describe('batch({ coalesce: true }) — single deterministic window publish', () => {
      it('coalesces N removals into a single state publish', () => {
        const paginator = loadHead([
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('m4', 4),
        ]);
        const spy = vi.spyOn(paginator.state, 'partialNext');

        paginator.batch(
          () => {
            paginator.removeItem({ id: 'm1' });
            paginator.removeItem({ id: 'm2' });
            paginator.removeItem({ id: 'm3' });
          },
          { coalesce: true },
        );

        expect(spy).toHaveBeenCalledTimes(1);
        expect(ids(paginator)).toEqual(['m4']);
      });

      it('coalesces N in-place updates into a single state publish', () => {
        const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
        const spy = vi.spyOn(paginator.state, 'partialNext');

        paginator.batch(
          () => {
            paginator.ingestItem(msg('m1', 1, { text: 'a' }));
            paginator.ingestItem(msg('m2', 2, { text: 'b' }));
            paginator.ingestItem(msg('m3', 3, { text: 'c' }));
          },
          { coalesce: true },
        );

        expect(spy).toHaveBeenCalledTimes(1);
        expect(paginator.getItem('m1')?.text).toBe('a');
        expect(paginator.getItem('m3')?.text).toBe('c');
      });

      it('coalesces a mixed remove + ingest batch into a single state publish', () => {
        const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
        const spy = vi.spyOn(paginator.state, 'partialNext');

        paginator.batch(
          () => {
            paginator.removeItem({ id: 'm2' });
            paginator.ingestItem(msg('m3', 3, { text: 'edited' }));
          },
          { coalesce: true },
        );

        expect(spy).toHaveBeenCalledTimes(1);
        expect(ids(paginator)).toEqual(['m1', 'm3']);
        expect(paginator.getItem('m3')?.text).toBe('edited');
      });

      it('without coalesce, the same removals publish once per item (proves the scope does the work)', () => {
        const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
        const spy = vi.spyOn(paginator.state, 'partialNext');

        paginator.batch(() => {
          paginator.removeItem({ id: 'm1' });
          paginator.removeItem({ id: 'm2' });
        });

        expect(spy).toHaveBeenCalledTimes(2);
      });

      it('does not publish when the coalesced batch leaves the active window unchanged', () => {
        const paginator = loadHead([msg('m1', 1), msg('m2', 2)]);
        const spy = vi.spyOn(paginator.state, 'partialNext');

        paginator.batch(
          () => {
            paginator.removeItem({ id: 'does-not-exist' });
          },
          { coalesce: true },
        );

        expect(spy).not.toHaveBeenCalled();
      });
    });

    it('reconciles a deletion inside the returned page while keeping messages beyond it', () => {
      const all = Array.from({ length: 105 }, (_, i) =>
        msg(`msg-${String(i).padStart(3, '0')}`, i),
      );
      const paginator = loadHead(all, { isTail: true });
      // msg-050 hard-deleted; the server's newest 100 now reaches one further back.
      const survivors = all.filter((message) => message.id !== 'msg-050');
      const page = survivors.slice(survivors.length - 100);

      paginator.mergeNewestPage(page, {
        candidateIds: new Set(all.map((message) => message.id)),
      });

      expect(paginator.getItem('msg-050')).toBeUndefined(); // within-page delete removed
      expect(paginator.getItem('msg-000')).toBeDefined(); // beyond the page → kept
    });

    // ── Offline DB is kept in lockstep, entirely from the LLC (no SDK orchestration) ─────────────

    it('mirrors reconciled ghosts into the offline DB via the DB batch API (LLC-owned)', () => {
      const hardDeleteMessages = vi.fn().mockResolvedValue([]);
      const getReplies = vi.fn();
      const channelWithOfflineDb = {
        cid: 'channel-id',
        getReplies,
        query: vi.fn(),
        getClient: () => ({ offlineDb: { hardDeleteMessages }, getReplies }),
      } as unknown as Channel;
      const paginator = new MessagePaginator({
        channel: channelWithOfflineDb,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        isHead: true,
        isTail: true,
        setActive: true,
      });

      // m3 hard-deleted while offline: gone from the in-memory list AND from SQLite. The paginator
      // just hands the reconciled ids to the DB's batch helper — it owns the transaction.
      paginator.mergeNewestPage([msg('m1', 1), msg('m2', 2), msg('m4', 4)]);

      expect(paginator.getItem('m3')).toBeUndefined();
      expect(hardDeleteMessages).toHaveBeenCalledWith({ ids: ['m3'] });
    });

    it('reconciles in-memory without error when offline support is disabled (no offlineDb)', () => {
      // The default mock channel has no getClient/offlineDb → the DB purge is a guarded no-op.
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      expect(() => paginator.mergeNewestPage([msg('m1', 1), msg('m3', 3)])).not.toThrow();
      expect(paginator.getItem('m2')).toBeUndefined();
    });
  });

  // seedFirstPageSync is the synchronous channel-open seed (Channel.query / hydrateActiveChannels).
  // With `options.reconcile` it doubles as the reconnect / re-hydrate fold: over an already-loaded
  // window it delegates to mergeNewestPage (merge + destructive reconcile + disjoint rebuild), whose
  // internals are covered above — these tests pin only the ROUTING decision (which branch it picks).
  describe('seedFirstPageSync() — reconcile routing', () => {
    const msg = (id: string, minute: number, overrides: Partial<MessageResponse> = {}) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: new Date(Date.UTC(2020, 0, 1, 0, minute, 0)).toISOString(),
        ...overrides,
      });

    // The plain-seed branch runs seedUnreadSnapshot (reads getClient().user); give the channel a
    // benign client with no current user so it no-ops instead of throwing on the bare mock.
    const reconcileGetReplies = vi.fn();
    const reconcileChannel = {
      cid: 'channel-id',
      getReplies: reconcileGetReplies,
      query: vi.fn(),
      getClient: () => ({ user: undefined, getReplies: reconcileGetReplies }),
    } as unknown as Channel;

    const makePaginator = () =>
      new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });

    const loadHead = (messages: LocalMessage[]) => {
      const paginator = makePaginator();
      paginator.ingestPage({
        page: messages,
        isHead: true,
        isTail: false,
        setActive: true,
      });
      return paginator;
    };

    const ids = (paginator: MessagePaginator) =>
      paginator.items?.map((message) => message.id);

    it('clears a previous query error when a reconciling seed lands', () => {
      // This branch returns before `postQueryReconcile`, which is the only other thing that resets
      // `lastQueryError`. Without a clear here a failed "load older" stays latched through an
      // otherwise successful reconnect refresh, and any UI reading the paginator keeps its error up.
      const paginator = loadHead([msg('m1', 1), msg('m2', 2)]);
      paginator.state.partialNext({ lastQueryError: new Error('load older failed') });

      paginator.seedFirstPageSync(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        25,
        undefined,
        {
          reconcile: true,
        },
      );

      expect(paginator.lastQueryError).toBeUndefined();
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
    });

    it('REPRO(interval): reconnect re-establishes hasMoreTail over a stale "complete" INTERVAL (offline DB)', () => {
      const paginator = makePaginator();
      // Offline-DB window persisted as "complete" — the INTERVAL itself has isTail=true / hasMoreTail
      // false, even though the channel has older messages the cache never held. (This is what my
      // earlier state-only corruption failed to reproduce.)
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        isHead: true,
        isTail: true,
        setActive: true,
      });
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(false);

      // Reconnect re-seeds the head window. The merge biases hasMoreTail to `true` (isTail:false),
      // which clears the stale "complete" flag so "load older" works again — not read off the stale
      // interval flag. (If the channel really is fully loaded, the next load-older returns empty and
      // settles it.)
      paginator.seedFirstPageSync(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        3,
        undefined,
        {
          reconcile: true,
        },
      );

      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe('m1');
    });

    it('JOURNEY: a reconnect re-seed over a stale window keeps "load older" working end-to-end', async () => {
      // The exact user flow that regressed: open a channel, its window is preloaded from the offline DB
      // with a dead cursor, a reconnect re-seeds, then the user scrolls up. "Load older" must fetch and
      // append the previous page — a component-level test (checking only which messages merged) missed
      // this because the break was in the CURSOR, so drive the real executeQuery pagination here.
      const older = [
        msg('m01', 1),
        msg('m02', 2),
        msg('m03', 3),
        msg('m04', 4),
        msg('m05', 5),
      ];
      const doRequest = vi.fn().mockResolvedValue({
        items: older,
        cursor: { tailward: 'm01', headward: 'm05' },
      });
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        paginatorOptions: { doRequest },
      });

      const head = [
        msg('m06', 6),
        msg('m07', 7),
        msg('m08', 8),
        msg('m09', 9),
        msg('m10', 10),
      ];
      // Offline-DB window persisted as "complete" — the INTERVAL itself is isTail:true / hasMoreTail
      // false (the real stale shape; corrupting only state would miss the bug).
      paginator.ingestPage({ page: head, isHead: true, isTail: true, setActive: true });
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(false);
      paginator.seedFirstPageSync(head, 5, undefined, { reconcile: true }); // reconnect re-seed

      // The user scrolls up. If the re-seed left the dead cursor, executeQuery no-ops (hasMoreTail
      // false) and nothing loads; with the cursor re-derived it fetches and appends the older page.
      await paginator.executeQuery({ direction: 'tailward' });

      expect(doRequest).toHaveBeenCalled();
      expect(paginator.items?.map((m) => m.id)).toEqual([
        'm01',
        'm02',
        'm03',
        'm04',
        'm05',
        'm06',
        'm07',
        'm08',
        'm09',
        'm10',
      ]);
    });

    it('a reconnect re-seed while JUMPED AWAY does not weld the newest page into the active older window', () => {
      const paginator = makePaginator();
      // Head window (newest), loaded on open.
      paginator.ingestPage({
        page: [msg('m080', 80), msg('m090', 90), msg('m100', 100)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      // Jump to a far, DISJOINT older window (like clicking a quoted message in another set) — it
      // becomes the active interval and is NOT the head.
      paginator.ingestPage({
        page: [msg('m020', 20), msg('m021', 21), msg('m022', 22)],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      expect(paginator.isActiveIntervalAtHead).toBe(false);
      const before = paginator.items?.map((m) => m.id);

      // A reconnect re-seeds the newest page (channel.reload → watch → seedFirstPageSync). It must NOT
      // weld the newest into the jumped-away window — the two message sets stay separate.
      paginator.seedFirstPageSync(
        [msg('m080', 80), msg('m090', 90), msg('m100', 100)],
        3,
        undefined,
        { reconcile: true },
      );

      expect(paginator.isActiveIntervalAtHead).toBe(false); // still on the jumped window
      expect(paginator.items?.map((m) => m.id)).toEqual(before); // unchanged — no weld
    });

    it('AUDIT: disjoint reconnect rebuilds to the fresh page instead of welding across the gap', () => {
      const paginator = loadHead([msg('m01', 1), msg('m02', 2), msg('m03', 3)]);
      // 100+ new arrived while offline → the fetched newest page shares NO id with the loaded window.
      paginator.seedFirstPageSync(
        [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        3,
        undefined,
        {
          reconcile: true,
        },
      );
      // Must NOT weld m10..m12 across the gap into m01..m03 (which hides m04..m09 with no way to reach
      // them). Rebuild to the fresh page so scrolling up reloads the gap contiguously.
      expect(paginator.items?.map((m) => m.id)).toEqual(['m10', 'm11', 'm12']);
    });

    it('AUDIT: an empty reconnect page (no snapshot) does not blank the loaded window', () => {
      const paginator = loadHead([msg('m01', 1), msg('m02', 2), msg('m03', 3)]);
      // A transient empty page on reconnect must not wipe the list on its own.
      paginator.seedFirstPageSync([], 3, undefined, { reconcile: true });
      expect(paginator.items?.map((m) => m.id)).toEqual(['m01', 'm02', 'm03']);
    });

    it('AUDIT e2e: after a disjoint rebuild, "load older" reloads the gap, not the discarded stale window', async () => {
      const gap = [msg('m175', 175), msg('m176', 176), msg('m177', 177)];
      const doRequest = vi.fn().mockResolvedValue({
        items: gap,
        cursor: { tailward: 'm175', headward: 'm177' },
      });
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        paginatorOptions: { doRequest },
      });
      // The newest window loaded when the user went offline.
      paginator.ingestPage({
        page: [msg('m078', 78), msg('m079', 79), msg('m080', 80)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      // Reconnect: 100+ new arrived, so the fetched newest page is DISJOINT from the loaded window.
      paginator.seedFirstPageSync(
        [msg('m178', 178), msg('m179', 179), msg('m180', 180)],
        3,
        undefined,
        {
          reconcile: true,
        },
      );
      // Scroll up: the rebuilt window must reload the gap contiguously — the stale m078..m080 are gone,
      // not welded in with the in-between messages hidden.
      await paginator.executeQuery({ direction: 'tailward' });
      const ids = paginator.items?.map((m) => m.id);
      expect(ids).not.toContain('m078');
      expect(ids).toEqual(['m175', 'm176', 'm177', 'm178', 'm179', 'm180']);
    });

    it('a jump to a far disjoint message stays SEPARATE from the latest, even through a re-seed', async () => {
      const around = [msg('m20', 20), msg('m21', 21), msg('m22', 22)];
      const doRequest = vi.fn().mockResolvedValue({
        items: around,
        cursor: { tailward: 'm20', headward: 'm22' },
      });
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        paginatorOptions: { doRequest },
      });
      paginator.ingestPage({
        page: [msg('m80', 80), msg('m90', 90), msg('m100', 100)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      await paginator.jumpToMessage('m21');
      // A latest-window re-seed (what watch() → seedFirstPageSync fires) must NOT weld the jumped
      // window into the latest — mergeNewestPage skips because the head is not the active interval.
      paginator.seedFirstPageSync(
        [msg('m80', 80), msg('m90', 90), msg('m100', 100)],
        3,
        undefined,
        {
          reconcile: true,
        },
      );
      expect(paginator.items?.map((m) => m.id)).toEqual(['m20', 'm21', 'm22']);
      expect(paginator.itemIntervals.length).toBe(2);
    });

    it('headItems is the hidden head window (not the active island) — the candidateIds source when jumped away', () => {
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        paginatorOptions: {},
      });
      paginator.ingestPage({
        page: [msg('m90', 90), msg('m95', 95), msg('m100', 100)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      paginator.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      // `items` follows the active view (the island) — the WRONG snapshot for reconciling the head...
      expect(paginator.items?.map((m) => m.id)).toEqual(['m10', 'm11', 'm12']);
      // ...`headItems` is the hidden head, which is what channel.query snapshots for candidateIds.
      expect(paginator.headItems.map((m) => m.id)).toEqual(['m90', 'm95', 'm100']);
    });

    it('reconnect while jumped away prunes the whole trailing run from the hidden head', () => {
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        paginatorOptions: {},
      });
      // Head/latest window loaded and at head; m98,m99,m100 are the bottom-most (newest) messages.
      paginator.ingestPage({
        page: [
          msg('m90', 90),
          msg('m95', 95),
          msg('m98', 98),
          msg('m99', 99),
          msg('m100', 100),
        ],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      // Jump to a far older island — now jumped away; the head is loaded-but-hidden underneath.
      paginator.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      expect(paginator.isActiveIntervalAtHead).toBe(false);

      // candidateIds is snapshotted by channel.query from `headItems` (the hidden head) — NOT `items`
      // (the island). The whole trailing RUN m98,m99,m100 was hard-deleted offline; all three are above
      // the newest survivor (m95), so only the head-derived snapshot can prune them.
      const candidateIds = new Set(paginator.headItems.map((m) => m.id));
      paginator.mergeNewestPage([msg('m90', 90), msg('m95', 95)], {
        candidateIds,
      });

      // View preserved (still on the island)...
      expect(paginator.isActiveIntervalAtHead).toBe(false);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m10', 'm11', 'm12']);
      // ...and the ENTIRE trailing run is pruned from the hidden head — none surface on scroll-to-latest.
      expect(paginator.getItem('m98')).toBeUndefined();
      expect(paginator.getItem('m99')).toBeUndefined();
      expect(paginator.getItem('m100')).toBeUndefined();
      const headIds = (paginator.itemIntervals[0] as { itemIds: string[] }).itemIds;
      expect(headIds).toEqual(['m90', 'm95']);
    });

    it('reconciling seed clears a sticky isTail so a far older page cannot weld across the gap', () => {
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        paginatorOptions: {},
      });
      // An offline-DB latest window rehydrated as "complete" — isTail:true even though older
      // messages exist on the server (the stale offline window). This is the flag intervalsOverlap
      // consults to decide a merge.
      paginator.ingestPage({
        page: [msg('m90', 90), msg('m95', 95), msg('m100', 100)],
        isHead: true,
        isTail: true,
        setActive: true,
      });
      expect((paginator.itemIntervals[0] as { isTail?: boolean }).isTail).toBe(true);

      // The reconciling seed at the derived page size (a FULL page => older messages remain) must
      // clear the sticky isTail — not just state's hasMoreTail.
      paginator.seedFirstPageSync(
        [msg('m90', 90), msg('m95', 95), msg('m100', 100)],
        3,
        undefined,
        { reconcile: true },
      );
      expect((paginator.itemIntervals[0] as { isTail?: boolean }).isTail).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);

      // Jump to a far OLDER window as a separate interval.
      const island = paginator.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      expect(paginator.itemIntervals.length).toBe(2);

      // Load older from the island: a page older than it, nowhere near the latest window. With a
      // sticky isTail on the latest, intervalsOverlap would (wrongly) treat this as overlapping the
      // latest and weld the two pages-apart sets into one.
      paginator.ingestPage({
        page: [msg('m7', 7), msg('m8', 8), msg('m9', 9)],
        isTail: false,
        setActive: false,
        targetIntervalId: island?.id,
      });

      // Stays two separate intervals — the older page merges only into the island.
      expect(paginator.itemIntervals.length).toBe(2);
    });

    it('reconcile + already-loaded: folds the fresh page and drops a within-span hard-delete', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // m2 hard-deleted while offline; the re-seed's authoritative page comes back without it.
      paginator.seedFirstPageSync([msg('m1', 1), msg('m3', 3)], 3, undefined, {
        reconcile: true,
      });
      expect(ids(paginator)).toEqual(['m1', 'm3']);
      expect(paginator.getItem('m2')).toBeUndefined();
    });

    it('reconcile + snapshot: drops a trailing ghost while keeping a message that arrived during the fetch', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // A live message lands AFTER the pre-fetch snapshot was taken (so it is not in candidateIds).
      paginator.ingestItem(msg('m4', 4));
      const candidateIds = new Set(['m1', 'm2', 'm3']);
      // The page (missing m3 — the hard-deleted newest — and predating m4) is the server truth.
      paginator.seedFirstPageSync([msg('m1', 1), msg('m2', 2)], 3, undefined, {
        reconcile: true,
        candidateIds,
      });
      // m3 removed (in the snapshot, absent from the page, at the top edge); m4 kept (a live arrival).
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm4']);
    });

    it('reconcile on a cold (never-seeded) paginator: plain-seeds the page', () => {
      const paginator = makePaginator();
      expect(paginator.items).toBeUndefined();
      paginator.seedFirstPageSync([msg('m1', 1), msg('m2', 2)], 25, undefined, {
        reconcile: true,
      });
      expect(ids(paginator)).toEqual(['m1', 'm2']);
    });

    it('WITHOUT the reconcile flag: plain-seeds and never reconciles (the pinned-list contract)', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // Same missing-m2 page, but no reconcile flag → additive seed; m2 is NOT removed.
      paginator.seedFirstPageSync([msg('m1', 1), msg('m3', 3)], 3);
      expect(paginator.getItem('m2')).toBeDefined();
    });

    it('reconcile + a jump/around re-seed: applies jump semantics, never reconciles the latest window', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // An around open is not the latest window, so the loaded messages must not be reconciled away.
      paginator.seedFirstPageSync(
        [msg('m5', 5), msg('m6', 6)],
        25,
        { id_around: 'm5' },
        {
          reconcile: true,
        },
      );
      expect(paginator.getItem('m1')).toBeDefined();
      expect(paginator.getItem('m2')).toBeDefined();
      expect(paginator.getItem('m3')).toBeDefined();
    });
  });

  describe('trackLastMessage() / lastMessageAt', () => {
    let skipSystemMessages: boolean;
    let trackingChannel: Channel;

    const buildPaginator = (parentMessageId?: string) => {
      trackingChannel = {
        cid: 'channel-id',
        serverConfig: { skip_last_msg_update_for_system_msgs: skipSystemMessages },
        getReplies: vi.fn(),
        query: vi.fn(),
      } as unknown as Channel;
      return new MessagePaginator({
        channel: trackingChannel,
        parentMessageId,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });
    };

    const at = (iso: string) => new Date(iso).getTime();

    beforeEach(() => {
      skipSystemMessages = false;
    });

    it('is null until a message is tracked', () => {
      const paginator = buildPaginator();
      expect(paginator.aggregateState.getLatestValue()).toEqual({
        lastMessage: null,
        seededLastMessageAt: null,
      });
      expect(paginator.lastMessageAt).toBeNull();
      expect(paginator.lastMessage).toBeNull();
    });

    it('advances lastMessageAt and lastMessage without ingesting a window', () => {
      const paginator = buildPaginator();

      paginator.trackLastMessage(
        createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' }),
      );

      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:00.000Z'));
      // The display message is tracked on aggregateState (reactive off-window), not the visible list.
      expect(paginator.lastMessage?.id).toBe('a');
      expect(paginator.items).toBeUndefined();
    });

    it('seed advances only the timestamp, leaving lastMessage null', () => {
      const paginator = buildPaginator();
      paginator.seedLastMessageAt('2023-05-03T11:12:53.993Z');
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2023-05-03T11:12:53.993Z'));
      // The server seed has a timestamp but not the message itself.
      expect(paginator.lastMessage).toBeNull();
    });

    it('lastMessageAt is the max of the loaded message and the seed; a seed never blocks the display message', () => {
      const paginator = buildPaginator();
      // Server says the newest message is far in the future (not yet loaded).
      paginator.seedLastMessageAt('2030-01-01T00:00:00.000Z');
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2030-01-01T00:00:00.000Z'));
      expect(paginator.lastMessage).toBeNull();

      // A real (older-than-seed) message must still become the display message — the guard is against
      // the display message's own timestamp, not the seed-inflated lastMessageAt.
      paginator.trackLastMessage(
        createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' }),
      );
      expect(paginator.lastMessage?.id).toBe('a');
      // Sort key stays the max (the seed), so it can never drift below the display message.
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2030-01-01T00:00:00.000Z'));

      // Once a message newer than the seed arrives, lastMessageAt follows it.
      paginator.trackLastMessage(
        createMessage({ id: 'b', created_at: '2031-01-01T00:00:00.000Z' }),
      );
      expect(paginator.lastMessage?.id).toBe('b');
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2031-01-01T00:00:00.000Z'));
    });

    it('does not emit on the pagination state (writes the separate aggregateState store)', () => {
      const paginator = buildPaginator();
      let stateEmissions = 0;
      const unsubscribe = paginator.state.subscribe(() => {
        stateEmissions += 1;
      });
      stateEmissions = 0; // ignore the synchronous initial subscribe call

      paginator.trackLastMessage(
        createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' }),
      );
      unsubscribe();

      expect(stateEmissions).toBe(0);
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:00.000Z'));
    });

    it('advances monotonically by created_at', () => {
      const paginator = buildPaginator();

      paginator.trackLastMessage(
        createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' }),
      );
      paginator.trackLastMessage(
        createMessage({ id: 'b', created_at: '2019-01-01T00:00:00.000Z' }),
      );
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:00.000Z'));

      paginator.trackLastMessage(
        createMessage({ id: 'c', created_at: '2021-01-01T00:00:00.000Z' }),
      );
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2021-01-01T00:00:00.000Z'));
    });

    it('never advances for a shadowed message', () => {
      const paginator = buildPaginator();

      paginator.trackLastMessage(
        createMessage({
          id: 'a',
          created_at: '2020-01-01T00:00:00.000Z',
          shadowed: true,
        }),
      );

      expect(paginator.lastMessageAt).toBeNull();
    });

    it('never advances for a thread-only reply, but does for a reply shown in the channel', () => {
      const paginator = buildPaginator();

      paginator.trackLastMessage(
        createMessage({
          id: 'reply',
          parent_id: 'parent',
          created_at: '2020-01-01T00:00:00.000Z',
        }),
      );
      expect(paginator.lastMessageAt).toBeNull();

      paginator.trackLastMessage(
        createMessage({
          id: 'reply-shown',
          parent_id: 'parent',
          show_in_channel: true,
          created_at: '2021-01-01T00:00:00.000Z',
        }),
      );
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2021-01-01T00:00:00.000Z'));
    });

    it('skips system messages only when skip_last_msg_update_for_system_msgs is set', () => {
      skipSystemMessages = true;
      const skipping = buildPaginator();
      const systemMessage = createMessage({
        id: 'sys',
        type: 'system',
        created_at: '2020-01-01T00:00:00.000Z',
      });
      skipping.trackLastMessage(systemMessage);
      expect(skipping.lastMessageAt).toBeNull();

      skipSystemMessages = false;
      const tracking = buildPaginator();
      tracking.trackLastMessage(systemMessage);
      expect(tracking.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:00.000Z'));
    });

    it('auto-tracks on ingestion for the main channel list too', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:00.000Z',
        }),
      );
      // The main list no longer relies on an explicit channel-level call: ingestion advances the
      // lastMessageAt aggregate directly.
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:00.000Z'));
    });

    it('seeds lastMessageAt from the server value (monotonic)', () => {
      const paginator = buildPaginator();

      paginator.seedLastMessageAt('2020-06-01T00:00:00.000Z');
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-06-01T00:00:00.000Z'));

      // an older server value does not move it back
      paginator.seedLastMessageAt('2020-01-01T00:00:00.000Z');
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-06-01T00:00:00.000Z'));

      // a newer ingested message advances past the seed
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2021-01-01T00:00:00.000Z',
        }),
      );
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2021-01-01T00:00:00.000Z'));
    });

    describe('reply list (parentMessageId) auto-tracks on ingestion', () => {
      const reply = (id: string, createdAt: string): LocalMessage =>
        createMessage({
          id,
          cid: 'channel-id',
          parent_id: 'parent',
          created_at: createdAt,
        });

      it('advances to the newest reply on ingestItem, regardless of ingestion order', () => {
        const paginator = buildPaginator('parent');

        paginator.ingestItem(reply('r2', '2020-01-01T00:00:02.000Z'));
        expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:02.000Z'));

        // an older reply arriving later must not move the value back
        paginator.ingestItem(reply('r1', '2020-01-01T00:00:01.000Z'));
        expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:02.000Z'));

        paginator.ingestItem(reply('r3', '2020-01-01T00:00:03.000Z'));
        expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:03.000Z'));
      });

      it('advances to the newest reply when a page is seeded via setItems', () => {
        const paginator = buildPaginator('parent');

        paginator.setItems({
          valueOrFactory: [
            reply('r1', '2020-01-01T00:00:01.000Z'),
            reply('r3', '2020-01-01T00:00:03.000Z'),
            reply('r2', '2020-01-01T00:00:02.000Z'),
          ],
          isFirstPage: true,
        });

        expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:03.000Z'));
      });
    });

    it('resets lastMessageAt on clearStateAndCache()', () => {
      const paginator = buildPaginator();
      paginator.trackLastMessage(
        createMessage({ id: 'a', created_at: '2020-01-01T00:00:00.000Z' }),
      );
      expect(paginator.lastMessageAt?.getTime()).toBe(at('2020-01-01T00:00:00.000Z'));

      paginator.clearStateAndCache();

      expect(paginator.lastMessageAt).toBeNull();
    });

    it('refreshes lastMessage in place (and emits) when the current latest is edited', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:00.000Z',
          text: 'hello',
        }),
      );
      expect(paginator.lastMessage?.text).toBe('hello');

      let emissions = 0;
      const unsubscribe = paginator.aggregateState.subscribe(() => {
        emissions += 1;
      });
      emissions = 0;

      // edit: same id + same created_at (monotonic guard would otherwise reject it)
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:00.000Z',
          text: 'edited',
        }),
      );
      unsubscribe();

      expect(paginator.lastMessage?.text).toBe('edited');
      expect(emissions).toBe(1);
    });

    it('reflects a soft-delete of the current latest', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:00.000Z',
        }),
      );
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:00.000Z',
          type: 'deleted',
          deleted_at: '2020-01-02T00:00:00.000Z',
        }),
      );
      expect(paginator.lastMessage?.type).toBe('deleted');
    });

    it('recomputes lastMessage to the next newest when the current latest is hard-removed', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:00.000Z',
        }),
      );
      paginator.ingestItem(
        createMessage({
          id: 'b',
          cid: 'channel-id',
          created_at: '2020-01-02T00:00:00.000Z',
        }),
      );
      expect(paginator.lastMessage?.id).toBe('b');

      paginator.removeItem({ id: 'b' });
      expect(paginator.lastMessage?.id).toBe('a');

      paginator.removeItem({ id: 'a' });
      expect(paginator.lastMessage).toBeNull();
    });

    it('recompute after hard-remove skips a trailing system message (unlike the unfiltered headmostItem)', () => {
      skipSystemMessages = true;
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'm0',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:01.000Z',
        }),
      );
      paginator.ingestItem(
        createMessage({
          id: 'm1',
          cid: 'channel-id',
          created_at: '2020-01-01T00:00:02.000Z',
        }),
      );
      // A system message is the newest LOADED item, but the config keeps it from becoming the latest.
      paginator.ingestItem(
        createMessage({
          id: 'sys',
          cid: 'channel-id',
          type: 'system',
          created_at: '2020-01-01T00:00:03.000Z',
        }),
      );
      expect(paginator.lastMessage?.id).toBe('m1');
      expect(paginator.headmostItem?.id).toBe('sys'); // headmostItem is unfiltered

      // Hard-removing the tracked latest must recompute to the previous NON-system message (m0),
      // not to `headmostItem` (which is the system message).
      paginator.removeItem({ id: 'm1' });
      expect(paginator.lastMessage?.id).toBe('m0');
    });
  });
});
