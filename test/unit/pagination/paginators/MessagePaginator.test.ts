import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZERO_PAGE_CURSOR } from '../../../../src/pagination/paginators/BasePaginator';
import type {
  Interval,
  PaginationQueryParams,
} from '../../../../src/pagination/paginators/BasePaginator';
import type { MessageQueryShape } from '../../../../src/pagination/paginators/MessageIntervalPaginator';
import { MessagePaginator } from '../../../../src/pagination/paginators/MessagePaginator';
import { EntityStore } from '../../../../src/entityStore/EntityStore';
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
import { convertDateToTimestamp } from '../../test-utils/time';
import { fakeChannelQuery } from '../../test-utils/fakeChannelQuery';
import { nsToDate } from '../../../../src/utils/time';

/**
 * Places the newest page of an external query as `client.hydrateChannels` does: reconciles the
 * loaded newest messages with it, or places it as the first page when none are loaded.
 */
const hydrateNewestPage = (
  paginator: MessagePaginator,
  page: LocalMessage[],
  requestedPageSize: number,
  {
    headIntervalItemIdsAtRequest,
  }: { headIntervalItemIdsAtRequest?: ReadonlySet<string> } = {},
) =>
  paginator.placeExternalNewestPage(page, {
    headIntervalItemIdsAtRequest,
    requestedLimit: requestedPageSize,
  });

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
      ...fakeChannelQuery,
    } as unknown as Channel;
    // The paginator calls `channel.getClient().getReplies(...)`; point that at the same spy so
    // the assertions below keep reading `channel.getReplies`.
    (channel as unknown as { getClient: () => unknown }).getClient = () => channel;
    itemIndex = new StoreBackedItemIndex<LocalMessage>({
      getEntityId: (message) => message.id,
    });
  });

  // The fetching and extracting steps of the query pipeline, as `executeQuery` runs them.
  const fetchAndExtractQueryPage = async (
    paginator: MessagePaginator,
    params: PaginationQueryParams<MessageQueryShape>,
  ) =>
    // @ts-expect-error calling the protected fetching and extracting steps
    paginator.extractQueryPage(await paginator.fetchQueryResponse(params), params);

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
        latestMessage: null,
        queriedLatestMessageAt: null,
      });
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(1);

      const newer = createMessage({
        id: 'b',
        created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
      });
      const older = createMessage({
        id: 'a',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      expect(paginator.sortComparator(older, newer)).toBeLessThan(0);
      expect(paginator.sortComparator(newer, older)).toBeGreaterThan(0);

      const sameDateA = createMessage({
        id: 'a',
        created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
      });
      const sameDateB = createMessage({
        id: 'b',
        created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
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

      const newer = createMessage({
        id: 'b',
        created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
      });
      const older = createMessage({
        id: 'a',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
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

  describe('fetchQueryResponse() and extractQueryPage()', () => {
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
      // @ts-expect-error spying on protected method
      const getNextQueryShapeSpy = vi.spyOn(paginator, 'getNextQueryShape');

      const result = await fetchAndExtractQueryPage(paginator, {
        direction: 'headward',
        queryShape: { custom: 'shape' } as unknown as MessagePaginationOptions,
      });

      expect(paginator.config.doRequest).toHaveBeenCalledWith({ custom: 'shape' });
      expect(result.headward).toBe('head');
      expect(result.tailward).toBeUndefined();
      expect(getNextQueryShapeSpy).not.toHaveBeenCalled();
    });

    it('requests the query shape it prepared, even when a page is placed before the request', async () => {
      (channel.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
      });
      const paginator = new MessagePaginator({ channel, itemIndex });

      // a first page waits for the offline preload before its request goes out
      const query = paginator.executeQuery({
        queryShape: { id_around: 'm5', limit: 10 },
      });
      // a page placed meanwhile, as `watch()` places one
      paginator.placeExternalQueryPage([createMessage({ id: 'm9' })], 10);
      await query;

      expect(channel.query).toHaveBeenCalledWith({
        messages: { id_around: 'm5', limit: 10 },
      });
    });

    it('formats channel query results and sets cursors based on direction', async () => {
      const messages = [
        { id: 'first', created_at: convertDateToTimestamp('2022-01-01T00:00:00.000Z') },
        { id: 'last', created_at: convertDateToTimestamp('2022-01-02T00:00:00.000Z') },
      ];
      (channel.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages,
      });
      const paginator = new MessagePaginator({ channel, itemIndex });
      const result = await fetchAndExtractQueryPage(paginator, {
        queryShape: { id_gt: 'from-cursor', limit: 30 },
      });

      expect(channel.query).toHaveBeenCalledWith({
        messages: { id_gt: 'from-cursor', limit: 30 },
      });
      expect(result.tailward).toBe('first');
      expect(result.headward).toBe('last');
      // Extracting the page formats the messages but must not transform timestamps: they stay the
      // wire numbers.
      expect(result.items[0].created_at).toBe(messages[0].created_at);
      expect(result.items[1].created_at).toBe(messages[1].created_at);
    });

    it('queries replies endpoint when parentMessageId is provided', async () => {
      const messages = [
        {
          id: 'first-reply',
          created_at: convertDateToTimestamp('2022-01-01T00:00:00.000Z'),
        },
        {
          id: 'last-reply',
          created_at: convertDateToTimestamp('2022-01-02T00:00:00.000Z'),
        },
      ];
      (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages,
      });
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      const result = await fetchAndExtractQueryPage(paginator, {
        queryShape: { id_gt: 'from-cursor', limit: 30 },
      });

      expect(channel.getReplies).toHaveBeenCalledWith(
        { parent_id: 'parent-1' },
        {
          id_gt: 'from-cursor',
          limit: 30,
          sort: [{ field: 'created_at', direction: 1 }],
        },
      );
      expect(channel.query).not.toHaveBeenCalled();
      expect(result.tailward).toBe('first-reply');
      expect(result.headward).toBe('last-reply');
      // Extracting the page formats the messages but must not transform timestamps: they stay the
      // wire numbers.
      expect(result.items[0].created_at).toBe(messages[0].created_at);
      expect(result.items[1].created_at).toBe(messages[1].created_at);
    });

    it('keeps items ordered chronologically when itemOrder is ascending and request sort is descending', async () => {
      const messages = [
        {
          id: 'newest-reply',
          created_at: convertDateToTimestamp('2022-01-03T00:00:00.000Z'),
        },
        {
          id: 'middle-reply',
          created_at: convertDateToTimestamp('2022-01-02T00:00:00.000Z'),
        },
        {
          id: 'oldest-reply',
          created_at: convertDateToTimestamp('2022-01-01T00:00:00.000Z'),
        },
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
      const result = await fetchAndExtractQueryPage(paginator, {
        queryShape: { id_gt: 'from-cursor', limit: 30 },
      });

      expect(channel.getReplies).toHaveBeenCalledWith(
        { parent_id: 'parent-1' },
        {
          id_gt: 'from-cursor',
          limit: 30,
          sort: [{ field: 'created_at', direction: -1 }],
        },
      );
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
        createMessage({
          id: 'target-message',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
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
        claimsActiveInterval: true,
        queryShape: { id_around: 'target-message', limit: 13 },
        updateState: false,
      });
      expect(result).toBe(true);
    });

    describe('watchChannel', () => {
      const target = () =>
        createMessage({
          cid: 'channel-id',
          id: 'target',
          created_at: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });
      const respondWith = (messages: LocalMessage[]) =>
        (channel.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
          messages,
        });
      const setWatchStatus = (watchStatus: string) =>
        ((channel as unknown as { watchStatus: string }).watchStatus = watchStatus);

      it('watches an unwatched channel with the request that loads the message', async () => {
        setWatchStatus('notWatching');
        respondWith([target()]);
        const paginator = new MessagePaginator({ channel, itemIndex });

        expect(
          await paginator.jumpToMessage('target', { pageSize: 13, watchChannel: true }),
        ).toBe(true);

        expect(channel.query).toHaveBeenCalledTimes(1);
        expect(channel.query).toHaveBeenCalledWith({
          messages: { id_around: 'target', limit: 13 },
          watch: true,
        });
      });

      it('sends one request to watch when the message is already loaded', async () => {
        setWatchStatus('notWatching');
        respondWith([target()]);
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({ page: [target()], isHead: true, setActive: true });

        expect(await paginator.jumpToMessage('target', { watchChannel: true })).toBe(
          true,
        );

        expect(channel.query).toHaveBeenCalledTimes(1);
        expect(channel.query).toHaveBeenCalledWith(
          expect.objectContaining({ watch: true }),
        );
      });

      it('does not watch a channel that is already watched', async () => {
        setWatchStatus('watching');
        respondWith([target()]);
        const paginator = new MessagePaginator({ channel, itemIndex });

        await paginator.jumpToMessage('target', { watchChannel: true });

        expect(channel.query).toHaveBeenCalledWith({
          messages: { id_around: 'target', limit: paginator.pageSize },
        });
      });

      it('does not watch without the option', async () => {
        setWatchStatus('notWatching');
        respondWith([target()]);
        const paginator = new MessagePaginator({ channel, itemIndex });

        await paginator.jumpToMessage('target');

        expect(channel.query).toHaveBeenCalledWith({
          messages: { id_around: 'target', limit: paginator.pageSize },
        });
      });

      it('asks only the jump request to watch, not later page requests', async () => {
        setWatchStatus('notWatching');
        respondWith([target()]);
        const paginator = new MessagePaginator({ channel, itemIndex });
        await paginator.jumpToMessage('target', { watchChannel: true });

        await fetchAndExtractQueryPage(paginator, {
          direction: 'tailward',
          queryShape: { id_lt: 'target', limit: 30 },
        });

        expect(channel.query).toHaveBeenLastCalledWith({
          messages: { id_lt: 'target', limit: 30 },
        });
      });

      it('asks to watch again when the request is retried', async () => {
        vi.useFakeTimers();
        (channel.query as unknown as ReturnType<typeof vi.fn>)
          .mockRejectedValueOnce(new Error('network'))
          .mockResolvedValue({ messages: [target()] });
        const paginator = new MessagePaginator({ channel, itemIndex });

        const done = paginator.executeQuery({
          queryShape: { id_around: 'target' },
          requestOptions: { watch: true },
          retryCount: 1,
          updateState: false,
        });
        await vi.runAllTimersAsync();
        await done;
        vi.useRealTimers();

        expect(channel.query).toHaveBeenCalledTimes(2);
        expect(
          (channel.query as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
            ([payload]) => payload.watch,
          ),
        ).toEqual([true, true]);
      });

      it('is ignored for a thread reply list, whose request cannot watch', async () => {
        setWatchStatus('notWatching');
        (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
          messages: [target()],
        });
        const paginator = new MessagePaginator({
          channel,
          itemIndex,
          parentMessageId: 'parent-1',
        });

        await paginator.jumpToMessage('target', { watchChannel: true });

        expect(channel.getReplies).toHaveBeenCalledTimes(1);
        expect(channel.query).not.toHaveBeenCalled();
      });
    });

    it('updates cursor when jumping between already loaded intervals', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      const m4 = createMessage({
        cid: 'channel-id',
        id: 'm4',
        created_at: convertDateToTimestamp('2020-01-04T00:00:00.000Z'),
      });
      const m5 = createMessage({
        cid: 'channel-id',
        id: 'm5',
        created_at: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
      });
      const m8 = createMessage({
        cid: 'channel-id',
        id: 'm8',
        created_at: convertDateToTimestamp('2020-01-08T00:00:00.000Z'),
      });
      const m9 = createMessage({
        cid: 'channel-id',
        id: 'm9',
        created_at: convertDateToTimestamp('2020-01-09T00:00:00.000Z'),
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
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      const target = createMessage({
        cid: 'channel-id',
        id: 'm-target',
        created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
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
          created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
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
          generateMsg({
            id: 'm1',
            created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
          }),
          generateMsg({
            id: 'm2',
            created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
          }),
          generateMsg({
            id: 'm3',
            created_at: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
          }),
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
          created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
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
          generateMsg({
            id: 'm1',
            created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
          }),
          generateMsg({
            id: 'm2',
            created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
          }),
          generateMsg({
            id: 'm3',
            created_at: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
          }),
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
      const m1 = createMessage({
        id: 'm1',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      const m2 = createMessage({
        id: 'm2',
        created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
      });
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
          created_at: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
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
            created_at: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
          }),
          createMessage({
            id: 'peer',
            cid: 'channel-id',
            parent_id: 'parent-1',
            created_at: convertDateToTimestamp('2020-01-06T00:00:00.000Z'),
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

    it('marks the window being read as the head when the newest page is that window', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      const m4 = createMessage({
        id: 'm4',
        created_at: convertDateToTimestamp('2020-01-04T00:00:00.000Z'),
      });
      const m5 = createMessage({
        id: 'm5',
        created_at: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
      });
      // A window not known to reach the newest message is active (as after jumping to an older
      // message), so jumping to the latest message queries the newest page.
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
      // No newer messages exist on the server: the newest page is the window being read.
      (channel.getReplies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [m4, m5],
      });

      const result = await paginator.jumpToTheLatestMessage();

      // The newest page asks for no cursor and merges into the window, which reaches the head, so
      // the jump succeeds - no "Jump to latest message unsuccessful" error.
      expect(result).toBe(true);
      expect(channel.getReplies).toHaveBeenCalledWith(
        { parent_id: 'parent-1' },
        expect.not.objectContaining({ id_gt: expect.anything() }),
      );
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
        ...fakeChannelQuery,
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
        ...fakeChannelQuery,
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

    it('still infers the unread boundary when lastReadAt is the epoch', async () => {
      // A truthiness guard would skip the inference branch for the epoch sentinel entirely.
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        ...fakeChannelQuery,
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: 0,
              last_read_message_id: null,
            },
          },
        },
        getClient: () => ({ user: { id: 'user1' } }),
      } as unknown as Channel;

      const paginator = new MessagePaginator({
        channel: channelWithReadState,
        itemIndex,
      });
      const executeQuerySpy = vi.spyOn(paginator, 'executeQuery').mockResolvedValue({
        stateCandidate: {
          items: [
            createMessage({
              created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
              id: 'm-first',
            }),
            createMessage({
              created_at: convertDateToTimestamp('2021-01-03T00:00:00.000Z'),
              id: 'm-second',
            }),
          ],
        },
        targetInterval: null,
      });
      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage({ pageSize: 25 });

      expect(ok).toBe(true);
      expect(executeQuerySpy).toHaveBeenCalledWith({
        claimsActiveInterval: true,
        queryShape: { created_at_around: nsToDate(0), limit: 25 },
        updateState: false,
      });
      expect(jumpSpy).toHaveBeenCalledWith(
        'm-first',
        expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
      );
    });

    // `nsToDate(NaN)` is an `Invalid Date`, which `JSON.stringify` emits as `null` — so the query
    // used to go out with `created_at_around: null`. The row is not a usable boundary; fall through.
    it.each([
      ['NaN', Number.NaN],
      ['an ISO string', '2021-01-02T00:00:00.000Z'],
    ])(
      'does not query created_at_around when lastReadAt is %s',
      async (_label, lastRead) => {
        const channelWithReadState = {
          cid: 'channel-id',
          query: vi.fn(),
          ...fakeChannelQuery,
          state: {
            read: {
              user1: {
                first_unread_message_id: null,
                last_read: lastRead,
                last_read_message_id: 'm-last-read',
              },
            },
          },
          getClient: () => ({ user: { id: 'user1' } }),
        } as unknown as Channel;

        const paginator = new MessagePaginator({
          channel: channelWithReadState,
          itemIndex,
        });
        const executeQuerySpy = vi.spyOn(paginator, 'executeQuery');
        const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

        const ok = await paginator.jumpToTheFirstUnreadMessage({ pageSize: 25 });

        expect(executeQuerySpy).not.toHaveBeenCalled();
        // Falls through to the last-read id we do have.
        expect(ok).toBe(true);
        expect(jumpSpy).toHaveBeenCalledWith(
          'm-last-read',
          expect.objectContaining({ focusReason: 'jump-to-first-unread' }),
        );
      },
    );

    it('falls back to created_at_around query when unread ids are missing and lastReadAt exists', async () => {
      const lastReadAt = convertDateToTimestamp('2021-01-02T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        ...fakeChannelQuery,
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: convertDateToTimestamp(lastReadAt),
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
            createMessage({
              created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
              id: 'm-read',
            }),
            createMessage({
              created_at: convertDateToTimestamp('2021-01-03T00:00:00.000Z'),
              id: 'm-unread',
            }),
          ],
        },
        targetInterval: null,
      });
      const jumpSpy = vi.spyOn(paginator, 'jumpToMessage').mockResolvedValue(true);

      const ok = await paginator.jumpToTheFirstUnreadMessage({ pageSize: 25 });

      expect(ok).toBe(true);
      expect(executeQuerySpy).toHaveBeenCalledWith({
        claimsActiveInterval: true,
        // `created_at_around` is a request field, so the paginator converts back to a `Date`.
        queryShape: { created_at_around: nsToDate(lastReadAt), limit: 25 },
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
      const lastReadAt = convertDateToTimestamp('2021-01-01T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        ...fakeChannelQuery,
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: convertDateToTimestamp(lastReadAt),
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
              created_at: convertDateToTimestamp('2021-01-02T00:00:00.000Z'),
              id: 'm-first-unread',
            }),
            createMessage({
              created_at: convertDateToTimestamp('2021-01-03T00:00:00.000Z'),
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
      const lastReadAt = convertDateToTimestamp('2021-01-02T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        ...fakeChannelQuery,
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: convertDateToTimestamp(lastReadAt),
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
          createMessage({
            created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
            id: 'm-read',
          }),
          createMessage({
            created_at: convertDateToTimestamp('2021-01-03T00:00:00.000Z'),
            id: 'm-unread',
          }),
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
      const lastReadAt = convertDateToTimestamp('2021-05-01T00:00:00.000Z');
      const channelWithReadState = {
        cid: 'channel-id',
        query: vi.fn(),
        ...fakeChannelQuery,
        state: {
          read: {
            user1: {
              first_unread_message_id: null,
              last_read: convertDateToTimestamp(lastReadAt),
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
        ...fakeChannelQuery,
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
    it('emits once for the whole sweep, not once per deleted message', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      const bannedUser = { id: 'banned-user' };
      paginator.setItems({
        valueOrFactory: Array.from({ length: 10 }, (_, i) =>
          createMessage({
            cid: channel.cid,
            id: `banned-${i}`,
            user: bannedUser,
            created_at: convertDateToTimestamp(`2025-02-01T14:0${i}:00.000Z`),
          }),
        ),
        isFirstPage: true,
        isLastPage: true,
      });

      let emits = 0;
      const unsubscribe = paginator.state.subscribe(() => {
        emits += 1;
      });
      emits = 0; // discard the synchronous initial emit

      paginator.applyMessageDeletionForUser({
        userId: bannedUser.id,
        hardDelete: false,
        deletedAt: convertDateToTimestamp('2025-02-01T14:01:30.000Z'),
      });

      // One logical operation, one emit — regardless of how many messages it touched.
      expect(emits).toBe(1);
      expect(paginator.items?.every((m) => m.type === 'deleted')).toBe(true);
      expect(paginator.items).toHaveLength(10);

      unsubscribe();
    });

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

    describe('after a jump to an older message', () => {
      const bannedUser = { id: 'banned-user' };
      const otherUser = { id: 'other-user' };
      const at = (minute: number) =>
        convertDateToTimestamp(
          `2025-02-01T14:${String(minute).padStart(2, '0')}:00.000Z`,
        );

      // The head interval holds the banned user's newest message and a quote of it; the viewer
      // has jumped to a disjoint older interval, so neither is in `items`.
      const setupJumpedAway = () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        const bannedHeadMessage = createMessage({
          cid: channel.cid,
          created_at: at(50),
          id: 'banned-head',
          user: bannedUser,
        });
        const headQuoteCarrier = createMessage({
          cid: channel.cid,
          created_at: at(51),
          id: 'head-quote-carrier',
          quoted_message: bannedHeadMessage,
          quoted_message_id: bannedHeadMessage.id,
          user: otherUser,
        });
        paginator.ingestPage({
          page: [bannedHeadMessage, headQuoteCarrier],
          isHead: true,
          isTail: false,
          setActive: true,
        });
        paginator.ingestPage({
          page: [
            createMessage({
              cid: channel.cid,
              created_at: at(1),
              id: 'old-1',
              user: otherUser,
            }),
            createMessage({
              cid: channel.cid,
              created_at: at(2),
              id: 'old-2',
              user: otherUser,
            }),
          ],
          isHead: false,
          isTail: false,
          setActive: true,
        });
        expect(paginator.items?.map((m) => m.id)).toEqual(['old-1', 'old-2']);
        return { bannedHeadMessage, headQuoteCarrier, paginator };
      };

      it('soft deletes the user messages in the head interval', () => {
        const { bannedHeadMessage, headQuoteCarrier, paginator } = setupJumpedAway();

        paginator.applyMessageDeletionForUser({
          userId: bannedUser.id,
          hardDelete: false,
          deletedAt: at(55),
        });

        expect(paginator.getItem(bannedHeadMessage.id)?.type).toBe('deleted');
        expect(paginator.getItem(headQuoteCarrier.id)?.quoted_message?.type).toBe(
          'deleted',
        );
        expect(
          paginator.anchoredHeadItems.find((m) => m.id === bannedHeadMessage.id)?.type,
        ).toBe('deleted');
        expect(paginator.items?.map((m) => m.id)).toEqual(['old-1', 'old-2']);
      });

      it('hard deletes the user messages in the head interval', () => {
        const { bannedHeadMessage, headQuoteCarrier, paginator } = setupJumpedAway();

        paginator.applyMessageDeletionForUser({
          userId: bannedUser.id,
          hardDelete: true,
          deletedAt: at(55),
        });

        expect(paginator.getItem(bannedHeadMessage.id)).toBeUndefined();
        expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual([
          headQuoteCarrier.id,
        ]);
        expect(paginator.getItem(headQuoteCarrier.id)?.quoted_message?.type).toBe(
          'deleted',
        );
        expect(paginator.items?.map((m) => m.id)).toEqual(['old-1', 'old-2']);
      });
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
        created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
      });
      const byB = createMessage({
        id: 'b1',
        user: { id: 'B' },
        created_at: convertDateToTimestamp('2021-01-02T00:00:00.000Z'),
      });
      const byA2 = createMessage({
        id: 'a2',
        user: { id: 'A' },
        created_at: convertDateToTimestamp('2021-01-03T00:00:00.000Z'),
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

    it('renames the author of the latest message', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestPage({
        page: [
          createMessage({
            id: 'a1',
            user: { id: 'A' },
            created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
          }),
        ],
        isHead: true,
        isTail: true,
        setActive: true,
      });

      paginator.reflectUserUpdate({ id: 'A', name: 'Renamed A' });

      expect(paginator.latestMessage?.user?.name).toBe('Renamed A');
    });

    it('leaves the latest message alone when another user is renamed', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestPage({
        page: [
          createMessage({
            id: 'b1',
            user: { id: 'B', name: 'B' },
            created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
          }),
        ],
        isHead: true,
        isTail: true,
        setActive: true,
      });
      const latestMessage = paginator.latestMessage;

      paginator.reflectUserUpdate({ id: 'A', name: 'Renamed A' });

      expect(paginator.latestMessage).toBe(latestMessage);
    });

    it('skips messages already carrying the same user object, so siblings are not dirtied back', () => {
      // Two collections over ONE store, as channel.messagePaginator and pinnedMessagesPaginator
      // are. Both run reflectUserUpdate for the same event; without the reference guard the second
      // re-spreads every message into a fresh snapshot whose only effect is to dirty the first.
      //
      // The paginators must build their OWN index so each registers itself as the store's
      // subscriber — passing `itemIndex` in would use NOOP_OWNER and no fan-out could occur at all,
      // which makes the assertion pass vacuously.
      const store = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
      const linkedChannel = {
        ...channel,
        getClient: () => ({ messageStore: store, userId: 'me' }),
      } as unknown as Channel;
      const make = () => new MessagePaginator({ channel: linkedChannel });
      const first = make();
      const second = make();
      const page = [
        createMessage({
          cid: linkedChannel.cid,
          id: 'a1',
          user: { id: 'A' },
          created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
        }),
      ];
      first.ingestPage({ page, isHead: true, isTail: true, setActive: true });
      second.ingestPage({ page, isHead: true, isTail: true, setActive: true });
      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);

      let firstEmits = 0;
      const unsubscribe = first.state.subscribe(() => {
        firstEmits += 1;
      });
      firstEmits = 0;

      const renamed = { id: 'A', name: 'Renamed A' };
      first.reflectUserUpdate(renamed);
      second.reflectUserUpdate(renamed);

      // One emit for its own write; the sibling's pass is a no-op rather than a second round trip.
      expect(firstEmits).toBe(1);
      expect(first.getItem('a1')?.user?.name).toBe('Renamed A');
      expect(second.getItem('a1')?.user?.name).toBe('Renamed A');

      unsubscribe();
    });
  });

  describe('latest message refreshed from the store', () => {
    const setup = () => {
      const store = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
      const linkedChannel = {
        ...channel,
        getClient: () => ({ messageStore: store, userId: 'me' }),
      } as unknown as Channel;
      const paginator = new MessagePaginator({ channel: linkedChannel });
      const message = (id: string, day: string) =>
        createMessage({
          cid: linkedChannel.cid,
          id,
          user: { id: 'A' },
          created_at: convertDateToTimestamp(`2021-01-${day}T00:00:00.000Z`),
        });
      return { message, paginator, store };
    };

    it('reflects a write to the store that does not go through the paginator', () => {
      const { message, paginator, store } = setup();
      const latest = message('m1', '01');
      paginator.ingestPage({
        page: [latest],
        isHead: true,
        isTail: true,
        setActive: true,
      });

      // a soft delete writes the store directly
      store.upsert({ ...latest, type: 'deleted' });

      expect(paginator.latestMessage?.type).toBe('deleted');
    });
  });

  describe.todo('placeQueryPage and deriveCursor for', () => {});
  describe('linear pagination', () => {
    describe('updates the hasMoreTail flag only if the first message on page is the first message in interval', () => {
      it('no query shape is given', () => {
        // const paginator = new MessagePaginator({ channel, itemIndex });
        // paginator.placeQueryPage({
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
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      const newer = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
      });
      itemIndex.setMany([older, newer]);

      const intervalA = paginator.makeInterval({ page: [older] });
      const intervalB = paginator.makeInterval({ page: [newer] });

      // @ts-expect-error accessing protected method
      const sorted = paginator.sortIntervals([intervalA, intervalB]);
      expect(sorted[0].id).toBe(intervalB.id);
      expect(sorted[1].id).toBe(intervalA.id);
    });

    it('sorts an interval without bounds after the bounded ones', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      const older = createMessage({
        cid: 'channel-id',
        id: 'm1',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      const newer = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
      });
      itemIndex.setMany([older, newer]);

      const intervalA = paginator.makeInterval({ page: [older] });
      const intervalB = paginator.makeInterval({ page: [newer] });
      const empty = { ...paginator.makeInterval({ page: [] }), id: 'empty' };

      // @ts-expect-error accessing protected method
      const sorted = paginator.sortIntervals([intervalA, empty, intervalB]);
      expect(sorted.map((itv: Interval) => itv.id)).toEqual([
        intervalB.id,
        intervalA.id,
        'empty',
      ]);
    });

    it('ingests a newer live message into the head interval (not logical tail)', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      const m1 = createMessage({
        cid: 'channel-id',
        id: 'm1',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      const m2 = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
      });
      paginator.setItems({
        valueOrFactory: [m1, m2],
        isFirstPage: true,
        isLastPage: true,
      });

      const m3 = createMessage({
        cid: 'channel-id',
        id: 'm3',
        created_at: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
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
      const paginator = new MessagePaginator({ channel, itemIndex });

      const m1 = createMessage({
        cid: 'channel-id',
        id: 'm1',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      const m2 = createMessage({
        cid: 'channel-id',
        id: 'm2',
        created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
      });
      const m3 = createMessage({
        cid: 'channel-id',
        id: 'm3',
        created_at: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
      });
      const around = createMessage({
        cid: 'channel-id',
        id: 'm4',
        created_at: convertDateToTimestamp('2020-01-04T00:00:00.000Z'),
      });
      // newest message is shadowed -> filtered out before interval ingestion
      const newestShadowed = createMessage({
        cid: 'channel-id',
        id: 'm5',
        created_at: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        shadowed: true,
      });

      const { targetInterval } = await paginator.placeQueryPage({
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

  describe('placeExternalQueryPage()', () => {
    const msg = (id: string, day: string) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
      });

    it('reports a first page only when it shows the newest page as one', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      // stored only: a jump is the paginator's own methods' to show
      expect(
        paginator.placeExternalQueryPage([msg('m4', '04')], 5, { id_around: 'm4' }),
      ).toBe(false);
      expect(
        paginator.placeExternalQueryPage([msg('m8', '08'), msg('m9', '09')], 100),
      ).toBe(true);
      expect(
        paginator.placeExternalQueryPage([msg('m1', '01')], 5, { id_lt: 'm2' }),
      ).toBe(false);
    });

    it('places a newest page as the head window (nothing newer to load)', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      // Fewer messages than the requested page size => dataset edges reached both ways.
      paginator.placeExternalQueryPage([msg('m8', '08'), msg('m9', '09')], 100);

      expect(paginator.anchoredHeadItem?.id).toBe('m9');
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.hasMoreTail).toBe(false);
    });

    it('places a page into a list loaded empty, rather than dropping it', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      // a channel opened while it had no messages: loaded, with nothing in it
      paginator.placeExternalQueryPage([], 100);
      expect(paginator.items).toEqual([]);

      // a later query of the same channel (a re-query, or `watch()` of a channel created from members)
      hydrateNewestPage(paginator, [msg('m8', '08'), msg('m9', '09')], 100, {
        headIntervalItemIdsAtRequest: new Set(),
      });

      expect(paginator.items?.map((m) => m.id)).toEqual(['m8', 'm9']);
      expect(paginator.anchoredHeadItem?.id).toBe('m9');
    });

    it('stores an around/jump page as a middle window, not the head', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      // A full page centered on m6: messages exist on both sides beyond this window, so the
      // paginator must NOT flag it as the latest (head) page — regression for a channel watched
      // with `messages: { id_around }` rather than the latest page.
      paginator.placeExternalQueryPage(
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

      const window = paginator.itemIntervals.find((interval) =>
        (interval as Interval).itemIds?.includes('m6'),
      ) as Interval;
      expect(window.isHead).toBeFalsy();
      expect(window.hasMoreHead).toBe(true);
      expect(window.hasMoreTail).toBe(true);
    });
  });

  describe('marking the newest window (isHead)', () => {
    const msg = (id: string, day: string) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
      });
    const page = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) =>
        msg(`m${from + i}`, String(from + i).padStart(2, '0')),
      );
    // the stored window holding `id`, shown or not
    const windowOf = (paginator: MessagePaginator, id: string) =>
      paginator.itemIntervals.find((interval) =>
        (interval as Interval).itemIds?.includes(id),
      ) as Interval;
    const headOf = (paginator: MessagePaginator) => {
      const head = paginator.itemIntervals.find(
        (interval) => (interval as Interval).isHead,
      ) as Interval | undefined;
      return head?.itemIds;
    };

    it('marks the latest page as the newest window when a live message is already loaded', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      // arrived live before the channel's first page was loaded
      paginator.ingestItem(msg('live', '20'));

      paginator.placeExternalQueryPage(page(4, 8), 5);

      expect(headOf(paginator)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8', 'live']);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.cursor?.headward).toBeNull();
    });

    it('marks the latest page as the newest window when a live message arrives during its request', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestItem(msg('live', '20'));

      await paginator.placeQueryPage({
        direction: 'tailward',
        isFirstPage: true,
        queryShape: { limit: 5 },
        requestedPageSize: 5,
        results: { items: page(4, 8) },
        updateState: true,
      });

      expect(headOf(paginator)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8', 'live']);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.cursor?.headward).toBeNull();
    });

    it('keeps the fresh page on a reconnect after a live message joined the newest window', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestItem(msg('live', '20'));
      paginator.placeExternalQueryPage(page(4, 8), 5);

      // reconnect: the server's newest page now includes messages sent while offline
      hydrateNewestPage(paginator, [...page(9, 12), msg('live', '20')], 5, {
        headIntervalItemIdsAtRequest: new Set(['m4', 'm5', 'm6', 'm7', 'm8', 'live']),
      });

      expect(paginator.getItem('m12')).toBeDefined();
      expect(headOf(paginator)).toContain('m12');
    });

    it('keeps the newest page on a reconnect while only a jumped-to window is loaded', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      // the reader jumped to m3 (a paginator method shows the window it jumps to)
      paginator.ingestPage({ page: page(1, 5), setActive: true });

      hydrateNewestPage(paginator, page(20, 24), 5, {
        headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
      });

      // the newest page is kept as the newest window, while the window being read stays active
      expect(headOf(paginator)).toEqual(['m20', 'm21', 'm22', 'm23', 'm24']);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual([
        'm20',
        'm21',
        'm22',
        'm23',
        'm24',
      ]);
    });

    it('does not mark an older page as the newest window', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      // a short page of messages older than m9: the start of the channel, not its newest end
      paginator.placeExternalQueryPage(page(1, 2), 5, { id_lt: 'm9' });

      expect(headOf(paginator)).toBeUndefined();
      expect(windowOf(paginator, 'm1').hasMoreHead).toBe(true);
      expect(windowOf(paginator, 'm1').hasMoreTail).toBe(false);
    });

    describe('a page holding the newest message reaches the head, whatever query fetched it', () => {
      const at = (day: string) => convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`);

      it('marks a page around a message as the newest window when it holds the newest message', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('09'));

        paginator.placeExternalQueryPage(page(5, 9), 5, { id_around: 'm7' });

        expect(headOf(paginator)).toEqual(['m5', 'm6', 'm7', 'm8', 'm9']);
        expect(windowOf(paginator, 'm7').hasMoreHead).toBe(false);
        expect(windowOf(paginator, 'm7').hasMoreTail).toBe(true);
      });

      it('leaves a page around a message unmarked when newer messages exist', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('20'));

        paginator.placeExternalQueryPage(page(5, 9), 5, { id_around: 'm7' });

        expect(headOf(paginator)).toBeUndefined();
        expect(windowOf(paginator, 'm7').hasMoreHead).toBe(true);
      });

      it('joins live messages to a jumped-to page that reaches the newest message', async () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('09'));
        paginator.placeExternalQueryPage(page(1, 3), 3, { id_around: 'm2' });

        await paginator.placeQueryPage({
          isFirstPage: false,
          queryShape: { id_around: 'm8', limit: 3 },
          requestedPageSize: 3,
          results: { items: page(7, 9) },
        });
        // received live after the jump
        paginator.ingestItem(msg('m10', '10'));

        expect(headOf(paginator)).toEqual(['m7', 'm8', 'm9', 'm10']);
      });

      it('applies to a reply list, from the newest reply time of the thread', () => {
        const paginator = new MessagePaginator({
          channel,
          itemIndex,
          parentMessageId: 'parent',
        });
        // set from the thread response's `last_message_at`
        paginator.setQueriedLatestMessageAt(at('09'));
        const replies = page(5, 9).map((m) => ({ ...m, parent_id: 'parent' }));

        paginator.placeExternalQueryPage(replies, 5, { id_around: 'm7' });

        expect(headOf(paginator)).toEqual(['m5', 'm6', 'm7', 'm8', 'm9']);
      });

      it('takes a custom doRequest reporting no newer page (null headward) as reaching the head', async () => {
        const doRequest = vi.fn().mockResolvedValue({
          items: page(5, 9),
          cursor: { headward: null, tailward: 'm5' },
        });
        const paginator = new MessagePaginator({
          channel,
          itemIndex,
          paginatorOptions: { doRequest, pageSize: 5 },
        });
        // nothing known about the newest message, so only the doRequest can tell

        await paginator.executeQuery({ queryShape: { id_around: 'm7', limit: 5 } });

        expect(headOf(paginator)).toEqual(['m5', 'm6', 'm7', 'm8', 'm9']);
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('takes a custom doRequest reporting no older page (null tailward) as reaching the tail', async () => {
        const doRequest = vi.fn().mockResolvedValue({
          items: page(1, 5),
          cursor: { headward: 'm5', tailward: null },
        });
        const paginator = new MessagePaginator({
          channel,
          itemIndex,
          paginatorOptions: { doRequest, pageSize: 5 },
        });

        await paginator.executeQuery({ queryShape: { id_around: 'm3', limit: 5 } });

        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
        expect(headOf(paginator)).toBeUndefined();
      });
    });

    describe('a new message becomes the newest window when none is loaded', () => {
      const at = (day: string) => convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`);
      const loadJumpedWindow = (paginator: MessagePaginator) => {
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({ page: page(1, 3), setActive: true });
      };

      it('while a jumped-to window is shown', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);

        paginator.ingestItem(msg('m20', '20'));
        paginator.ingestItem(msg('m21', '21'));

        expect(headOf(paginator)).toEqual(['m20', 'm21']);
        // the reader stays where they are
        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
        // the messages before it are not loaded
        expect((paginator.itemIntervals[0] as Interval).hasMoreTail).toBe(true);
      });

      it("and is shown when it is the current user's own send", () => {
        (channel as unknown as { userId: string }).userId = 'me';
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);

        paginator.ingestItem({
          ...msg('m20', '20'),
          status: 'sending',
          user: { id: 'me' },
        });

        expect(headOf(paginator)).toEqual(['m20']);
        expect(paginator.items?.map((m) => m.id)).toEqual(['m20']);
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('and stays shown when a jump requested before the send comes back', async () => {
        (channel as unknown as { userId: string }).userId = 'me';
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);
        // a jump to a loaded message: the list continues from the window it shows
        await paginator.jumpToMessage('m2');
        let respond: (response: { messages: LocalMessage[] }) => void = () => undefined;
        (channel.query as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
          new Promise((resolve) => (respond = resolve)),
        );
        const jump = paginator.jumpToMessage('m5');

        paginator.ingestItem({
          ...msg('m20', '20'),
          status: 'sending',
          user: { id: 'me' },
        });
        respond({ messages: page(5, 6) });

        expect(await jump).toBe(false);
        expect(paginator.items?.map((m) => m.id)).toEqual(['m20']);
      });

      it("but not when the current user's message comes from elsewhere", () => {
        (channel as unknown as { userId: string }).userId = 'me';
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);

        // sent from another device: it arrives server-confirmed, like anyone else's
        paginator.ingestItem({ ...msg('m20', '20'), user: { id: 'me' } });

        expect(headOf(paginator)).toEqual(['m20']);
        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      });

      it('while nothing is loaded, and is then shown', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('10'));

        paginator.ingestItem(msg('m20', '20'));

        expect(headOf(paginator)).toEqual(['m20']);
        expect(paginator.items?.map((m) => m.id)).toEqual(['m20']);
      });

      it('without an out-of-order older message received before it', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);
        // arrives late: older than the newest known message
        paginator.ingestItem(msg('m5', '05'));

        paginator.ingestItem(msg('m20', '20'));

        expect(headOf(paginator)).toEqual(['m20']);
      });

      it('does not take an out-of-order older message as the previous message', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);
        // arrive late: older than the newest known message (m10)
        paginator.ingestItem(msg('m5', '05'));
        paginator.ingestItem(msg('m7', '07'));
        expect(paginator.latestMessage?.id).toBe('m7');

        paginator.removeItem({ id: 'm7' });

        // m8 to m10 exist, so m5 is not the previous message of the channel
        expect(paginator.latestMessage).toBeNull();
        expect(paginator.latestMessageAt).toBe(at('10'));
      });

      it('but not a message older than the newest known one', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadJumpedWindow(paginator);

        paginator.ingestItem(msg('m5', '05'));

        expect(headOf(paginator)).toBeUndefined();
      });

      describe('after the channel query returned no messages', () => {
        // as `channel.watch()` places the newest page of its response
        const placeEmptyNewestPage = (
          paginator: MessagePaginator,
          lastMessageAt: ReturnType<typeof at> | null,
        ) => {
          paginator.setQueriedLatestMessageAt(lastMessageAt);
          paginator.prepareExternalQuery().placePage([]);
        };

        it.each([
          ['without a last_message_at', null],
          // e.g. the history before the user joined is hidden
          ['with a last_message_at', at('10')],
        ])('has no older messages to load (%s)', async (_, lastMessageAt) => {
          const paginator = new MessagePaginator({ channel, itemIndex });
          placeEmptyNewestPage(paginator, lastMessageAt);

          paginator.ingestItem(msg('m20', '20'));
          paginator.ingestItem(msg('m21', '21'));

          expect(headOf(paginator)).toEqual(['m20', 'm21']);
          expect(paginator.items?.map((m) => m.id)).toEqual(['m20', 'm21']);
          expect(paginator.hasMoreTail).toBe(false);
          expect((paginator.itemIntervals[0] as Interval).isTail).toBe(true);
          await paginator.toTail();
          expect(channel.query).not.toHaveBeenCalled();
        });
      });

      describe('has older messages to load when the newest window was not loaded empty', () => {
        it('while nothing was queried', () => {
          const paginator = new MessagePaginator({ channel, itemIndex });
          paginator.setQueriedLatestMessageAt(at('10'));

          paginator.ingestItem(msg('m20', '20'));

          expect(headOf(paginator)).toEqual(['m20']);
          expect(paginator.hasMoreTail).toBe(true);
        });

        it('while a jumped-to window at the channel start is shown', () => {
          const paginator = new MessagePaginator({ channel, itemIndex });
          paginator.setQueriedLatestMessageAt(at('10'));
          paginator.ingestPage({ page: page(1, 3), isTail: true, setActive: true });
          expect(paginator.hasMoreTail).toBe(false);

          paginator.ingestItem(msg('m20', '20'));

          expect(headOf(paginator)).toEqual(['m20']);
          expect((paginator.itemIntervals[0] as Interval).hasMoreTail).toBe(true);
        });

        it('after the head mark of a window holding the whole channel was cleared', () => {
          const paginator = new MessagePaginator({ channel, itemIndex });
          paginator.setQueriedLatestMessageAt(at('03'));
          paginator.prepareExternalQuery().placePage(page(1, 3));
          expect(paginator.hasMoreTail).toBe(false);
          // m4–m10 were sent while the channel was not watched
          paginator.setQueriedLatestMessageAt(at('10'));
          paginator.unmarkStaleHead();

          paginator.ingestItem(msg('m20', '20'));

          expect(headOf(paginator)).toEqual(['m20']);
          expect((paginator.itemIntervals[0] as Interval).hasMoreTail).toBe(true);
        });
      });

      it('but not while the newest message time is not known', () => {
        // nothing loaded and no server value: whether it is the newest cannot be told
        const paginator = new MessagePaginator({ channel, itemIndex });

        paginator.ingestItem(msg('m20', '20'));

        expect(headOf(paginator)).toBeUndefined();
        // shown as received, as before
        expect(paginator.items?.map((m) => m.id)).toEqual(['m20']);
      });
    });

    describe('an own new send shows the newest window while an older one is read', () => {
      const at = (day: string) => convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`);
      const ownSend = (id: string, day: string): LocalMessage => ({
        ...msg(id, day),
        status: 'sending',
        user: { id: 'me' },
      });
      // the newest window m6–m10 is loaded and the reader jumped to the older window m1–m3
      const readOlderWindow = (paginator: MessagePaginator) => {
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({ page: page(6, 10), isHead: true, setActive: true });
        paginator.ingestPage({ page: page(1, 3), setActive: true });
      };
      const shownIds = (paginator: MessagePaginator) => paginator.items?.map((m) => m.id);

      beforeEach(() => {
        (channel as unknown as { userId: string }).userId = 'me';
      });

      it('switches to the newest window, which holds the send', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        readOlderWindow(paginator);
        const publishedItems: Array<string[] | undefined> = [];
        const unsubscribe = paginator.state.subscribeWithSelector(
          ({ items }) => ({ items }),
          ({ items }) => publishedItems.push(items?.map((m) => m.id)),
        );
        publishedItems.length = 0;

        paginator.ingestItem(ownSend('m11', '11'));
        unsubscribe();

        expect(paginator.isActiveIntervalAtHead).toBe(true);
        expect(shownIds(paginator)).toEqual(['m6', 'm7', 'm8', 'm9', 'm10', 'm11']);
        // the newest window's own pagination state
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.hasMoreTail).toBe(true);
        expect(paginator.cursor).toEqual({ headward: null, tailward: 'm6' });
        // the window read before stays stored
        expect(windowOf(paginator, 'm1').itemIds).toEqual(['m1', 'm2', 'm3']);
        // switched once, with the send already in the window
        expect(publishedItems).toEqual([['m6', 'm7', 'm8', 'm9', 'm10', 'm11']]);
      });

      it('and stays on it when a jump requested before the send comes back', async () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        readOlderWindow(paginator);
        // a jump to a loaded message: the list continues from the window it shows
        await paginator.jumpToMessage('m2');
        let respond: (response: { messages: LocalMessage[] }) => void = () => undefined;
        (channel.query as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
          new Promise((resolve) => (respond = resolve)),
        );
        const jump = paginator.jumpToMessage('m4');

        paginator.ingestItem(ownSend('m11', '11'));
        respond({ messages: page(4, 5) });

        expect(await jump).toBe(false);
        expect(shownIds(paginator)).toEqual(['m6', 'm7', 'm8', 'm9', 'm10', 'm11']);
      });

      it('in a thread reply list too', () => {
        const paginator = new MessagePaginator({
          channel,
          itemIndex,
          parentMessageId: 'parent-1',
        });
        const reply = (message: LocalMessage) => ({ ...message, parent_id: 'parent-1' });
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({
          page: page(6, 10).map(reply),
          isHead: true,
          setActive: true,
        });
        paginator.ingestPage({ page: page(1, 3).map(reply), setActive: true });

        paginator.ingestItem(reply(ownSend('m11', '11')));

        expect(paginator.isActiveIntervalAtHead).toBe(true);
        expect(shownIds(paginator)).toEqual(['m6', 'm7', 'm8', 'm9', 'm10', 'm11']);
        expect(windowOf(paginator, 'm1').itemIds).toEqual(['m1', 'm2', 'm3']);
      });

      it('but not for a retry of a failed send the newest window holds', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        readOlderWindow(paginator);
        paginator.ingestItem({ ...ownSend('m11', '11'), status: 'failed' });

        // a retry (or an offline-queue replay) sends the held message again
        paginator.ingestItem(ownSend('m11', '11'));

        expect(headOf(paginator)).toContain('m11');
        expect(shownIds(paginator)).toEqual(['m1', 'm2', 'm3']);
      });

      it("but not for the server's confirmation of a send it holds", () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({ page: page(6, 10), isHead: true, setActive: true });
        paginator.ingestItem(ownSend('m11', '11'));
        paginator.ingestPage({ page: page(1, 3), setActive: true });

        // `message.new` for the send
        paginator.ingestItem({ ...ownSend('m11', '11'), status: 'received' });

        expect(headOf(paginator)).toContain('m11');
        expect(shownIds(paginator)).toEqual(['m1', 'm2', 'm3']);
      });

      it("but not for another user's message", () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        readOlderWindow(paginator);

        paginator.ingestItem({ ...msg('m11', '11'), user: { id: 'other' } });

        expect(headOf(paginator)).toContain('m11');
        expect(shownIds(paginator)).toEqual(['m1', 'm2', 'm3']);
      });

      it("but not for the current user's message from another device", () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        readOlderWindow(paginator);

        // arrives server-confirmed, like anyone else's
        paginator.ingestItem({ ...ownSend('m11', '11'), status: 'received' });

        expect(headOf(paginator)).toContain('m11');
        expect(shownIds(paginator)).toEqual(['m1', 'm2', 'm3']);
      });
    });

    describe('a reconnect while a jumped-to window is shown updates the newest window', () => {
      const at = (day: string) => convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`);
      // `loadedBeforeFetch`: the ids loaded when the request went out
      const reconnect = (
        paginator: MessagePaginator,
        from: number,
        to: number,
        loadedBeforeFetch: string[] = paginator.anchoredHeadItems.map((m) => m.id),
      ) =>
        hydrateNewestPage(paginator, page(from, to), 5, {
          headIntervalItemIdsAtRequest: new Set(loadedBeforeFetch),
        });

      it('merges a page that overlaps the newest window', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({ page: page(1, 3), setActive: true });
        paginator.ingestItem(msg('m20', '20'));

        reconnect(paginator, 16, 20);

        expect(headOf(paginator)).toEqual(['m16', 'm17', 'm18', 'm19', 'm20']);
        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      });

      it('keeps the newest window published while merging a page that overlaps it', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({ page: page(1, 3), setActive: true });
        paginator.ingestItem(msg('m20', '20'));
        const published: string[][] = [];
        paginator.intervalViews.subscribe(({ anchoredHead }) =>
          published.push(anchoredHead.map((m) => m.id)),
        );

        reconnect(paginator, 16, 20);

        // an overlapping page is not separated by a gap, so the window never loses its head mark
        expect(published.filter((ids) => ids.length === 0)).toEqual([]);
        expect(published.at(-1)).toEqual(['m16', 'm17', 'm18', 'm19', 'm20']);
      });

      it('joins a page to newer messages that arrived after it', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.ingestPage({ page: page(1, 3), setActive: true });
        paginator.ingestItem(msg('m20', '20'));

        // m20 arrived after the server produced the page
        reconnect(paginator, 15, 19, []);

        expect(headOf(paginator)).toEqual(['m15', 'm16', 'm17', 'm18', 'm19', 'm20']);
        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
      });

      it('replaces every window with a newest page across a gap and shows it', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({ page: page(8, 9), isHead: true, setActive: false });
        paginator.ingestPage({ page: page(1, 3), setActive: true });

        // messages sent while offline: the newest page no longer touches the loaded newest window
        reconnect(paginator, 20, 24);

        expect(headOf(paginator)).toEqual(['m20', 'm21', 'm22', 'm23', 'm24']);
        // the jumped-to reader is moved to it, and the windows nothing brought up to date are gone
        expect(paginator.items?.map((m) => m.id)).toEqual([
          'm20',
          'm21',
          'm22',
          'm23',
          'm24',
        ]);
        expect(paginator.getItem('m1')).toBeUndefined();
        expect(paginator.getItem('m8')).toBeUndefined();
      });
    });

    it('joins a reconnect page to newer messages shown while nothing else was loaded', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2020-01-10T00:00:00.000Z'),
      );
      paginator.ingestItem(msg('m20', '20'));

      // m20 arrived after the server produced the page
      hydrateNewestPage(paginator, page(15, 19), 5, {
        headIntervalItemIdsAtRequest: new Set(),
      });

      expect(paginator.items?.map((m) => m.id)).toEqual([
        'm15',
        'm16',
        'm17',
        'm18',
        'm19',
        'm20',
      ]);
    });

    it('jumping to the latest message shows a newest window started by live messages', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2020-01-10T00:00:00.000Z'),
      );
      paginator.ingestPage({ page: page(1, 3), setActive: true });
      paginator.ingestItem(msg('m20', '20'));

      await paginator.jumpToTheLatestMessage();

      expect(paginator.items?.map((m) => m.id)).toEqual(['m20']);
      // the messages before it can be loaded
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.cursor?.tailward).toBe('m20');
    });

    it('does not mark a newer page as the oldest window', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });

      // a short page of messages newer than m1: the newest end of the channel, not its start
      paginator.placeExternalQueryPage(page(8, 9), 5, { id_gt: 'm1' });

      expect(headOf(paginator)).toEqual(['m8', 'm9']);
      expect(windowOf(paginator, 'm8').hasMoreHead).toBe(false);
      expect(windowOf(paginator, 'm8').hasMoreTail).toBe(true);
    });

    it('does not join a live message to an older page', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestItem(msg('live', '20'));

      paginator.placeExternalQueryPage(page(1, 2), 5, { id_lt: 'm9' });

      expect(windowOf(paginator, 'm1').itemIds).toEqual(['m1', 'm2']);
      expect(headOf(paginator)).toBeUndefined();
    });

    it('keeps the newest window marked after loading older messages', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestItem(msg('live', '20'));
      paginator.placeExternalQueryPage(page(6, 10), 5);

      await paginator.placeQueryPage({
        direction: 'tailward',
        isFirstPage: false,
        queryShape: { id_lt: 'm6', limit: 5 },
        requestedPageSize: 5,
        results: { items: page(1, 5) },
      });

      expect(headOf(paginator)).toEqual([...page(1, 10).map((m) => m.id), 'live']);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.cursor?.headward).toBeNull();
    });

    describe('a response reporting newer messages than the newest window holds', () => {
      const at = (day: string) => convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`);
      // m1–m5 loaded as the newest window, the server's latest message being m5
      const loadNewestWindow = () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('05'));
        paginator.placeExternalQueryPage(page(1, 5), 5);
        return paginator;
      };
      const ids = (messages?: LocalMessage[]) => messages?.map((m) => m.id);

      it('stops treating the window as the newest and lets it load the newer messages', () => {
        const paginator = loadNewestWindow();

        // m6–m9 were sent while no events arrived
        paginator.setQueriedLatestMessageAt(at('09'));
        paginator.unmarkStaleHead();

        expect(paginator.anchoredHeadItem).toBeUndefined();
        expect(ids(paginator.items)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
        expect(paginator.hasMoreHead).toBe(true);
        expect(paginator.cursor?.headward).toBe('m5');
      });

      it('keeps a window that holds the latest message', () => {
        const paginator = loadNewestWindow();

        paginator.setQueriedLatestMessageAt(at('05'));
        paginator.unmarkStaleHead();

        expect(paginator.anchoredHeadItem?.id).toBe('m5');
        expect(paginator.hasMoreHead).toBe(false);
      });

      it('compares only the messages the server knows of, not a failed send', () => {
        const paginator = loadNewestWindow();
        // newer than everything, but on the device's clock and unknown to the server
        paginator.ingestItem({ ...msg('failed', '20'), status: 'failed' });

        paginator.unmarkStaleHead();
        expect(paginator.anchoredHeadItem?.id).toBe('failed');

        paginator.setQueriedLatestMessageAt(at('09'));
        paginator.unmarkStaleHead();
        expect(paginator.anchoredHeadItem).toBeUndefined();
      });

      it('starts a separate newest window for a message that arrives afterwards', () => {
        const paginator = loadNewestWindow();
        paginator.setQueriedLatestMessageAt(at('09'));
        paginator.unmarkStaleHead();

        paginator.ingestItem(msg('m10', '10'));

        expect(headOf(paginator)).toEqual(['m10']);
        expect(ids(paginator.items)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      });

      it('leaves the window being read alone when the window behind is another one', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('09'));
        paginator.ingestPage({ page: page(8, 9), isHead: true, setActive: false });
        paginator.ingestPage({ page: page(1, 3), setActive: true });
        const before = paginator.state.getLatestValue();

        paginator.setQueriedLatestMessageAt(at('12'));
        paginator.unmarkStaleHead();

        expect(paginator.anchoredHeadItem).toBeUndefined();
        expect(paginator.state.getLatestValue()).toBe(before);
      });

      it('replaces the windows with a newest page across a gap from it, also for a jumped-to reader', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(at('10'));
        paginator.placeExternalQueryPage(page(6, 10), 5);
        paginator.ingestPage({ page: page(1, 2), setActive: true });
        paginator.setQueriedLatestMessageAt(at('20'));
        paginator.unmarkStaleHead();

        hydrateNewestPage(paginator, page(16, 20), 5, {
          headIntervalItemIdsAtRequest: paginator.getHeadIntervalItemIdsAtRequest(),
        });

        expect(headOf(paginator)).toEqual(['m16', 'm17', 'm18', 'm19', 'm20']);
        expect(ids(paginator.items)).toEqual(headOf(paginator));
        expect(paginator.getItem('m1')).toBeUndefined();
        expect(paginator.getItem('m6')).toBeUndefined();
      });

      it('merges the newest page into it later, removing what the page proves was hard-deleted', () => {
        const paginator = loadNewestWindow();
        paginator.setQueriedLatestMessageAt(at('09'));
        paginator.unmarkStaleHead();

        // m4 was hard-deleted while no events arrived; with no head window loaded when the
        // request went out, there is no snapshot (see `getHeadIntervalItemIdsAtRequest`)
        hydrateNewestPage(paginator, [...page(2, 3), ...page(5, 9)], 7, {
          headIntervalItemIdsAtRequest: paginator.getHeadIntervalItemIdsAtRequest(),
        });

        expect(headOf(paginator)).toEqual([
          'm1',
          'm2',
          'm3',
          'm5',
          'm6',
          'm7',
          'm8',
          'm9',
        ]);
        expect(ids(paginator.items)).toEqual(headOf(paginator));
        expect(paginator.hasMoreHead).toBe(false);
      });
    });
  });

  describe('end marks of the windows a page merges', () => {
    const msg = (id: string, day: string) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
      });
    const page = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) =>
        msg(`m${from + i}`, String(from + i).padStart(2, '0')),
      );

    it('keeps loading older messages after a full older page merges a window marked as the channel start', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      // seeded from the offline database: a short page, so wrongly marked as the channel start
      paginator.ingestPage({ page: page(3, 6), isTail: true });
      // the newest page from the network, separated from the seeded window by a gap
      await paginator.placeQueryPage({
        direction: 'tailward',
        isFirstPage: true,
        queryShape: { limit: 5 },
        requestedPageSize: 5,
        results: { items: page(10, 14) },
      });

      // a full page of older messages overlaps the seeded window: more older messages exist
      await paginator.placeQueryPage({
        direction: 'tailward',
        isFirstPage: false,
        queryShape: { id_lt: 'm10', limit: 5 },
        requestedPageSize: 5,
        results: { items: page(5, 9) },
      });

      expect(paginator.items?.map((m) => m.id)).toEqual(page(3, 14).map((m) => m.id));
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.cursor?.tailward).toBe('m3');
    });
  });

  describe('latest window, truncation & live message routing', () => {
    const msg = (id: string, day: string) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
      });

    describe('anchoredHeadItems / anchoredHeadItem', () => {
      it('reflect the active head window', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m8', 'm9']);
        expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual(['m8', 'm9']);
        expect(paginator.anchoredHeadItem?.id).toBe('m9');
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
        expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual(['m8', 'm9']); // newest window
        expect(paginator.anchoredHeadItem?.id).toBe('m9');
      });

      it('are empty while only a window not reaching the newest message is loaded', () => {
        // a window reached by a jump: the messages between it and the newest are unknown
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m4', '04'), msg('m5', '05')],
          setActive: true,
        });

        expect(paginator.anchoredHeadItems).toEqual([]);
        expect(paginator.anchoredHeadItem).toBeUndefined();
      });

      it('find a message by timestamp in whichever loaded window holds it', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m8', '08'), msg('m9', '09')],
          isHead: true,
          setActive: false,
        });
        // a window reached by a jump, older and separate from the newest one
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02'), msg('m3', '03')],
          setActive: true,
        });
        const at = (day: string) =>
          convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`);

        expect(paginator.findItemByTimestamp(at('08'))?.id).toBe('m8');
        // between the windows: the last loaded message at or before it
        expect(paginator.findItemByTimestamp(at('05'))?.id).toBe('m3');
        expect(paginator.findItemByTimestamp(at('02'))?.id).toBe('m2');
        expect(
          paginator.findItemByTimestamp(convertDateToTimestamp('2019-12-31')),
        ).toBeNull();
      });

      it('replace a removed latest message from the newest messages, not a jumped-to window', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          setActive: true,
        });
        // received live while the reader sits in the older window
        paginator.ingestItem(msg('m7', '07'));
        paginator.ingestItem(msg('m9', '09'));
        expect(paginator.latestMessage?.id).toBe('m9');

        paginator.removeItem({ id: 'm9' });
        expect(paginator.latestMessage?.id).toBe('m7');

        // nothing newer than the jumped-to window is known: the previous message is unknown
        paginator.removeItem({ id: 'm7' });
        expect(paginator.latestMessage).toBeNull();
      });

      it('are empty when nothing is loaded', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        expect(paginator.anchoredHeadItems).toEqual([]);
        expect(paginator.anchoredHeadItem).toBeUndefined();
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

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });

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

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });

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

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });

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
        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });

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

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });

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

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-04T00:00:00.000Z'),
        });

        // active [m1,m2] removed; nearest survivor to where it was = the oldest survivor [m5,m6]
        expect(paginator.items?.map((m) => m.id)).toEqual(['m5', 'm6']);
      });

      it('keeps showing the surviving live messages when the active window is the logical head', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // No page loaded: live messages land in the logical head, which becomes the active window.
        paginator.ingestItem(msg('m1', '01'));
        paginator.ingestItem(msg('m9', '09'));
        expect(paginator.items?.map((m) => m.id)).toEqual(['m1', 'm9']);

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        });

        expect(paginator.getItem('m1')).toBeUndefined();
        expect(paginator.items?.map((m) => m.id)).toEqual(['m9']);
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
        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-04T00:00:00.000Z'),
        });

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

        paginator.truncate({ truncatedAt: Number.NaN });

        expect(paginator.items?.map((m) => m.id)).toEqual(['m1']);
        expect(partialNextSpy).not.toHaveBeenCalled();
      });

      it('clears the latest message and the sort key when nothing survives', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        );
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
        });

        expect(paginator.latestMessage).toBeNull();
        expect(paginator.latestMessageAt).toBeNull();
      });

      it('keeps the latest message when it is newer than the cutoff', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m5', '05')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
        });

        expect(paginator.latestMessage?.id).toBe('m5');
        expect(paginator.latestMessageAt).toBe(
          convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        );
      });

      it('keeps a latest message newer than the cutoff that was tracked without being loaded', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        );
        // a replayed offline send is tracked before its message.new is ingested
        paginator.trackLatestMessage(msg('m5', '05'));

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
        });

        expect(paginator.latestMessage?.id).toBe('m5');
      });

      it('clears a queried latestMessageAt older than the cutoff when no message is loaded', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        );

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
        });

        expect(paginator.latestMessageAt).toBeNull();
      });

      it('keeps a queried latestMessageAt newer than the cutoff', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        );
        paginator.ingestPage({
          page: [msg('m1', '01')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.truncate({
          truncatedAt: convertDateToTimestamp('2020-01-03T00:00:00.000Z'),
        });

        expect(paginator.latestMessage).toBeNull();
        expect(paginator.latestMessageAt).toBe(
          convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        );
      });
    });

    describe('hard-removing the latest message', () => {
      it('moves the sort key back to the previous message', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // the server's last_message_at is the message about to be removed
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
        );
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.removeItem({ id: 'm2' });

        expect(paginator.latestMessage?.id).toBe('m1');
        expect(paginator.latestMessageAt).toBe(
          convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        );
      });

      it('keeps a queried latestMessageAt newer than the removed message', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // a newer message exists on the server that is not loaded
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        );
        paginator.ingestPage({
          page: [msg('m1', '01'), msg('m2', '02')],
          isHead: true,
          isTail: true,
          setActive: true,
        });

        paginator.removeItem({ id: 'm2' });

        expect(paginator.latestMessageAt).toBe(
          convertDateToTimestamp('2020-01-05T00:00:00.000Z'),
        );
      });

      it('keeps the queried latestMessageAt when no previous message is loaded', () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        // older messages exist on the server, but only the latest is loaded
        paginator.setQueriedLatestMessageAt(
          convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
        );
        paginator.ingestPage({
          page: [msg('m2', '02')],
          isHead: true,
          setActive: true,
        });

        paginator.removeItem({ id: 'm2' });

        expect(paginator.latestMessage).toBeNull();
        expect(paginator.latestMessageAt).toBe(
          convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
        );
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
        expect(paginator.anchoredHeadItem?.id).toBe('m3');
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

  describe('reconcileNewestMessages()', () => {
    const m = (id: string, day: string, overrides: Partial<MessageResponse> = {}) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(`2020-01-${day}T00:00:00.000Z`),
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

    it('continues pagination after a hydrate instead of re-fetching the first page', async () => {
      // `Thread.reload()` hydrates through `reconcileNewestMessages`, which records no query shape.
      // The next `toTail()` therefore reads `_lastQueryShape === undefined`, and
      // `shouldResetStateBeforeQuery` treats an undefined previous shape as a shape CHANGE — so the
      // continuation is classified as a first page: the loaded window is blanked and page one is
      // fetched again. Scrolling up in a freshly opened thread should paginate, not reload.
      const { paginator, m1 } = setupLoadedHead({ isTail: false });
      const m4 = m('m4', '04');
      paginator.reconcileNewestMessages([m1, m('m2', '02'), m('m3', '03'), m4]);
      // The older page the scroll asks for.
      (channel.getReplies as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [
          m('m0', '01', {
            created_at: convertDateToTimestamp('2019-12-31T00:00:00.000Z'),
          }),
        ],
      });

      await paginator.toTail();

      // The request itself is a correct continuation — older than the oldest loaded reply...
      expect(channel.getReplies).toHaveBeenCalledWith(
        { parent_id: 'parent-1' },
        expect.objectContaining({ id_lt: m1.id }),
      );
      // ...but the page must be PREPENDED to the hydrated window, not replace it.
      expect(paginator.items?.map((message) => message.id)).toEqual([
        'm0',
        'm1',
        'm2',
        'm3',
        'm4',
      ]);
    });

    it('keeps the hydrated window when the older page comes back empty', async () => {
      // Scrolling to the top of a thread whose replies are all loaded: the tailward query returns
      // nothing, which means "no older replies", not "no replies". The hydrate recorded no query
      // shape, so `isFirstPageQuery` classifies this continuation as a first page and publishes
      // `getStateBeforeFirstQuery()` (items undefined) before the request — with nothing in the
      // response to rebuild from, the loaded window is lost.
      const { paginator, m1 } = setupLoadedHead({ isTail: false });
      paginator.reconcileNewestMessages([m1, m('m2', '02'), m('m3', '03')]);
      (channel.getReplies as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
      });

      await paginator.toTail();

      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.hasMoreTail).toBe(false);
    });

    it('reconciles in-place edits and appends new messages without a query', () => {
      const { paginator, m1, m2 } = setupLoadedHead({ isTail: true });
      // While offline: m3 was edited and m4/m5 arrived; the hydrated newest window carries both.
      const editedM3 = m('m3', '03', { text: 'edited' });
      const m4 = m('m4', '04');
      const m5 = m('m5', '05');

      paginator.reconcileNewestMessages([m1, m2, editedM3, m4, m5]);

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

      paginator.reconcileNewestMessages([]);
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
      paginator.reconcileNewestMessages([m1, m2, editedM3]);

      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe('m1');
      expect(paginator.getItem('m3')?.text).toBe('edited');
    });

    it('shows a newest page separated by a gap in place of the loaded window', () => {
      const { paginator } = setupLoadedHead({ isTail: false });
      // shares no id with the loaded [m1,m2,m3]: messages may be missing between them
      paginator.reconcileNewestMessages([m('m10', '10'), m('m11', '11'), m('m12', '12')]);

      const state = paginator.state.getLatestValue();
      // the page is the only window, shown, and can load older messages, the gap
      expect(state.items?.map((message) => message.id)).toEqual(['m10', 'm11', 'm12']);
      expect(state.hasMoreHead).toBe(false);
      expect(state.hasMoreTail).toBe(true);
      expect(state.cursor).toEqual({ headward: null, tailward: 'm10' });
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual([
        'm10',
        'm11',
        'm12',
      ]);
      expect(paginator.itemIntervals).toHaveLength(1);
      expect((paginator.itemIntervals[0] as Interval).hasMoreTail).toBe(true);
    });

    it('sets hasMoreHead false after merging the head window', () => {
      const { paginator } = setupLoadedHead({ isTail: false });

      paginator.reconcileNewestMessages([m('m3', '03'), m('m4', '04')]);

      expect(paginator.state.getLatestValue().hasMoreHead).toBe(false);
    });

    it('anchors the newest page under a jumped-to window when the newest slice is not loaded', () => {
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

      paginator.reconcileNewestMessages([m('m6', '06')]);

      // The reader stays on the jumped-to window; m6 is kept as the newest window for their return.
      expect(paginator.items?.map((message) => message.id)).toEqual(['m4', 'm5']);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual(['m6']);
      expect((paginator.itemIntervals[0] as Interval).isHead).toBe(true);
    });

    it('extends the window being read when the newest page overlaps it', () => {
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

      paginator.reconcileNewestMessages([m('m5', '05'), m('m6', '06')]);

      expect(paginator.items?.map((message) => message.id)).toEqual(['m4', 'm5', 'm6']);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.cursor?.headward).toBeNull();
    });

    it('replaces a middle island and a newest window started live with a newest page past a gap', () => {
      // Only a middle island loaded, then a live arrival, which starts the newest window. A page
      // sharing nothing with it is past a gap: it replaces both windows and is shown.
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
      // Arrived live while the reader sits on the middle island: the newest window.
      paginator.ingestItem(m('live', '20', { parent_id: 'parent-1' }));

      paginator.reconcileNewestMessages([m('m30', '30'), m('m31', '31')]);

      // Not welded across the gap: the reader is moved to the page, and the old windows are gone.
      expect(paginator.items?.map((message) => message.id)).toEqual(['m30', 'm31']);
      expect(paginator.itemIntervals).toHaveLength(1);
      expect(paginator.getItem('m4')).toBeUndefined();
      expect(paginator.getItem('live')).toBeUndefined();
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
      paginator.reconcileNewestMessages([m('s1', '05'), m('s2', '06')]);

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

      paginator.reconcileNewestMessages([m('mine', '05'), m('s2', '06')]);

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

      paginator.reconcileNewestMessages([m('m1', '01')]);

      expect(paginator.items).toBeUndefined();
    });

    it('treats a window sharing only the loaded newest id as OVERLAP, not disjoint (boundary)', () => {
      const { paginator, m3 } = setupLoadedHead({ isTail: false });
      // Exactly one shared id (the loaded newest, m3): the minimal-overlap boundary. This must merge
      // (append m4/m5, keep older loadable), NOT reset to the window.
      paginator.reconcileNewestMessages([m3, m('m4', '04'), m('m5', '05')]);

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

    it('merges the page into the inactive head window while a jumped window is active, preserving the caller position', () => {
      const paginator = setupHeadPlusActiveJumpedInterval();
      // Precondition: two intervals, the head at [0], but the older jumped window is what is shown.
      expect(paginator.itemIntervals).toHaveLength(2);
      expect((paginator.itemIntervals[0] as unknown as { isHead: boolean }).isHead).toBe(
        true,
      );
      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);

      // A newest window overlapping the loaded head. The head is loaded but NOT the active interval,
      // so the page goes into the head while the caller stays on the jumped window (no yank).
      paginator.reconcileNewestMessages([m('m9', '09'), m('m10', '10'), m('m11', '11')]);

      expect(paginator.items?.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.itemIntervals).toHaveLength(2);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual([
        'm8',
        'm9',
        'm10',
        'm11',
      ]);
    });

    it('drops every window when a newest page separated by a gap arrives (head active)', () => {
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

      // shares no id with the head window: it replaces the loaded windows and is shown
      paginator.reconcileNewestMessages([m('m20', '20'), m('m21', '21'), m('m22', '22')]);

      const state = paginator.state.getLatestValue();
      expect(paginator.itemIntervals).toHaveLength(1);
      expect(state.items?.map((message) => message.id)).toEqual(['m20', 'm21', 'm22']);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual([
        'm20',
        'm21',
        'm22',
      ]);
    });
  });

  describe('reconcileNewestMessages() — destructive reconciliation', () => {
    // A channel (main list) message with a distinct created_at derived from `minute`, so ordering and
    // the reconciliation window are unambiguous. Server-confirmed ('received') unless overridden.
    const msg = (id: string, minute: number, overrides: Partial<MessageResponse> = {}) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(
          new Date(Date.UTC(2020, 0, 1, 0, minute, 0)).toISOString(),
        ),
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
      paginator.reconcileNewestMessages([
        msg('m1', 1),
        msg('m2', 2),
        msg('m4', 4),
        msg('m5', 5),
      ]);
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
      paginator.reconcileNewestMessages([
        msg('m1', 1),
        msg('m3', 3),
        msg('m5', 5),
        msg('m6', 6),
      ]);
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
      paginator.reconcileNewestMessages([
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
      paginator.reconcileNewestMessages([
        msg('m1', 1),
        msg('m2', 2, {
          type: 'deleted',
          deleted_at: convertDateToTimestamp('2020-01-01T00:10:00.000Z'),
        }),
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
      paginator.reconcileNewestMessages(
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
      paginator.reconcileNewestMessages([msg('m2', 2), msg('m3', 3), msg('m4', 4)], {
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
      paginator.reconcileNewestMessages([msg('m2', 2), msg('m3', 3), msg('m4', 4)], {});
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
      paginator.reconcileNewestMessages(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {},
      );
      expect(paginator.getItem('m5')).toBeDefined();
    });

    it('drops a hard-deleted NEWEST message WITH a snapshot and recomputes latestMessage', () => {
      const loaded = [
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m4', 4),
        msg('m5', 5),
      ];
      const paginator = loadHead(loaded);
      expect(paginator.latestMessage?.id).toBe('m5');
      const headIntervalItemIdsAtRequest = new Set(loaded.map((message) => message.id));

      paginator.reconcileNewestMessages(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {
          headIntervalItemIdsAtRequest,
        },
      );

      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(paginator.getItem('m5')).toBeUndefined();
      expect(paginator.latestMessage?.id).toBe('m4'); // tracked latest fell back to the newest survivor
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
      const headIntervalItemIdsAtRequest = new Set(loaded.map((message) => message.id));

      paginator.reconcileNewestMessages([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
        headIntervalItemIdsAtRequest,
      });

      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.latestMessage?.id).toBe('m3');
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
      const headIntervalItemIdsAtRequest = new Set(
        loadedBefore.map((message) => message.id),
      ); // snapshot BEFORE fetch

      // During the fetch a brand-new message m6 arrives via WS and is ingested into the head.
      paginator.ingestItem(msg('m6', 6));
      expect(paginator.getItem('m6')).toBeDefined();

      // The server's authoritative page (computed before m6 existed) has m5 deleted and lacks m6.
      paginator.reconcileNewestMessages(
        [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)],
        {
          headIntervalItemIdsAtRequest,
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
      const headIntervalItemIdsAtRequest = new Set(loaded.map((message) => message.id));

      // The server page only has the confirmed m1 + m5; the local-only ones the server never saw.
      paginator.reconcileNewestMessages([msg('m1', 1), msg('m5', 5)], {
        headIntervalItemIdsAtRequest,
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
      const headIntervalItemIdsAtRequest = new Set(loaded.map((message) => message.id));

      // m3 hard-deleted; the failed send was never on the server. Page: [m1, m4].
      paginator.reconcileNewestMessages([msg('m1', 1), msg('m4', 4)], {
        headIntervalItemIdsAtRequest,
      });

      expect(paginator.getItem('m3')).toBeUndefined();
      expect(paginator.getItem('failed')).toBeDefined();
      expect(ids(paginator)).toEqual(['m1', 'failed', 'm4']);
    });

    // ── Empty page: whole channel emptied (or a missed truncate) ─────────────────────────────────

    it('empties the list when the channel returns no messages (with a snapshot)', () => {
      const loaded = [msg('m1', 1), msg('m2', 2), msg('m3', 3)];
      const paginator = loadHead(loaded);
      const headIntervalItemIdsAtRequest = new Set(loaded.map((message) => message.id));

      paginator.reconcileNewestMessages([], { headIntervalItemIdsAtRequest });

      expect(paginator.items).toEqual([]);
      expect(paginator.latestMessage).toBeNull();
    });

    it('does NOT blank on an empty page without a snapshot (safe default)', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      paginator.reconcileNewestMessages([]);
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
    });

    it('keeps a live arrival on an empty page (only snapshot ids are removed)', () => {
      const loadedBefore = [msg('m1', 1), msg('m2', 2)];
      const paginator = loadHead(loadedBefore);
      const headIntervalItemIdsAtRequest = new Set(
        loadedBefore.map((message) => message.id),
      );

      // A live message arrives during the fetch, then the (stale) empty page comes back.
      paginator.ingestItem(msg('m3', 3));
      paginator.reconcileNewestMessages([], { headIntervalItemIdsAtRequest });

      expect(paginator.getItem('m1')).toBeUndefined();
      expect(paginator.getItem('m2')).toBeUndefined();
      expect(paginator.getItem('m3')).toBeDefined();
      expect(ids(paginator)).toEqual(['m3']);
    });

    // ── Structural guards preserved ──────────────────────────────────────────────────────────────

    it('drops the shown window across a gap without deleting its messages offline', () => {
      const hardDeleteMessages = vi.fn().mockResolvedValue([]);
      const paginator = new MessagePaginator({
        channel: {
          ...channel,
          getClient: () => ({ offlineDb: { hardDeleteMessages } }),
        } as unknown as Channel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });
      const loaded = [msg('m1', 1), msg('m2', 2), msg('m3', 3)];
      paginator.ingestPage({ page: loaded, isHead: true, setActive: true });
      const headIntervalItemIdsAtRequest = new Set(loaded.map((message) => message.id));

      // The page covers none of the shown window, so it proves no message there was deleted.
      paginator.reconcileNewestMessages(
        [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        {
          headIntervalItemIdsAtRequest,
        },
      );

      expect(ids(paginator)).toEqual(['m10', 'm11', 'm12']);
      expect(hardDeleteMessages).not.toHaveBeenCalled();
    });

    it('keeps unsent messages in the newest page that replaces the windows across a gap', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        // sent while offline: older than the page, still kept
        msg('sending', 5, { status: 'sending' }),
        msg('failed', 10, { status: 'failed' }),
      ]);

      paginator.reconcileNewestMessages([msg('m9', 9), msg('m11', 11), msg('m12', 12)]);

      // the page is shown with the unsent messages, at their place in time
      const shown = ['sending', 'm9', 'failed', 'm11', 'm12'];
      expect(ids(paginator)).toEqual(shown);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual(shown);
      expect(
        paginator.intervalViews
          .getLatestValue()
          .anchoredHead.map((message) => message.id),
      ).toEqual(shown);
      expect(paginator.itemIntervals).toHaveLength(1);
      // older messages load from the page's oldest sent message, never an unsent one
      expect(paginator.cursor?.tailward).toBe('m9');
    });

    it.each([
      {
        case: 'a message arrived during the request',
        newestLoaded: msg('m13', 13),
        page: [msg('m9', 9), msg('m10', 10), msg('m11', 11)],
        newestWindow: ['m9', 'm10', 'm11', 'm13'],
      },
      {
        case: 'the page proves a hard delete',
        newestLoaded: msg('m10', 10),
        page: [msg('m9', 9), msg('m11', 11), msg('m12', 12)],
        newestWindow: ['m9', 'm11', 'm12'],
      },
    ])(
      'publishes the newest page shown across a gap once, reconciled ($case)',
      ({ newestLoaded, page, newestWindow }) => {
        const paginator = loadHead([
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          newestLoaded,
        ]);
        const publishes: unknown[] = [];
        const unsubscribe = paginator.state.subscribe(({ cursor, hasMoreHead, items }) =>
          publishes.push({
            cursor,
            hasMoreHead,
            items: items?.map((message) => message.id),
            newestWindow: paginator.anchoredHeadItems.map((message) => message.id),
          }),
        );
        publishes.length = 0; // the call on subscribing

        paginator.reconcileNewestMessages(page);
        unsubscribe();

        expect(publishes).toEqual([
          {
            cursor: { headward: null, tailward: 'm9' },
            hasMoreHead: false,
            items: newestWindow,
            newestWindow,
          },
        ]);
      },
    );

    it('keeps messages that arrived during the request in the newest page shown across a gap', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('m13', 13),
      ]);

      paginator.reconcileNewestMessages([msg('m9', 9), msg('m10', 10), msg('m11', 11)]);

      expect(ids(paginator)).toEqual(['m9', 'm10', 'm11', 'm13']);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual([
        'm9',
        'm10',
        'm11',
        'm13',
      ]);
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('moves a jumped-away reader to the newest page across a gap, keeping unsent messages', () => {
      const paginator = loadHead([
        msg('m30', 30),
        msg('m31', 31),
        msg('failed', 40, { status: 'failed' }),
      ]);
      // the reader jumped to an older window
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        isHead: false,
        isTail: false,
        setActive: true,
      });

      paginator.reconcileNewestMessages([msg('m38', 38), msg('m39', 39), msg('m41', 41)]);

      const shown = ['m38', 'm39', 'failed', 'm41'];
      expect(ids(paginator)).toEqual(shown);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual(shown);
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('keeps an unsent message of any window in the newest page shown across a gap', () => {
      const paginator = loadHead([msg('m30', 30), msg('m31', 31)]);
      // a window holding an unsent message, apart from the newest window
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('sending', 3, { status: 'sending' })],
        isHead: false,
        isTail: false,
        setActive: true,
      });

      paginator.reconcileNewestMessages([msg('m38', 38), msg('m39', 39), msg('m41', 41)]);

      expect(ids(paginator)).toEqual(['sending', 'm38', 'm39', 'm41']);
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('does not join a newest page to the shown window through a message unsent there', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('m2', 2),
        msg('m3', 3),
        msg('hello', 5, { status: 'sending' }),
      ]);

      // no snapshot of the request: the server already holds the queued send, the window does not
      paginator.reconcileNewestMessages([msg('m9', 9), msg('m10', 10), msg('hello', 11)]);

      expect(ids(paginator)).toEqual(['m9', 'm10', 'hello']);
      expect(paginator.getItem('m3')).toBeUndefined();
    });

    describe('with a newest page sharing messages the user wrote', () => {
      const me = { id: 'me' };
      const own = (id: string, minute: number) => msg(id, minute, { user: me });
      const range = (from: number, to: number, make = msg) =>
        Array.from({ length: to - from + 1 }, (_, i) => make(`m${from + i}`, from + i));
      const snapshotOf = (paginator: MessagePaginator) =>
        paginator.getHeadIntervalItemIdsAtRequest();

      beforeEach(() => {
        (channel as unknown as { userId: string }).userId = 'me';
      });

      it('merges a page whose overlap is only own messages, keeping the reader on their window', () => {
        // m1–m10 from others, then the user's m11–m20; others sent m21–m40 while the user was away.
        // The newest 25 are m16–m40: the only messages it shares with the window are the user's.
        const paginator = loadHead([...range(1, 10), ...range(11, 20, own)]);
        // the reader scrolled away to an older window
        paginator.ingestPage({
          page: [msg('old1', -20), msg('old2', -19)],
          isHead: false,
          isTail: false,
          setActive: true,
        });
        const headIntervalItemIdsAtRequest = snapshotOf(paginator);

        paginator.reconcileNewestMessages([...range(16, 20, own), ...range(21, 40)], {
          headIntervalItemIdsAtRequest,
          requestedLimit: 25,
        });

        expect(ids(paginator)).toEqual(['old1', 'old2']);
        expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual(
          range(1, 40).map((m) => m.id),
        );
        expect(paginator.itemIntervals).toHaveLength(2);
      });

      it('treats a page sharing only a send replayed after missed messages as past a gap', () => {
        // The user queued "hello" offline while m11–m60 arrived; the replay confirmed it before the
        // newest page was requested, so the window and the page both hold it.
        const paginator = loadHead([...range(1, 10), own('hello', 61)]);
        const headIntervalItemIdsAtRequest = snapshotOf(paginator);

        paginator.reconcileNewestMessages([...range(59, 60), own('hello', 61)], {
          headIntervalItemIdsAtRequest,
          requestedLimit: 3,
        });

        expect(ids(paginator)).toEqual(['m59', 'm60', 'hello']);
        expect(paginator.getItem('m10')).toBeUndefined();
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('treats a page sharing only sends replayed after missed messages as past a gap', () => {
        const paginator = loadHead([...range(1, 10), own('hello', 61), own('again', 62)]);
        const headIntervalItemIdsAtRequest = snapshotOf(paginator);

        paginator.reconcileNewestMessages(
          [...range(59, 60), own('hello', 61), own('again', 62)],
          { headIntervalItemIdsAtRequest, requestedLimit: 4 },
        );

        expect(ids(paginator)).toEqual(['m59', 'm60', 'hello', 'again']);
        expect(paginator.getItem('m10')).toBeUndefined();
      });

      it("merges a page starting at the user's own message without a snapshot of the request", () => {
        const paginator = loadHead([...range(1, 4), own('m5', 5)]);

        paginator.reconcileNewestMessages([own('m5', 5), ...range(6, 7)], {
          requestedLimit: 3,
        });

        expect(ids(paginator)).toEqual(range(1, 7).map((m) => m.id));
      });

      it("merges a page whose oldest message is the user's own, loaded before the request", () => {
        const paginator = loadHead([...range(1, 4), own('m5', 5)]);
        const headIntervalItemIdsAtRequest = snapshotOf(paginator);

        paginator.reconcileNewestMessages([own('m5', 5), ...range(6, 7)], {
          headIntervalItemIdsAtRequest,
          requestedLimit: 3,
        });

        expect(ids(paginator)).toEqual(range(1, 7).map((m) => m.id));
        expect(paginator.itemIntervals).toHaveLength(1);
      });
    });

    it.each([
      { case: 'holding all of it', page: [8, 9, 10, 11, 12, 13, 14] },
      { case: 'missing its oldest, hard-deleted', page: [8, 9, 11, 12, 13, 14, 15] },
    ])(
      'merges a page spanning the whole head window ($case), keeping the reader on their window',
      ({ page }) => {
        const paginator = loadHead([msg('m10', 10), msg('m11', 11), msg('m12', 12)]);
        paginator.ingestPage({
          page: [msg('m1', 1), msg('m2', 2)],
          isHead: false,
          isTail: false,
          setActive: true,
        });
        const headIntervalItemIdsAtRequest = paginator.getHeadIntervalItemIdsAtRequest();

        // the page's oldest, m8, was never loaded
        paginator.reconcileNewestMessages(
          page.map((n) => msg(`m${n}`, n)),
          { headIntervalItemIdsAtRequest, requestedLimit: 7 },
        );

        expect(ids(paginator)).toEqual(['m1', 'm2']);
        expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual(
          page.map((n) => `m${n}`),
        );
      },
    );

    it('merges a page whose oldest message was hard-deleted during the request', () => {
      const paginator = loadHead(
        Array.from({ length: 10 }, (_, i) => msg(`m${1 + i}`, 1 + i)),
      );
      paginator.ingestPage({
        page: [msg('old1', -20)],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      const headIntervalItemIdsAtRequest = paginator.getHeadIntervalItemIdsAtRequest();
      // the server built the page m6–m15, then m6 was hard-deleted and its event removed it
      paginator.removeItem({ id: 'm6' });

      paginator.reconcileNewestMessages(
        Array.from({ length: 10 }, (_, i) => msg(`m${6 + i}`, 6 + i)),
        { headIntervalItemIdsAtRequest, requestedLimit: 10 },
      );

      // the windows are joined; the page brings m6 back until a later page no longer holds it
      expect(ids(paginator)).toEqual(['old1']);
      expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual(
        Array.from({ length: 15 }, (_, i) => `m${1 + i}`),
      );
    });

    it('merges a page whose oldest message is one the window filters out', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m4', 4)]);
      const headIntervalItemIdsAtRequest = paginator.getHeadIntervalItemIdsAtRequest();

      // m3 is shadowed, so the window never held it
      paginator.reconcileNewestMessages(
        [msg('m3', 3, { shadowed: true }), msg('m4', 4), msg('m5', 5)],
        { headIntervalItemIdsAtRequest, requestedLimit: 3 },
      );

      expect(paginator.getItem('m1')).toBeDefined();
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('treats a page starting at a message that arrived during the request as past a gap', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      const headIntervalItemIdsAtRequest = paginator.getHeadIntervalItemIdsAtRequest();
      // m20 and m21 arrive live while the request is out; m4–m19 were missed
      paginator.ingestItem(msg('m20', 20));
      paginator.ingestItem(msg('m21', 21));

      paginator.reconcileNewestMessages([msg('m20', 20), msg('m21', 21)], {
        headIntervalItemIdsAtRequest,
        requestedLimit: 2,
      });

      expect(ids(paginator)).toEqual(['m20', 'm21']);
      expect(paginator.getItem('m3')).toBeUndefined();
      expect(paginator.hasMoreTail).toBe(true);
    });

    it('snapshots only the server-confirmed messages of the newest window for a request', () => {
      const paginator = loadHead([
        msg('m1', 1),
        msg('sending', 2, { status: 'sending' }),
        msg('failed', 3, { status: 'failed' }),
      ]);
      // a window apart from the newest window is not part of it
      paginator.ingestPage({ page: [msg('old', 0)], isHead: false, setActive: false });

      expect([...(paginator.getHeadIntervalItemIdsAtRequest() ?? [])]).toEqual(['m1']);
    });

    it('takes no snapshot for a request while the newest window is not loaded', () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.ingestPage({ page: [msg('old', 0)], isHead: false, setActive: true });

      expect(paginator.getHeadIntervalItemIdsAtRequest()).toBeUndefined();
    });

    it('merges a short newest page that reached the channel start into the shown window', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);

      // fewer than the 3 requested: no message older than m4 exists, so nothing is missing between
      paginator.reconcileNewestMessages([msg('m4', 4)], { requestedLimit: 3 });

      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.hasMoreTail).toBe(false);
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('loads newer messages across a gap from the newest sent message, never an unsent one', async () => {
      const paginator = loadHead([msg('m10', 10), msg('m11', 11), msg('m12', 12)]);
      // a jumped-to window whose newest item is unsent
      paginator.ingestPage({
        page: [
          msg('m1', 1),
          msg('m2', 2),
          msg('m3', 3),
          msg('failed', 8, { status: 'failed' }),
        ],
        isHead: false,
        isTail: false,
        setActive: false,
      });
      await paginator.jumpToMessage('m1');
      paginator.pageSize = 3;
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'failed']);
      expect(paginator.cursor?.headward).toBe('m3');

      const query = channel.query as unknown as ReturnType<typeof vi.fn>;
      query.mockResolvedValue({ messages: [msg('m4', 4), msg('m5', 5), msg('m6', 6)] });
      await paginator.toHead();

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.objectContaining({ id_gt: 'm3' }),
        }),
      );
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'failed']);
      expect(paginator.cursor?.headward).toBe('m6');
    });

    it('joins the newest window holding an unsent message when loading newer messages reaches it', async () => {
      const paginator = loadHead([
        msg('m10', 10),
        msg('m11', 11),
        msg('m12', 12),
        msg('failed', 20, { status: 'failed' }),
      ]);
      // the reader jumped to an older window
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        isHead: false,
        isTail: false,
        setActive: false,
      });
      await paginator.jumpToMessage('m1');
      paginator.pageSize = 3;
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);

      const query = channel.query as unknown as ReturnType<typeof vi.fn>;
      for (const minutes of [
        [4, 5, 6],
        [7, 8, 9],
        [10, 11, 12],
      ]) {
        query.mockResolvedValueOnce({
          messages: minutes.map((minute) => msg(`m${minute}`, minute)),
        });
        await paginator.toHead();
      }

      const joined = [...Array.from({ length: 12 }, (_, i) => `m${i + 1}`), 'failed'];
      expect(ids(paginator)).toEqual(joined);
      // the joined window reaches the newest message
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual(joined);
      expect(paginator.itemIntervals).toHaveLength(1);

      // a new message joins the shown window
      paginator.ingestItem(msg('m30', 30));
      expect(ids(paginator)).toEqual([...joined, 'm30']);
    });

    it('joins the newest window holding an unsent message when a short page reaches its newest sent message', async () => {
      const paginator = loadHead([
        msg('m10', 10),
        msg('m11', 11),
        msg('m12', 12),
        msg('failed', 20, { status: 'failed' }),
      ]);
      // the reader jumped to an older window
      paginator.ingestPage({
        page: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
        isHead: false,
        isTail: false,
        setActive: false,
      });
      await paginator.jumpToMessage('m1');
      paginator.pageSize = 10;
      // a newer message was reported, and hard-deleted since
      paginator.setQueriedLatestMessageAt(msg('m13', 13).created_at);

      const query = channel.query as unknown as ReturnType<typeof vi.fn>;
      // fewer than the 10 requested: nothing newer than m12 exists
      query.mockResolvedValueOnce({
        messages: [4, 5, 6, 7, 8, 9, 10, 11, 12].map((minute) =>
          msg(`m${minute}`, minute),
        ),
      });
      await paginator.toHead();

      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.anchoredHeadItems.map((message) => message.id)).toEqual(
        ids(paginator),
      );
    });

    it('keeps the head mark of a window holding newer messages than a page claiming the newest', async () => {
      const doRequest = vi.fn().mockResolvedValue({
        items: [msg('m19', 19), msg('m20', 20), msg('m21', 21)],
        cursor: { headward: null, tailward: 'm19' },
      });
      const paginator = new MessagePaginator({
        channel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
        paginatorOptions: { doRequest },
      });
      paginator.ingestPage({
        page: [msg('m50', 50), msg('m51', 51), msg('m52', 52)],
        isHead: true,
        isTail: false,
        setActive: true,
      });

      // the server reports the page as reaching the newest message; the newer window contradicts it
      await paginator.jumpToMessage('m20');

      const newer = paginator.itemIntervals.find((interval) =>
        (interval as Interval).itemIds.includes('m50'),
      ) as Interval;
      expect(newer.isHead).toBe(true);
      // the view shows the newest window the getter reads
      expect(
        paginator.intervalViews
          .getLatestValue()
          .anchoredHead.map((message) => message.id),
      ).toEqual(['m50', 'm51', 'm52']);
    });

    it('loads older messages without a cursor key when the window holds no message the server knows', async () => {
      const paginator = loadHead([msg('m30', 30), msg('m31', 31)]);
      // a window of only unsent messages, older than the newest one
      paginator.ingestPage({
        page: [msg('sending', 20, { status: 'sending' })],
        isHead: false,
        isTail: false,
        policy: 'strict-overlap-only',
      });
      await paginator.jumpToMessage('sending');
      expect(paginator.cursor?.tailward).toBeNull();

      const query = channel.query as unknown as ReturnType<typeof vi.fn>;
      query.mockResolvedValue({ messages: [] });
      await paginator.toTail();

      const { messages } = query.mock.calls[query.mock.calls.length - 1][0];
      expect(messages).not.toHaveProperty('id_lt');
    });

    it('reconciles the inactive head but preserves the view when the caller jumped to a separate older window', () => {
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
      paginator.reconcileNewestMessages([msg('m8', 8), msg('m10', 10)], {
        headIntervalItemIdsAtRequest: new Set(['m8', 'm9', 'm10']),
      });

      // The view (the older window) is preserved — no yank to the head — but the inactive-head ghost m9
      // is still pruned, so returning to the head later (scroll-to-latest) won't surface it.
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm3']);
      expect(paginator.getItem('m9')).toBeUndefined();
    });

    it('is idempotent — a second reconcile against the same page removes nothing more', () => {
      const loaded = [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4)];
      const paginator = loadHead(loaded);

      paginator.reconcileNewestMessages([msg('m1', 1), msg('m3', 3), msg('m4', 4)], {
        headIntervalItemIdsAtRequest: new Set(loaded.map((message) => message.id)),
      });
      expect(ids(paginator)).toEqual(['m1', 'm3', 'm4']);

      paginator.reconcileNewestMessages([msg('m1', 1), msg('m3', 3), msg('m4', 4)], {
        headIntervalItemIdsAtRequest: new Set(['m1', 'm3', 'm4']),
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

      paginator.reconcileNewestMessages(page, {
        requestedLimit: all.length, // reload asks for all 105; the server caps the returned page at 100
        headIntervalItemIdsAtRequest: new Set(all.map((message) => message.id)),
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

      paginator.reconcileNewestMessages(all.slice(5), {
        requestedLimit: all.length,
        headIntervalItemIdsAtRequest: new Set(all.map((message) => message.id)),
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
      paginator.reconcileNewestMessages([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
        requestedLimit: 5,
        headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
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
        paginator.reconcileNewestMessages([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
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
        paginator.reconcileNewestMessages([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
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
        paginator.reconcileNewestMessages([msg('m2', 2), msg('m3', 3), msg('m4', 4)], {
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
        paginator.reconcileNewestMessages(
          [msg('m2', 2), msg('m3', 3), msg('m4', 4), msg('m5', 5)],
          {
            requestedLimit: 5,
            headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
          },
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
        paginator.reconcileNewestMessages([msg('m3', 3), msg('m4', 4), msg('m5', 5)], {
          requestedLimit: 5,
          headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
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
        paginator.reconcileNewestMessages([msg('m4', 4), msg('m5', 5)], {
          requestedLimit: 3,
          headIntervalItemIdsAtRequest: new Set(['m3', 'm4', 'm5']),
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
        paginator.reconcileNewestMessages([msg('m4', 4), msg('m5', 5)], {
          requestedLimit: 2,
          headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
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
        paginator.reconcileNewestMessages(
          [msg('m1', 1), msg('m2', 2), msg('m4', 4), msg('m5', 5)],
          {
            requestedLimit: 5,
            headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
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
        paginator.reconcileNewestMessages(
          [reply('r2', 2), reply('r3', 3), reply('r4', 4)],
          {
            requestedLimit: 4,
            headIntervalItemIdsAtRequest: new Set(['r1', 'r2', 'r3', 'r4']),
          },
        );
        await flushProbe(paginator);
        expect(channel.getReplies).toHaveBeenCalledWith(
          { parent_id: 'parent-1' },
          { limit: 1, id_lt: 'r2' },
        );
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
        paginator.reconcileNewestMessages(
          [msg('m2', 2), msg('m3', 3), msg('m4', 4), msg('m5', 5)],
          {
            requestedLimit: 5,
            headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
          },
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
        paginator.reconcileNewestMessages(
          [msg('m2', 2), msg('m3', 3), msg('m6', 6), msg('m7', 7), msg('m8', 8)],
          {
            requestedLimit: 5,
            headIntervalItemIdsAtRequest: new Set(['m1', 'm2', 'm3', 'm4', 'm5']),
          },
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

      paginator.reconcileNewestMessages(page, {
        headIntervalItemIdsAtRequest: new Set(all.map((message) => message.id)),
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
        ...fakeChannelQuery,
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
      paginator.reconcileNewestMessages([msg('m1', 1), msg('m2', 2), msg('m4', 4)]);

      expect(paginator.getItem('m3')).toBeUndefined();
      expect(hardDeleteMessages).toHaveBeenCalledWith({ ids: ['m3'] });
    });

    it('reconciles in-memory without error when offline support is disabled (no offlineDb)', () => {
      // The default mock channel has no getClient/offlineDb → the DB purge is a guarded no-op.
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      expect(() =>
        paginator.reconcileNewestMessages([msg('m1', 1), msg('m3', 3)]),
      ).not.toThrow();
      expect(paginator.getItem('m2')).toBeUndefined();
    });
  });

  // A page from an external query (watch() / create() / hydrateChannels) is either placed
  // (placeExternalQueryPage) or, as the newest page into loaded messages, reconciles them
  // (reconcileNewestMessages: merged and reconciled, or a newest window of its own across a gap),
  // whose internals are covered above. The routing tests below pin which of the two runs; the rest
  // pin reconnect flows.
  describe('external query pages: placing or reconciling', () => {
    const msg = (id: string, minute: number, overrides: Partial<MessageResponse> = {}) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(
          new Date(Date.UTC(2020, 0, 1, 0, minute, 0)).toISOString(),
        ),
        ...overrides,
      });

    const reconcileGetReplies = vi.fn();
    const reconcileChannel = {
      cid: 'channel-id',
      getReplies: reconcileGetReplies,
      query: vi.fn(),
      ...fakeChannelQuery,
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

    it('clears a previous query error when the newest messages are reconciled', () => {
      // Reconciling skips `placeQueryPage`, the only other thing that resets `lastQueryError`.
      // Without a clear here a failed "load older" stays latched through an otherwise successful
      // reconnect refresh, and any UI reading the paginator keeps its error up.
      const paginator = loadHead([msg('m1', 1), msg('m2', 2)]);
      paginator.state.partialNext({ lastQueryError: new Error('load older failed') });

      paginator.reconcileNewestMessages([msg('m1', 1), msg('m2', 2), msg('m3', 3)], {
        requestedLimit: 25,
      });

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

      // Reconnect reconciles the head window. The merge biases hasMoreTail to `true`
      // (isTail:false), which clears the stale "complete" flag so "load older" works again — not
      // read off the stale interval flag. (If the channel really is fully loaded, the next
      // load-older returns empty and settles it.)
      hydrateNewestPage(paginator, [msg('m1', 1), msg('m2', 2), msg('m3', 3)], 3);

      expect(paginator.state.getLatestValue().hasMoreTail).toBe(true);
      expect(paginator.state.getLatestValue().cursor?.tailward).toBe('m1');
    });

    it('JOURNEY: a reconnect refresh over a stale window keeps "load older" working end-to-end', async () => {
      // The exact user flow that regressed: open a channel, its window is preloaded from the
      // offline DB with a dead cursor, a reconnect refreshes it, then the user scrolls up. "Load
      // older" must fetch and append the previous page — a component-level test (checking only
      // which messages merged) missed this because the break was in the CURSOR, so drive the real
      // executeQuery pagination here.
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
      hydrateNewestPage(paginator, head, 5); // reconnect refresh

      // The user scrolls up. If the refresh left the dead cursor, executeQuery no-ops (hasMoreTail
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

    it('a reconnect refresh while JUMPED AWAY does not weld the newest page into the active older window', () => {
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

      // A reconnect fetches the newest page again (channel.reload → watch →
      // reconcileNewestMessages). It must NOT weld the newest into the jumped-away window — the two
      // message sets stay separate.
      hydrateNewestPage(
        paginator,
        [msg('m080', 80), msg('m090', 90), msg('m100', 100)],
        3,
      );

      expect(paginator.isActiveIntervalAtHead).toBe(false); // still on the jumped window
      expect(paginator.items?.map((m) => m.id)).toEqual(before); // unchanged — no weld
    });

    it('AUDIT: a reconnect page separated by a gap is not welded to the shown window', () => {
      const paginator = loadHead([msg('m01', 1), msg('m02', 2), msg('m03', 3)]);
      // 100+ new arrived while offline → the fetched newest page shares NO id with the loaded window.
      hydrateNewestPage(paginator, [msg('m10', 10), msg('m11', 11), msg('m12', 12)], 3);
      // Must NOT weld m10..m12 across the gap into m01..m03 (which hides m04..m09 with no way to
      // reach them): the page replaces the loaded window, and loads older messages, the gap.
      expect(paginator.items?.map((m) => m.id)).toEqual(['m10', 'm11', 'm12']);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.hasMoreTail).toBe(true);
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('AUDIT: an empty reconnect page (no snapshot) does not blank the loaded window', () => {
      const paginator = loadHead([msg('m01', 1), msg('m02', 2), msg('m03', 3)]);
      // A transient empty page on reconnect must not wipe the list on its own.
      hydrateNewestPage(paginator, [], 3);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m01', 'm02', 'm03']);
    });

    it('AUDIT e2e: after a newest page shown past a gap, "load older" loads the gap', async () => {
      // the next older page from the shown page reaches the messages loaded before the gap
      const doRequest = vi.fn().mockResolvedValue({
        items: [msg('m078', 78), msg('m079', 79), msg('m080', 80)],
        cursor: { tailward: 'm078', headward: 'm080' },
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
      // Reconnect: the fetched newest page shares no id with the loaded window.
      hydrateNewestPage(
        paginator,
        [msg('m081', 81), msg('m082', 82), msg('m083', 83)],
        3,
      );
      expect(paginator.items?.map((m) => m.id)).toEqual(['m081', 'm082', 'm083']);

      await paginator.executeQuery({ direction: 'tailward' });

      expect(doRequest).toHaveBeenCalledWith(expect.objectContaining({ id_lt: 'm081' }));

      expect(paginator.items?.map((m) => m.id)).toEqual([
        'm078',
        'm079',
        'm080',
        'm081',
        'm082',
        'm083',
      ]);
      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.itemIntervals).toHaveLength(1);
    });

    it('a jump to a far disjoint message stays SEPARATE from the latest, even through a refresh', async () => {
      const around = [msg('m20', 20), msg('m21', 21), msg('m22', 22)];
      const doRequest = vi.fn().mockResolvedValue({
        items: around,
        cursor: { tailward: 'm20', headward: 'm22' },
      });
      const paginator = new MessagePaginator({
        channel: reconcileChannel,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({ getEntityId: (m) => m.id }),
        // a full page around m21: messages exist on both sides of it
        paginatorOptions: { doRequest, pageSize: 3 },
      });
      paginator.ingestPage({
        page: [msg('m80', 80), msg('m90', 90), msg('m100', 100)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      await paginator.jumpToMessage('m21');
      // Reconciling the newest messages (what watch() does on a refresh) must NOT weld the jumped
      // window into the latest — it leaves it alone because the head is not the active interval.
      hydrateNewestPage(paginator, [msg('m80', 80), msg('m90', 90), msg('m100', 100)], 3);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m20', 'm21', 'm22']);
      expect(paginator.itemIntervals.length).toBe(2);
    });

    it('anchoredHeadItems is the inactive head window (not the active island) — the headIntervalItemIdsAtRequest source when jumped away', () => {
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
      // ...`anchoredHeadItems` is the inactive head, which is what channel.query snapshots for headIntervalItemIdsAtRequest.
      expect(paginator.anchoredHeadItems.map((m) => m.id)).toEqual([
        'm90',
        'm95',
        'm100',
      ]);
    });

    it('reconnect while jumped away prunes the whole trailing run from the inactive head', () => {
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
      // Jump to a far older island — now jumped away; the head is loaded but not active.
      paginator.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: false,
        isTail: false,
        setActive: true,
      });
      expect(paginator.isActiveIntervalAtHead).toBe(false);

      // headIntervalItemIdsAtRequest is snapshotted by channel.query from `anchoredHeadItems` (the inactive head) — NOT `items`
      // (the island). The whole trailing RUN m98,m99,m100 was hard-deleted offline; all three are above
      // the newest survivor (m95), so only the head-derived snapshot can prune them.
      const headIntervalItemIdsAtRequest = new Set(
        paginator.anchoredHeadItems.map((m) => m.id),
      );
      paginator.reconcileNewestMessages([msg('m90', 90), msg('m95', 95)], {
        headIntervalItemIdsAtRequest,
      });

      // View preserved (still on the island)...
      expect(paginator.isActiveIntervalAtHead).toBe(false);
      expect(paginator.items?.map((m) => m.id)).toEqual(['m10', 'm11', 'm12']);
      // ...and the ENTIRE trailing run is pruned from the inactive head — none surface on scroll-to-latest.
      expect(paginator.getItem('m98')).toBeUndefined();
      expect(paginator.getItem('m99')).toBeUndefined();
      expect(paginator.getItem('m100')).toBeUndefined();
      const headIds = (paginator.itemIntervals[0] as { itemIds: string[] }).itemIds;
      expect(headIds).toEqual(['m90', 'm95']);
    });

    it('reconciling clears a sticky isTail so a far older page cannot weld across the gap', () => {
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

      // Reconciling at the derived page size (a FULL page => older messages remain) must
      // clear the sticky isTail — not just state's hasMoreTail.
      hydrateNewestPage(paginator, [msg('m90', 90), msg('m95', 95), msg('m100', 100)], 3);
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

    it('reconciles loaded messages with the newest page, dropping a within-span hard-delete', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      const externalQuery = paginator.prepareExternalQuery({ limit: 3 });
      // m2 hard-deleted while offline; the authoritative newest page comes back without it.
      externalQuery.placePage([msg('m1', 1), msg('m3', 3)]);
      expect(ids(paginator)).toEqual(['m1', 'm3']);
      expect(paginator.getItem('m2')).toBeUndefined();
    });

    it('reconciling drops a trailing ghost while keeping a message that arrived during the fetch', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // the loaded ids are noted when the query is prepared, before the request
      const externalQuery = paginator.prepareExternalQuery({ limit: 3 });
      // A live message lands during the request (so it is not among the noted ids).
      paginator.ingestItem(msg('m4', 4));
      // The page (missing m3 — the hard-deleted newest — and predating m4) is the server truth.
      externalQuery.placePage([msg('m1', 1), msg('m2', 2)]);
      // m3 removed (in the snapshot, absent from the page, at the top edge); m4 kept (a live arrival).
      expect(ids(paginator)).toEqual(['m1', 'm2', 'm4']);
    });

    it('places the newest page as the first page when nothing is loaded', () => {
      const paginator = makePaginator();
      expect(paginator.items).toBeUndefined();

      const placedFirstPage = paginator
        .prepareExternalQuery({ limit: 25 })
        .placePage([msg('m1', 1), msg('m2', 2)]);

      expect(placedFirstPage).toBe(true);
      expect(ids(paginator)).toEqual(['m1', 'm2']);
    });

    it('placing a page never removes a loaded message (the pinned list only places)', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // Same missing-m2 page, placed rather than reconciled: m2 is NOT removed.
      paginator.placeExternalQueryPage([msg('m1', 1), msg('m3', 3)], 3);
      expect(paginator.getItem('m2')).toBeDefined();
    });

    it('places a jumped-to page as a jump, never reconciling the newest messages', () => {
      const paginator = loadHead([msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
      // An around open is not the newest page, so the loaded messages must not be reconciled away.
      paginator
        .prepareExternalQuery({ id_around: 'm5', limit: 25 })
        .placePage([msg('m5', 5), msg('m6', 6)]);
      expect(paginator.getItem('m1')).toBeDefined();
      expect(paginator.getItem('m2')).toBeDefined();
      expect(paginator.getItem('m3')).toBeDefined();
    });
  });

  describe('trackLatestMessage() / latestMessageAt', () => {
    let skipSystemMessages: boolean;
    let trackingChannel: Channel;

    const buildPaginator = (parentMessageId?: string) => {
      trackingChannel = {
        cid: 'channel-id',
        serverConfig: { skip_last_msg_update_for_system_msgs: skipSystemMessages },
        getReplies: vi.fn(),
        query: vi.fn(),
        ...fakeChannelQuery,
      } as unknown as Channel;
      return new MessagePaginator({
        channel: trackingChannel,
        parentMessageId,
        itemIndex: new StoreBackedItemIndex<LocalMessage>({
          getEntityId: (message) => message.id,
        }),
      });
    };

    const at = (iso: string) => convertDateToTimestamp(iso);

    beforeEach(() => {
      skipSystemMessages = false;
    });

    it('is null until a message is tracked', () => {
      const paginator = buildPaginator();
      expect(paginator.aggregateState.getLatestValue()).toEqual({
        latestMessage: null,
        queriedLatestMessageAt: null,
      });
      expect(paginator.latestMessageAt).toBeNull();
      expect(paginator.latestMessage).toBeNull();
    });

    it('advances latestMessageAt and latestMessage without ingesting a window', () => {
      const paginator = buildPaginator();

      paginator.trackLatestMessage(
        createMessage({
          id: 'a',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );

      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));
      // The display message is tracked on aggregateState (reactive off-window), not the visible list.
      expect(paginator.latestMessage?.id).toBe('a');
      expect(paginator.items).toBeUndefined();
    });

    it('a queried value sets only the timestamp, leaving latestMessage null', () => {
      const paginator = buildPaginator();
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2023-05-03T11:12:53.993Z'),
      );
      expect(paginator.latestMessageAt).toBe(at('2023-05-03T11:12:53.993Z'));
      // A queried last_message_at has a timestamp but not the message itself.
      expect(paginator.latestMessage).toBeNull();
    });

    it('latestMessageAt is the max of the loaded message and the queried value; it never blocks the display message', () => {
      const paginator = buildPaginator();
      // Server says the newest message is far in the future (not yet loaded).
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2030-01-01T00:00:00.000Z'),
      );
      expect(paginator.latestMessageAt).toBe(at('2030-01-01T00:00:00.000Z'));
      expect(paginator.latestMessage).toBeNull();

      // A real (older-than-seed) message must still become the display message — the guard is
      // against the display message's own timestamp, not latestMessageAt, which the queried value
      // can make later.
      paginator.trackLatestMessage(
        createMessage({
          id: 'a',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessage?.id).toBe('a');
      // The sort key stays the max (the queried value): never below the display message.
      expect(paginator.latestMessageAt).toBe(at('2030-01-01T00:00:00.000Z'));

      // Once a message newer than the queried value arrives, latestMessageAt follows it.
      paginator.trackLatestMessage(
        createMessage({
          id: 'b',
          created_at: convertDateToTimestamp('2031-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessage?.id).toBe('b');
      expect(paginator.latestMessageAt).toBe(at('2031-01-01T00:00:00.000Z'));
    });

    it('does not emit on the pagination state (writes the separate aggregateState store)', () => {
      const paginator = buildPaginator();
      let stateEmissions = 0;
      const unsubscribe = paginator.state.subscribe(() => {
        stateEmissions += 1;
      });
      stateEmissions = 0; // ignore the synchronous initial subscribe call

      paginator.trackLatestMessage(
        createMessage({
          id: 'a',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      unsubscribe();

      expect(stateEmissions).toBe(0);
      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));
    });

    it('advances monotonically by created_at', () => {
      const paginator = buildPaginator();

      paginator.trackLatestMessage(
        createMessage({
          id: 'a',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      paginator.trackLatestMessage(
        createMessage({
          id: 'b',
          created_at: convertDateToTimestamp('2019-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));

      paginator.trackLatestMessage(
        createMessage({
          id: 'c',
          created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessageAt).toBe(at('2021-01-01T00:00:00.000Z'));
    });

    it('never advances for a shadowed message', () => {
      const paginator = buildPaginator();

      paginator.trackLatestMessage(
        createMessage({
          id: 'a',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
          shadowed: true,
        }),
      );

      expect(paginator.latestMessageAt).toBeNull();
    });

    it('never advances for a thread-only reply, but does for a reply shown in the channel', () => {
      const paginator = buildPaginator();

      paginator.trackLatestMessage(
        createMessage({
          id: 'reply',
          parent_id: 'parent',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessageAt).toBeNull();

      paginator.trackLatestMessage(
        createMessage({
          id: 'reply-shown',
          parent_id: 'parent',
          show_in_channel: true,
          created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessageAt).toBe(at('2021-01-01T00:00:00.000Z'));
    });

    it('skips system messages only when skip_last_msg_update_for_system_msgs is set', () => {
      skipSystemMessages = true;
      const skipping = buildPaginator();
      const systemMessage = createMessage({
        id: 'sys',
        type: 'system',
        created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      });
      skipping.trackLatestMessage(systemMessage);
      expect(skipping.latestMessageAt).toBeNull();

      skipSystemMessages = false;
      const tracking = buildPaginator();
      tracking.trackLatestMessage(systemMessage);
      expect(tracking.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));
    });

    it('auto-tracks on ingestion for the main channel list too', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      // The main list no longer relies on an explicit channel-level call: ingestion advances the
      // latestMessageAt aggregate directly.
      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));
    });

    it('takes latestMessageAt from a queried value, which replaces the previous one', () => {
      const paginator = buildPaginator();

      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2020-06-01T00:00:00.000Z'),
      );
      expect(paginator.latestMessageAt).toBe(at('2020-06-01T00:00:00.000Z'));

      // an earlier server value moves it back: the newest message was hard-deleted
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      );
      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));

      // a value missing from the response leaves it
      paginator.setQueriedLatestMessageAt(undefined);
      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));

      // a newer ingested message advances past the queried value
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessageAt).toBe(at('2021-01-01T00:00:00.000Z'));

      // ...and keeps counting when a response produced before it arrived carries an earlier value
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2020-06-01T00:00:00.000Z'),
      );
      expect(paginator.latestMessageAt).toBe(at('2021-01-01T00:00:00.000Z'));
    });

    it('clears the queried value when a query reports no messages', () => {
      const paginator = buildPaginator();
      paginator.setQueriedLatestMessageAt(
        convertDateToTimestamp('2020-06-01T00:00:00.000Z'),
      );

      paginator.setQueriedLatestMessageAt(null);

      expect(paginator.latestMessageAt).toBeNull();
    });

    describe('reply list (parentMessageId) auto-tracks on ingestion', () => {
      const reply = (id: string, createdAt: string): LocalMessage =>
        createMessage({
          id,
          cid: 'channel-id',
          parent_id: 'parent',
          created_at: convertDateToTimestamp(createdAt),
        });

      it('advances to the newest reply on ingestItem, regardless of ingestion order', () => {
        const paginator = buildPaginator('parent');

        paginator.ingestItem(reply('r2', '2020-01-01T00:00:02.000Z'));
        expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:02.000Z'));

        // an older reply arriving later must not move the value back
        paginator.ingestItem(reply('r1', '2020-01-01T00:00:01.000Z'));
        expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:02.000Z'));

        paginator.ingestItem(reply('r3', '2020-01-01T00:00:03.000Z'));
        expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:03.000Z'));
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

        expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:03.000Z'));
      });
    });

    it('resets latestMessageAt on clearStateAndCache()', () => {
      const paginator = buildPaginator();
      paginator.trackLatestMessage(
        createMessage({
          id: 'a',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessageAt).toBe(at('2020-01-01T00:00:00.000Z'));

      paginator.clearStateAndCache();

      expect(paginator.latestMessageAt).toBeNull();
    });

    it('refreshes latestMessage in place (and emits) when the current latest is edited', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
          text: 'hello',
        }),
      );
      expect(paginator.latestMessage?.text).toBe('hello');

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
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
          text: 'edited',
        }),
      );
      unsubscribe();

      expect(paginator.latestMessage?.text).toBe('edited');
      expect(emissions).toBe(1);
    });

    it('reflects a soft-delete of the current latest', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
          type: 'deleted',
          deleted_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessage?.type).toBe('deleted');
    });

    it('recomputes latestMessage to the next newest when the current latest is hard-removed', () => {
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'a',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
        }),
      );
      paginator.ingestItem(
        createMessage({
          id: 'b',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-02T00:00:00.000Z'),
        }),
      );
      expect(paginator.latestMessage?.id).toBe('b');

      paginator.removeItem({ id: 'b' });
      expect(paginator.latestMessage?.id).toBe('a');

      paginator.removeItem({ id: 'a' });
      expect(paginator.latestMessage).toBeNull();
    });

    it('recompute after hard-remove skips a trailing system message (the newest loaded item)', () => {
      skipSystemMessages = true;
      const paginator = buildPaginator();
      paginator.ingestItem(
        createMessage({
          id: 'm0',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:01.000Z'),
        }),
      );
      paginator.ingestItem(
        createMessage({
          id: 'm1',
          cid: 'channel-id',
          created_at: convertDateToTimestamp('2020-01-01T00:00:02.000Z'),
        }),
      );
      // A system message is the newest LOADED item, but the config keeps it from becoming the latest.
      paginator.ingestItem(
        createMessage({
          id: 'sys',
          cid: 'channel-id',
          type: 'system',
          created_at: convertDateToTimestamp('2020-01-01T00:00:03.000Z'),
        }),
      );
      expect(paginator.latestMessage?.id).toBe('m1');
      // the newest loaded item, unfiltered
      expect(paginator.anchoredHeadItem?.id).toBe('sys');

      // Hard-removing the tracked latest must recompute to the previous NON-system message (m0),
      // not to the newest loaded item (which is the system message).
      paginator.removeItem({ id: 'm1' });
      expect(paginator.latestMessage?.id).toBe('m0');
    });
  });

  describe('jump queries leave the list paginating', () => {
    const notifications = { addError: vi.fn() };
    const m = (id: string, minute: number) =>
      createMessage({
        cid: 'channel-id',
        id,
        created_at: convertDateToTimestamp(
          `2020-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`,
        ),
      });
    const respondWith = (endpoint: 'getReplies' | 'query', messages: LocalMessage[]) =>
      (channel[endpoint] as unknown as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValue({ messages });
    // The latest page, seeded the way a channel opens: nothing newer to load.
    const loadNewestPage = (paginator: MessagePaginator) =>
      paginator.placeExternalQueryPage([m('m50', 50), m('m51', 51), m('m52', 52)], 3);

    beforeEach(() => {
      (channel as unknown as { getClient: () => unknown }).getClient = () => ({
        getReplies: channel.getReplies,
        notifications,
        user: { id: 'me' },
      });
      (channel as unknown as { state: unknown }).state = { read: {} };
    });

    it('ends loading when the jump target is not in the response', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      loadNewestPage(paginator);
      respondWith('query', [m('m10', 10), m('m11', 11)]);

      expect(await paginator.jumpToMessage('missing')).toBe(false);
      expect(paginator.isLoading).toBe(false);

      respondWith('query', [m('m49', 49)]);
      await paginator.toTail();
      expect(channel.query).toHaveBeenCalledTimes(1);
    });

    it('ends loading after the first-unread jump queries around the last read time', async () => {
      (channel as unknown as { state: unknown }).state = {
        read: {
          me: {
            first_unread_message_id: null,
            last_read: convertDateToTimestamp('2020-01-01T00:20:00.000Z'),
            last_read_message_id: null,
          },
        },
      };
      const paginator = new MessagePaginator({ channel, itemIndex });
      paginator.pageSize = 4;
      // Every loaded message is newer than the last read time, so the boundary has to be queried.
      loadNewestPage(paginator);
      // A full page split evenly around the boundary, so there is more to load on both sides.
      respondWith('query', [m('m18', 18), m('m19', 19), m('m21', 21), m('m22', 22)]);

      expect(await paginator.jumpToTheFirstUnreadMessage()).toBe(true);
      expect(channel.query).toHaveBeenCalledWith({
        messages: expect.objectContaining({
          created_at_around: expect.any(Date),
          limit: 4,
        }),
      });
      expect(paginator.items?.map((message) => message.id)).toContain('m21');
      expect(paginator.isLoading).toBe(false);

      respondWith('query', [m('m18', 18)]);
      await paginator.toTail();
      expect(channel.query).toHaveBeenCalledTimes(1);
    });

    it('sends a limit with a thread jump, which the replies endpoint needs to honour id_around', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      loadNewestPage(paginator);
      respondWith('getReplies', [m('m10', 10), m('m11', 11), m('m12', 12)]);

      expect(await paginator.jumpToMessage('m11')).toBe(true);
      expect(channel.getReplies).toHaveBeenCalledWith(
        { parent_id: 'parent-1' },
        expect.objectContaining({ id_around: 'm11', limit: paginator.pageSize }),
      );
    });

    it('derives the jump window flags from the limit the jump sent, not the page size', async () => {
      const paginator = new MessagePaginator({ channel, itemIndex });
      loadNewestPage(paginator);
      // A full 5-message page centred on the target: there is more on both sides.
      respondWith('query', [
        m('m9', 9),
        m('m10', 10),
        m('m11', 11),
        m('m12', 12),
        m('m13', 13),
      ]);

      expect(await paginator.jumpToMessage('m11', { pageSize: 5 })).toBe(true);
      expect(paginator.pageSize).toBeGreaterThan(5);
      expect(paginator.hasMoreHead).toBe(true);
      expect(paginator.hasMoreTail).toBe(true);
    });

    it.each([
      ['newer', 'toHead', 'id_lt', 'm9'],
      ['older', 'toTail', 'id_gt', 'm13'],
    ] as const)(
      'keeps paging the other way after an empty %s page',
      async (_, emptyDirection, otherCursorParam, otherCursorId) => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadNewestPage(paginator);
        respondWith('query', [
          m('m9', 9),
          m('m10', 10),
          m('m11', 11),
          m('m12', 12),
          m('m13', 13),
        ]);
        await paginator.jumpToMessage('m11', { pageSize: 5 });

        // Nothing further this way: that side ends, the other keeps its cursor.
        respondWith('query', []);
        await paginator[emptyDirection]();
        const otherWay = emptyDirection === 'toHead' ? 'toTail' : 'toHead';
        expect(
          emptyDirection === 'toHead' ? paginator.hasMoreHead : paginator.hasMoreTail,
        ).toBe(false);

        respondWith('query', []);
        await paginator[otherWay]();
        expect(channel.query).toHaveBeenCalledWith({
          messages: expect.objectContaining({ [otherCursorParam]: otherCursorId }),
        });
      },
    );

    it('has nothing either way when the first page of a list comes back empty', async () => {
      const paginator = new MessagePaginator({
        channel,
        itemIndex,
        parentMessageId: 'parent-1',
      });
      respondWith('getReplies', []);

      await paginator.toTail();

      expect(paginator.hasMoreHead).toBe(false);
      expect(paginator.hasMoreTail).toBe(false);
    });

    describe('jump window flags follow how the server fills an around-page', () => {
      // The server centres the page on the target and fills a short side from the other one.
      const page = (from: number, to: number) =>
        Array.from({ length: to - from + 1 }, (_, i) => m(`m${from + i}`, from + i));
      const jump = async (messageId: string, response: LocalMessage[], pageSize = 10) => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadNewestPage(paginator);
        respondWith('query', response);
        expect(await paginator.jumpToMessage(messageId, { pageSize })).toBe(true);
        return paginator;
      };

      it.each([
        // 5 older, 4 newer, and the even split the other way round
        ['an even split', 'm15', page(10, 19)],
        ['the opposite even split', 'm14', page(10, 19)],
      ])('has more both ways after %s', async (_, target, response) => {
        const paginator = await jump(target, response);
        expect(paginator.hasMoreHead).toBe(true);
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('has nothing older but more newer after a jump to the oldest message', async () => {
        const paginator = await jump('m1', page(1, 10));
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
      });

      it('has nothing older when the older side came back short', async () => {
        const paginator = await jump('m3', page(1, 10));
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
      });

      it('has nothing newer when the newer side came back short', async () => {
        const paginator = await jump('m28', page(20, 29));
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('has nothing either way when the page is shorter than the limit', async () => {
        const paginator = await jump('m12', page(10, 14));
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.hasMoreTail).toBe(false);
      });

      it('has more newer after a first-unread jump near the oldest messages', async () => {
        (channel as unknown as { state: unknown }).state = {
          read: {
            me: {
              first_unread_message_id: null,
              last_read: convertDateToTimestamp('2020-01-01T00:00:30.000Z'),
              last_read_message_id: null,
            },
          },
        };
        const paginator = new MessagePaginator({ channel, itemIndex });
        paginator.pageSize = 4;
        loadNewestPage(paginator);
        // Read up to before the first message: nothing older, the page filled from the newer side.
        respondWith('query', page(1, 4));

        expect(await paginator.jumpToTheFirstUnreadMessage()).toBe(true);
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
      });

      it('stays at the head when an evenly split page ends at the newest message', async () => {
        // 4 older and 4 newer: the page alone would say "more newer", but its last item is the
        // newest message of the loaded latest window.
        const paginator = await jump('m48', page(44, 52), 9);
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.hasMoreTail).toBe(true);
      });

      it('stays at the tail when an evenly split page starts at the oldest loaded message', async () => {
        const paginator = new MessagePaginator({ channel, itemIndex });
        loadNewestPage(paginator);
        // The oldest messages, already paged in down to the start of the channel.
        paginator.ingestPage({ page: page(1, 3), isHead: false, isTail: true });
        // 4 older and 4 newer: the page alone would say "more older", but it starts at m1.
        respondWith('query', page(1, 9));

        expect(await paginator.jumpToMessage('m5', { pageSize: 9 })).toBe(true);
        expect(paginator.hasMoreTail).toBe(false);
        expect(paginator.hasMoreHead).toBe(true);
      });

      it('keeps the head of a loaded window the jump page merged into', async () => {
        // Overlaps the loaded newest page (m50..m52), so the merged window ends at the dataset head.
        const paginator = await jump('m45', page(41, 50));
        expect(paginator.items?.at(-1)?.id).toBe('m52');
        expect(paginator.hasMoreHead).toBe(false);
        expect(paginator.hasMoreTail).toBe(true);
      });
    });
  });
});
