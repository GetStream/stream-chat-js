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
        queryShape: { created_at_around: lastReadAt.toISOString(), limit: 25 },
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

    it('preserves hasMoreTail / cursor.tailward when merging a partial newest window', () => {
      // Only the newest window is loaded and older items still exist (hasMoreTail true). Merging a
      // short page (fewer than pageSize) whose first item is the set's first item must NOT clear
      // hasMoreTail: re-deriving it from this page's length would wrongly break "load older", so the
      // merge preserves the existing hasMoreTail / cursor instead.
      const { paginator, m1, m2 } = setupLoadedHead({ isTail: false });
      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      const tailwardBefore = paginator.state.getLatestValue().cursor?.tailward;

      const editedM3 = m('m3', '03', { text: 'edited' });
      paginator.mergeNewestPage([m1, m2, editedM3]);

      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe(tailwardBefore);
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
      const tailwardBefore = paginator.state.getLatestValue().cursor?.tailward;
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
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe(tailwardBefore);
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

  describe('trackLastMessage() / lastMessageAt', () => {
    let skipSystemMessages: boolean;
    let trackingChannel: Channel;

    const buildPaginator = (parentMessageId?: string) => {
      trackingChannel = {
        cid: 'channel-id',
        getConfig: () => ({ skip_last_msg_update_for_system_msgs: skipSystemMessages }),
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
