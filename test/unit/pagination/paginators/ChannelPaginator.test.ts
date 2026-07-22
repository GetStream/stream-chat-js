import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import {
  Channel,
  type ChannelFilters,
  ChannelOptions,
  ChannelPaginator,
  ChannelSort,
  DEFAULT_PAGINATION_OPTIONS,
  type FilterBuilderGenerators,
  formatMessage,
  PaginatorCursor,
  type StreamChat,
} from '../../../../src';
import { getClientWithUser } from '../../test-utils/getClient';
import { generateMsg } from '../../test-utils/generateMessage';
import type { FieldToDataResolver } from '../../../../src/pagination/types.normalization';
import { MockOfflineDB } from '../../offline-support/MockOfflineDB';

const user = { id: 'custom-id' };

// `channel.state.last_message_at` is derived (read-only) from the message paginator's tracked latest
// message. To stage a specific value for sort tests, seed the paginator: clear first so any value
// (including an earlier one) applies, since tracking is monotonic.
const setLastMessageAt = (channel: Channel, date: Date | null) => {
  channel.messagePaginator.clearStateAndCache();
  if (date) {
    channel.messagePaginator.trackLatestMessage(
      formatMessage(generateMsg({ date: date.toISOString() })),
    );
  }
};

describe('ChannelPaginator', () => {
  let client: StreamChat;
  let channel1: Channel;
  let channel2: Channel;

  beforeEach(() => {
    client = getClientWithUser(user);

    channel1 = new Channel(client, 'type', 'id1', {});
    setLastMessageAt(channel1, new Date('1972-01-01T08:39:35.235Z'));
    channel1.data!.updated_at = '1972-01-01T08:39:35.235Z';

    channel2 = new Channel(client, 'type', 'id1', {});
    setLastMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
    channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';
  });

  describe('constructor()', () => {
    it('initiates with defaults', () => {
      const paginator = new ChannelPaginator({ client });
      expect(paginator.pageSize).toBe(DEFAULT_PAGINATION_OPTIONS.pageSize);
      expect(paginator.state.getLatestValue()).toEqual({
        hasMoreTail: true,
        hasMoreHead: true, // initial state (pre-query); becomes false after the first offset-0 query
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        cursor: undefined,
        offset: 0,
      });
      expect(paginator.id.startsWith('channel-paginator')).toBeTruthy();
      expect(paginator.sortComparator).toBeDefined();

      setLastMessageAt(channel1, new Date('1970-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';

      setLastMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';

      expect(paginator.sortComparator(channel1, channel2)).toBe(1); // channel2 comes before channel1
      expect(paginator.filterBuilder.buildFilters()).toStrictEqual({});
      expect(
        paginator.filterBuilder.buildFilters({ baseFilters: paginator.staticFilters }),
      ).toStrictEqual({});
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(9);
      expect(paginator.config.doRequest).toBeUndefined();
    });

    it('initiates with options', () => {
      const customId = 'custom-id';
      const filterGenerators: FilterBuilderGenerators<ChannelFilters> = {
        custom: {
          enabled: true,
          generate: (context) => context,
        },
      };
      const initialFilterBuilderContext = { x: 'y' };

      channel1.data!.created_at = '1970-01-01T08:39:35.235Z';
      channel2.data!.created_at = '1971-01-01T08:39:35.235Z';
      const doRequest = () => Promise.resolve({ items: [channel1] });
      const hasPaginationQueryShapeChanged = () => true;
      const paginatorOptions = {
        debounceMs: 45000,
        doRequest,
        hasPaginationQueryShapeChanged,
        initialCursor: { headward: 'headward', tailward: '' },
        initialOffset: 10,
        lockItemOrder: true,
        pageSize: 2,
        throwErrors: true,
      };

      const paginator = new ChannelPaginator({
        client,
        id: customId,
        filterBuilderOptions: {
          initialContext: initialFilterBuilderContext,
          initialFilterConfig: filterGenerators,
        },
        filters: { type: 'type' },
        paginatorOptions,
        requestOptions: { member_limit: 5 },
        sort: { created_at: 1 },
      });
      expect(paginator.pageSize).toBe(2);
      expect(paginator.state.getLatestValue()).toEqual({
        hasMoreTail: true,
        hasMoreHead: true,
        isLoading: false,
        items: undefined,
        lastQueryError: undefined,
        cursor: paginatorOptions.initialCursor,
        offset: paginatorOptions.initialOffset,
      });
      expect(paginator.id.startsWith(customId)).toBeTruthy();

      expect(paginator.sortComparator(channel1, channel2)).toBe(-1); // channel1 comes before channel2
      expect(paginator.filterBuilder.buildFilters()).toStrictEqual({
        ...initialFilterBuilderContext,
      });
      expect(
        paginator.filterBuilder.buildFilters({ baseFilters: paginator.staticFilters }),
      ).toStrictEqual({
        type: 'type',
        ...initialFilterBuilderContext,
      });
      // @ts-expect-error accessing protected property
      expect(paginator._filterFieldToDataResolvers).toHaveLength(9);
      expect(paginator.config.debounceMs).toStrictEqual(paginatorOptions.debounceMs);
      expect(paginator.config.doRequest).toStrictEqual(doRequest);
      expect(paginator.config.hasPaginationQueryShapeChanged).toStrictEqual(
        hasPaginationQueryShapeChanged,
      );
      expect(paginator.config.initialCursor).toStrictEqual(
        paginatorOptions.initialCursor,
      );
      expect(paginator.config.initialOffset).toStrictEqual(
        paginatorOptions.initialOffset,
      );
      expect(paginator.config.pageSize).toStrictEqual(paginatorOptions.pageSize);
      expect(paginator.config.lockItemOrder).toStrictEqual(
        paginatorOptions.lockItemOrder,
      );
      expect(paginator.config.throwErrors).toStrictEqual(paginatorOptions.throwErrors);
    });
  });

  describe('sortComparator', () => {
    const changeOrder = 1;
    const keepOrder = -1;
    it('should sort be default sort', () => {
      const paginator = new ChannelPaginator({ client });
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);

      setLastMessageAt(channel1, new Date('1970-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';

      setLastMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';

      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });

    it('should sort by non-existent attribute', () => {
      const paginator = new ChannelPaginator({ client, sort: { created_at: 1 } });
      expect(paginator.sortComparator(channel1, channel2)).toBe(0);
    });

    it('should sort by attribute with the same values', () => {
      const paginator = new ChannelPaginator({ client, sort: { created_at: 1 } });
      channel1.data!.created_at = '1971-01-01T08:39:35.235Z';
      channel2.data!.created_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(0);
    });

    it('should sort by created_at', () => {
      const paginator = new ChannelPaginator({ client, sort: { created_at: 1 } });
      channel1.data!.created_at = '1972-01-01T08:39:35.235Z';
      channel2.data!.created_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by has_unread', () => {
      const paginator = new ChannelPaginator({ client, sort: { has_unread: 1 } });
      channel1.state.read[user.id] = {
        last_read: new Date('1972-01-01T08:39:35.235Z'),
        unread_messages: 10,
        user,
      };
      channel2.state.read[user.id] = {
        last_read: new Date('1972-01-01T08:39:35.235Z'),
        unread_messages: 0,
        user,
      };
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by last_message_at', () => {
      const paginator = new ChannelPaginator({ client, sort: { last_message_at: 1 } });
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by last_updated', () => {
      const paginator = new ChannelPaginator({ client, sort: { last_updated: 1 } });

      // compares channel1.state.last_message_at with channel2.data!.updated_at
      setLastMessageAt(channel1, new Date('1975-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';
      setLastMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = '1973-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      // compares channel2.state.last_message_at with channel1.data!.updated_at
      setLastMessageAt(channel1, new Date('1975-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = '1976-01-01T08:39:35.235Z';
      setLastMessageAt(channel2, new Date('1978-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = '1973-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by member_count', () => {
      const paginator = new ChannelPaginator({ client, sort: { member_count: 1 } });
      channel1.data!.member_count = 2;
      channel2.data!.member_count = 1;
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by pinned_at', () => {
      const paginator = new ChannelPaginator({ client, sort: { pinned_at: 1 } });
      channel1.state.membership = { pinned_at: '1972-01-01T08:39:35.235Z' };
      channel2.state.membership = { pinned_at: '1971-01-01T08:39:35.235Z' };
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.state.membership = { pinned_at: '1970-01-01T08:39:35.235Z' };
      channel2.state.membership = { pinned_at: '1971-01-01T08:39:35.235Z' };
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by unread_count', () => {
      const paginator = new ChannelPaginator({ client, sort: { unread_count: 1 } });
      channel1.state.read[user.id] = {
        last_read: new Date(),
        unread_messages: 10,
        user,
      };
      channel2.state.read[user.id] = {
        last_read: new Date(),
        unread_messages: 0,
        user,
      };
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.state.read[user.id] = {
        last_read: new Date(),
        unread_messages: 10,
        user,
      };
      channel2.state.read[user.id] = {
        last_read: new Date(),
        unread_messages: 11,
        user,
      };
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by updated_at', () => {
      const paginator = new ChannelPaginator({ client, sort: { updated_at: 1 } });

      channel1.data!.updated_at = '1972-01-01T08:39:35.235Z';
      channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';
      channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by custom field', () => {
      // @ts-expect-error using field not declared among CustomChannelData
      const paginator = new ChannelPaginator({ client, sort: { customField: 1 } });

      // @ts-expect-error using field not declared among CustomChannelData
      channel1.data!.customField = 'B';
      // @ts-expect-error using field not declared among CustomChannelData
      channel2.data!.customField = 'A';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      // @ts-expect-error using field not declared among CustomChannelData
      channel1.data!.customField = 'A';
      // @ts-expect-error using field not declared among CustomChannelData
      channel2.data!.customField = 'B';
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
  });

  describe('filter resolvers', () => {
    const otherUserId = 'other-user';
    it('resolves field "archived"', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { members: { $in: [user.id] }, archived: true },
      });

      channel1.state.members = {
        [user.id]: { user },
        [otherUserId]: { user: { id: otherUserId } },
      };

      channel1.state.membership = {
        user,
        archived_at: '2025-09-03T12:19:39.101089Z',
      };
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.state.membership = {
        user,
        archived_at: undefined,
      };
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('resolves field "app_banned"', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { members: { $in: [user.id] }, app_banned: 'only' },
      });

      channel1.state.members = {
        [user.id]: { user },
        [otherUserId]: { user: { id: otherUserId, banned: true } },
      };

      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.state.members[otherUserId].user!.banned = false;
      expect(paginator.matchesFilter(channel1)).toBeFalsy();

      // ===== excluded ====
      paginator.staticFilters = { members: { $in: [user.id] }, app_banned: 'excluded' };

      channel1.state.members[otherUserId].user!.banned = true;
      expect(paginator.matchesFilter(channel1)).toBeFalsy();

      channel1.state.members[otherUserId].user!.banned = false;
      expect(paginator.matchesFilter(channel1)).toBeTruthy();
    });

    it('resolves field "has_unread"', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { has_unread: true },
      });

      channel1.state.read = {
        [user.id]: { last_read: new Date(2000), unread_messages: 0, user },
        [otherUserId]: {
          last_read: new Date(1000),
          unread_messages: 1,
          user: { id: otherUserId },
        },
      };

      expect(paginator.matchesFilter(channel1)).toBeFalsy();

      channel1.state.read[user.id].unread_messages = 1;
      expect(paginator.matchesFilter(channel1)).toBeTruthy();
    });

    describe('resolves field "last_updated"', () => {
      it('for primitive filter', () => {
        const paginator = new ChannelPaginator({
          client,
          filters: { last_updated: new Date(1000).toISOString() },
        });
        channel1.data = { updated_at: undefined };
        setLastMessageAt(channel1, new Date(1000));

        expect(paginator.matchesFilter(channel1)).toBeTruthy();

        channel1.data = { updated_at: new Date(1000).toISOString() };
        setLastMessageAt(channel1, null);

        expect(paginator.matchesFilter(channel1)).toBeTruthy();

        channel1.data = { updated_at: undefined };
        setLastMessageAt(channel1, null);
        expect(paginator.matchesFilter(channel1)).toBeFalsy();
      });

      it.each([
        [
          '$eq',
          [
            { val: 1000, expected: true },
            { val: 1001, expected: false },
            { val: 999, expected: false },
          ],
        ],
        [
          '$gt',
          [
            { val: 1000, expected: false },
            { val: 1001, expected: true },
            { val: 999, expected: false },
          ],
        ],
        [
          '$gte',
          [
            { val: 1000, expected: true },
            { val: 1001, expected: true },
            { val: 999, expected: false },
          ],
        ],
        [
          '$lt',
          [
            { val: 1000, expected: false },
            { val: 1001, expected: false },
            { val: 999, expected: true },
          ],
        ],
        [
          '$lte',
          [
            { val: 1000, expected: true },
            { val: 1001, expected: false },
            { val: 999, expected: true },
          ],
        ],
      ])('for operator %s', (operator, scenarios) => {
        const paginator = new ChannelPaginator({
          client,
          // @ts-expect-error operator in variable
          filters: { last_updated: { [operator]: new Date(1000).toISOString() } },
        });

        channel1.data = { updated_at: undefined };
        scenarios.forEach(({ val, expected }) => {
          setLastMessageAt(channel1, new Date(val));
          expect(paginator.matchesFilter(channel1)).toBe(expected);
        });

        setLastMessageAt(channel1, null);
        scenarios.forEach(({ val, expected }) => {
          channel1.data = { updated_at: new Date(val).toISOString() };
          expect(paginator.matchesFilter(channel1)).toBe(expected);
        });

        channel1.data = { updated_at: undefined };
        setLastMessageAt(channel1, null);
        expect(paginator.matchesFilter(channel1)).toBe(false);
      });
    });

    it('resolves "pinned" field', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { members: { $in: [user.id] }, pinned: true },
      });

      channel1.state.members = {
        [user.id]: { user },
        ['other-member']: { user: { id: 'other-member' } },
      };

      channel1.state.membership = {
        user,
        pinned_at: '2025-09-03T12:19:39.101089Z',
      };
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.state.membership = {
        user,
        pinned_at: undefined,
      };
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('resolves "muted" field from client mute state', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { members: { $in: [user.id] }, muted: true },
      });

      channel1.state.members = {
        [user.id]: { user },
        ['other-member']: { user: { id: 'other-member' } },
      };

      // Mute state lives on the client, not on the channel data.
      client.mutedChannels = [{ channel: { cid: channel1.cid } } as never];
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      client.mutedChannels = [];
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('excludes muted channels when filtering "muted: false"', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { members: { $in: [user.id] }, muted: false },
      });

      channel1.state.members = { [user.id]: { user } };

      client.mutedChannels = [];
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      client.mutedChannels = [{ channel: { cid: channel1.cid } } as never];
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('resolves "members" field', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { members: { $in: [user.id] } },
      });
      channel1.state.members = {
        [user.id]: { user },
        ['other-member']: { user: { id: 'other-member' } },
      };
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.state.members = {
        ['other-member']: { user: { id: 'other-member' } },
      };
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('resolves "member.user.name" field', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { 'member.user.name': { $autocomplete: '-' } },
      });
      channel1.state.members = {
        [user.id]: { user: { ...user, name: 'name' } },
        ['other-member']: { user: { id: 'other-member', name: 'na-me' } },
      };
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.state.members = {
        [user.id]: { user: { ...user, name: 'name' } },
      };
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('resolves ChannelResponse fields', () => {
      const paginator = new ChannelPaginator({ client, filters: { blocked: true } });
      channel1.data!.blocked = true;
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.data!.blocked = false;
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('resolves custom fields stored in channel.data', () => {
      const paginator = new ChannelPaginator({
        client,
        // @ts-expect-error declaring custom property field in filter
        filters: { x: { $contains: 'specific' } },
      });
      // @ts-expect-error using undeclared custom property
      channel1.data!.x = ['a', 'b', 'specific'];
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      // @ts-expect-error using undeclared custom property
      channel1.data!.x = undefined;
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('overrides filter resolvers', () => {
      const resolver: FieldToDataResolver<Channel> = {
        matchesField: (field) => field === 'custom.nested',
        resolve: (item, field) => {
          // @ts-expect-error accessing undeclared custom property
          return item.data!.custom?.nested;
        },
      };

      const paginator = new ChannelPaginator({
        client,
        // @ts-expect-error using undeclared custom property
        filters: { 'custom.nested': { $eq: 'x' } },
      });
      paginator.setFilterResolvers([resolver]);

      // @ts-expect-error using undeclared custom property
      channel1.data!.custom = { nested: 'x' };
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      // @ts-expect-error using undeclared custom property
      channel1.data!.custom = { nested: 'y' };
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });
  });

  describe('setters', () => {
    // Seed via the real ingestion path (distinct cids — interval storage dedupes by cid) and capture
    // the resulting state. These setters must not re-emit / reset it, so the state reference should
    // be identical afterwards.
    const seed = (paginator: ChannelPaginator) => {
      const a = new Channel(client, 'type', 'setter-a', {});
      const b = new Channel(client, 'type', 'setter-b', {});
      paginator.setItems({
        valueOrFactory: [a, b],
        isFirstPage: true,
        isLastPage: true,
      });
      return paginator.state.getLatestValue();
    };

    it('filters reset does not reset the paginator state', () => {
      const paginator = new ChannelPaginator({ client });
      const before = seed(paginator);
      paginator.staticFilters = {};
      expect(paginator.state.getLatestValue()).toBe(before);
      expect(paginator.staticFilters).toStrictEqual({});
    });

    it('sort reset does not reset the paginator state updates the comparator', () => {
      const paginator = new ChannelPaginator({ client });
      const before = seed(paginator);
      const originalComparator = paginator.sortComparator;
      paginator.sort = {};
      expect(paginator.state.getLatestValue()).toBe(before);
      expect(paginator.sort).toStrictEqual({});
      expect(paginator.sortComparator).not.toEqual(originalComparator);
    });

    it('options reset does not reset the paginator state', () => {
      const paginator = new ChannelPaginator({ client });
      const before = seed(paginator);
      paginator.options = {};
      expect(paginator.state.getLatestValue()).toBe(before);
      expect(paginator.options).toStrictEqual({});
    });

    it('channelStateOptions reset does not reset the paginator state', () => {
      const paginator = new ChannelPaginator({ client });
      const before = seed(paginator);
      paginator.channelStateOptions = {};
      expect(paginator.state.getLatestValue()).toBe(before);
      expect(paginator.channelStateOptions).toStrictEqual({});
    });
  });

  describe('setItems', () => {
    it('stores the new items in the offlineDB', async () => {
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      (client.offlineDb!.initializeDB as unknown as MockInstance).mockReturnValue(true);
      await client.offlineDb!.init(client.userID as string);
      (
        client.offlineDb?.upsertCidsForQuery as unknown as MockInstance
      ).mockImplementation(() => Promise.resolve(true));

      const filters = { id: 'abc' };
      const sort = { id: 1 };
      const items1 = [channel1];

      const paginator = new ChannelPaginator({ client });
      paginator.staticFilters = filters;
      paginator.sort = sort;

      paginator.setItems({ valueOrFactory: items1 });
      expect(paginator.items).toStrictEqual(items1);
      expect(
        client.offlineDb?.upsertCidsForQuery as unknown as MockInstance,
      ).toHaveBeenCalledWith({
        cids: [channel1.cid],
        filters,
        sort,
      });
    });
  });

  describe('query', () => {
    it('is called with correct parameters', async () => {
      const queryChannelsSpy = vi.spyOn(client, 'queryChannels').mockResolvedValue([]);
      const filters: ChannelFilters = { name: 'A' };
      const sort: ChannelSort = { has_unread: -1 };
      const requestOptions: ChannelOptions = { message_limit: 3 };
      const paginator = new ChannelPaginator({
        client,
        filters,
        sort,
        requestOptions,
        filterBuilderOptions: {
          initialFilterConfig: {
            custom: {
              enabled: true,
              generate: (context: { num?: number }) => ({
                muted: { $eq: !!context.num },
              }),
            },
          },
          initialContext: { num: 5 },
        },
        paginatorOptions: { pageSize: 22 },
      });

      await paginator.query();
      expect(queryChannelsSpy).toHaveBeenCalledWith(
        {
          muted: {
            $eq: true,
          },
          name: 'A',
        },
        {
          has_unread: -1,
        },
        {
          limit: 22,
          message_limit: 3,
          offset: 0,
        },
        undefined, // channelStateOptions
      );
    });
  });

  describe('interval storage', () => {
    it('is index-addressable by cid, populates latestItems, and dedupes across pages', async () => {
      const a = new Channel(client, 'type', 'iv-a', {});
      const b = new Channel(client, 'type', 'iv-b', {});
      let page: Channel[] = [a, b];
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: {
          doRequest: () => Promise.resolve({ items: page }),
          pageSize: 2,
        },
      });

      await paginator.executeQuery({});

      // resolvable by cid + mirrored into the head window (interval storage)
      expect(paginator.getItem('type:iv-a')).toBe(a);
      expect(paginator.getItem('type:iv-b')).toBe(b);
      expect(paginator.latestItems.map((c) => c.cid).sort()).toEqual([
        'type:iv-a',
        'type:iv-b',
      ]);

      // next offset page returns an already-loaded channel — dedup keeps a single entry
      page = [a];
      await paginator.toTail();
      const cids = (paginator.items ?? []).map((c) => c.cid);
      expect(cids.filter((cid) => cid === 'type:iv-a')).toHaveLength(1);
    });

    it('keeps the head (newest) at index 0 and the tail (oldest) at the end', async () => {
      // Contrary to the message list, the channel list is head-first: the newest (head) item sits at
      // the top (index 0) and the oldest (tail) at the bottom.
      const newest = new Channel(client, 'type', 'newest', {});
      const middle = new Channel(client, 'type', 'middle', {});
      const oldest = new Channel(client, 'type', 'oldest', {});
      setLastMessageAt(newest, new Date('2020-03-01T00:00:00.000Z'));
      setLastMessageAt(middle, new Date('2020-02-01T00:00:00.000Z'));
      setLastMessageAt(oldest, new Date('2020-01-01T00:00:00.000Z'));

      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: {
          // server returns them out of order; interval storage sorts by the default (desc) comparator
          doRequest: () => Promise.resolve({ items: [middle, oldest, newest] }),
          pageSize: 10,
        },
      });

      await paginator.executeQuery({});

      expect(paginator.items?.map((c) => c.cid)).toEqual([
        'type:newest',
        'type:middle',
        'type:oldest',
      ]);
      // head edge = index 0 = newest; head window starts with it too
      expect(paginator.latestItem?.cid).toBe('type:newest');
      expect(paginator.latestItems[0]?.cid).toBe('type:newest');
    });

    it('promotes a non-headmost channel to the top on re-ingest without dropping it', async () => {
      // Reproduces the reorder-on-new-message bug: a channel below the head gets a newer
      // last_message_at and is re-ingested (as the orchestrator does on message.new). It must move to
      // the top and stay visible — not escape into the logical-head interval and disappear.
      const a = new Channel(client, 'type', 'a', {});
      const b = new Channel(client, 'type', 'b', {});
      const c = new Channel(client, 'type', 'c', {});
      setLastMessageAt(a, new Date('2020-03-01T00:00:00.000Z'));
      setLastMessageAt(b, new Date('2020-02-01T00:00:00.000Z'));
      setLastMessageAt(c, new Date('2020-01-01T00:00:00.000Z')); // oldest / non-headmost

      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: {
          doRequest: () => Promise.resolve({ items: [a, b, c] }),
          pageSize: 10,
        },
      });
      await paginator.executeQuery({});
      expect(paginator.items?.map((ch) => ch.cid)).toEqual([
        'type:a',
        'type:b',
        'type:c',
      ]);

      // c receives a new message → newest; re-ingest to reposition (mirrors updateLists)
      setLastMessageAt(c, new Date('2020-04-01T00:00:00.000Z'));
      paginator.ingestItem(c);

      const cids = paginator.items?.map((ch) => ch.cid);
      expect(cids).toContain('type:c'); // not dropped
      expect(cids?.[0]).toBe('type:c'); // moved to the head (top)
      expect(cids).toHaveLength(3); // no duplicates, nothing lost
    });
  });
});
