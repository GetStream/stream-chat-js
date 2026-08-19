import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import {
  Channel,
  type ChannelFilters,
  ChannelOptions,
  ChannelPaginator,
  SortParamRequest,
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
import * as utils from '../../../../src/utils';
import {
  DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES,
  DEFAULT_QUERY_CHANNELS_RETRY_COUNT,
} from '../../../../src/constants';

const user = { id: 'custom-id' };

// `channel.state.last_message_at` is derived (read-only) from the message paginator's tracked latest
// message. To stage a specific value for sort tests, seed the paginator: clear first so any value
// (including an earlier one) applies, since tracking is monotonic.
const setLastMessageAt = (channel: Channel, date: Date | null) => {
  channel.messagePaginator.clearStateAndCache();
  if (date) {
    channel.messagePaginator.trackLastMessage(
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
      expect(paginator._filterFieldToDataResolvers).toHaveLength(10);
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
        sort: [{ field: 'created_at', direction: 1 }],
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
      expect(paginator._filterFieldToDataResolvers).toHaveLength(10);
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
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'created_at', direction: 1 }],
      });
      expect(paginator.sortComparator(channel1, channel2)).toBe(0);
    });

    it('should sort by attribute with the same values', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'created_at', direction: 1 }],
      });
      channel1.data!.created_at = '1971-01-01T08:39:35.235Z';
      channel2.data!.created_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(0);
    });

    it('should sort by created_at', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'created_at', direction: 1 }],
      });
      channel1.data!.created_at = '1972-01-01T08:39:35.235Z';
      channel2.data!.created_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by has_unread', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'has_unread', direction: 1 }],
      });
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
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'last_message_at', direction: 1 }],
      });
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by last_updated', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'last_updated', direction: 1 }],
      });

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
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'member_count', direction: 1 }],
      });
      channel1.data!.member_count = 2;
      channel2.data!.member_count = 1;
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);
    });
    it('should sort by pinned_at', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'pinned_at', direction: 1 }],
      });
      channel1.state.membership = { pinned_at: '1972-01-01T08:39:35.235Z' };
      channel2.state.membership = { pinned_at: '1971-01-01T08:39:35.235Z' };
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.state.membership = { pinned_at: '1970-01-01T08:39:35.235Z' };
      channel2.state.membership = { pinned_at: '1971-01-01T08:39:35.235Z' };
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by unread_count', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'unread_count', direction: 1 }],
      });
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
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'updated_at', direction: 1 }],
      });

      channel1.data!.updated_at = '1972-01-01T08:39:35.235Z';
      channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';
      channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by custom field', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'customField', direction: 1 }],
      });

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

    it('resolves field "hidden"', () => {
      const paginator = new ChannelPaginator({ client, filters: { hidden: false } });
      const hiddenChannelsPaginator = new ChannelPaginator({
        client,
        filters: { hidden: true },
      });

      // `hidden` is optional on ChannelResponse — undefined when the response omits it
      expect(channel1.data!.hidden).toBeUndefined();
      expect(paginator.matchesFilter(channel1)).toBeTruthy();
      expect(hiddenChannelsPaginator.matchesFilter(channel1)).toBeFalsy();

      channel1.data!.hidden = true;

      expect(paginator.matchesFilter(channel1)).toBeFalsy();
      expect(hiddenChannelsPaginator.matchesFilter(channel1)).toBeTruthy();
    });

    it('excludes hidden channels by default, as the backend query does', () => {
      const paginator = new ChannelPaginator({ client, filters: { muted: false } });

      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      channel1.data!.hidden = true;

      expect(paginator.matchesFilter(channel1)).toBeFalsy();
      // the default is a local matching rule, not a filter: the server already excludes hidden
      // channels, so the request must stay untouched
      expect(paginator.buildQueryFilters()).toEqual({ muted: false });
    });

    it('keeps the hidden-by-default rule out of the way of replaced filter resolvers', () => {
      const paginator = new ChannelPaginator({ client, filters: { muted: false } });
      paginator.setFilterResolvers([
        { matchesField: (field) => field === 'muted', resolve: () => false },
      ]);

      expect(paginator.matchesFilter(channel1)).toBeTruthy();
    });

    it('does not apply the hidden default when the filter constrains "hidden"', () => {
      const paginator = new ChannelPaginator({ client, filters: { hidden: true } });

      channel1.data!.hidden = true;

      expect(paginator.matchesFilter(channel1)).toBeTruthy();
    });

    it('detects a "hidden" constraint nested in a logical operator', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { $or: [{ hidden: true }, { muted: true }] },
      });

      channel1.data!.hidden = true;

      expect(paginator.matchesFilter(channel1)).toBeTruthy();
    });

    it('applies the hidden default when "hidden" only appears as an unrelated field path', () => {
      const paginator = new ChannelPaginator({
        client,
        // @ts-expect-error using undeclared custom property
        filters: { 'custom.hidden': { $eq: true } },
      });

      // @ts-expect-error using undeclared custom property
      channel1.data!.custom = { hidden: true };
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      // `custom.hidden` is a different field, so it does not opt out of excluding hidden channels
      channel1.data!.hidden = true;
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
      paginator.sort = [];
      expect(paginator.state.getLatestValue()).toBe(before);
      expect(paginator.sort).toStrictEqual([]);
      expect(paginator.sortComparator).not.toEqual(originalComparator);
    });

    it('keeps consulting sortComparatorFactory on every comparator rebuild', async () => {
      // orders by cid descending, ignoring the sort entirely
      const factory = vi.fn(() => (a: Channel, b: Channel) => b.cid.localeCompare(a.cid));
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'last_message_at', direction: 1 }],
        sortComparatorFactory: factory,
      });
      const channelA = new Channel(client, 'type', 'aaa', {});
      const channelZ = new Channel(client, 'type', 'zzz', {});

      expect(paginator.sortComparator(channelA, channelZ)).toBeGreaterThan(0);
      expect(factory).toHaveBeenCalledTimes(1);

      // a sort change must not discard the custom ordering
      paginator.sort = [{ field: 'last_message_at', direction: -1 }];
      expect(factory).toHaveBeenCalledTimes(2);
      expect(paginator.sortComparator(channelA, channelZ)).toBeGreaterThan(0);

      // neither may a backend-resolved sort template
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [],
        duration: '0.1ms',
        predefined_filter: {
          name: 'x',
          filter: {},
          sort: [{ field: 'last_message_at', direction: -1 }],
        },
      });
      await paginator.toTail();

      expect(factory).toHaveBeenCalledTimes(3);
      expect(paginator.sortComparator(channelA, channelZ)).toBeGreaterThan(0);
    });

    it('passes the default comparator to sortComparatorFactory so it can delegate', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'last_message_at', direction: 1 }],
        // a factory that only delegates must preserve the built-in channel ordering
        sortComparatorFactory:
          ({ defaultComparator }) =>
          (a, b) =>
            defaultComparator(a, b),
      });

      // ascending: the older channel2 precedes channel1
      expect(paginator.sortComparator(channel1, channel2)).toBeGreaterThan(0);
    });

    it('adopts a sortComparatorFactory assigned after construction', () => {
      const paginator = new ChannelPaginator({ client });

      paginator.sortComparatorFactory = () => (a, b) => b.cid.localeCompare(a.cid);
      const channelA = new Channel(client, 'type', 'aaa', {});
      const channelZ = new Channel(client, 'type', 'zzz', {});

      expect(paginator.sortComparator(channelA, channelZ)).toBeGreaterThan(0);

      paginator.sortComparatorFactory = undefined;

      expect(paginator.sortComparator(channelA, channelZ)).toBeLessThan(0);
    });

    it('rebuilt comparator keeps resolving channel-specific sort paths', () => {
      const paginator = new ChannelPaginator({ client, sort: [{ name: 1 }] });

      paginator.sort = [{ field: 'last_message_at', direction: 1 }];

      // `last_message_at` lives on the message paginator, not on channel.data, so a comparator built
      // without the channel path resolver would read undefined for both and report a tie
      expect(paginator.sortComparator(channel1, channel2)).toBeGreaterThan(0);
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
      const sort: SortParamRequest[] = [{ field: 'id', direction: 1 }];
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
        options: expect.objectContaining({ filter_conditions: filters, sort }),
        sort,
      });
    });
  });

  describe('retries', () => {
    it('retries a failing channel query DEFAULT_QUERY_CHANNELS_RETRY_COUNT times by default', async () => {
      const paginator = new ChannelPaginator({ client });
      expect(paginator.config.retryCount).toBe(DEFAULT_QUERY_CHANNELS_RETRY_COUNT);

      const sleepSpy = vi.spyOn(utils, 'sleep').mockResolvedValue(undefined);
      const queryChannels = vi
        .spyOn(client, 'queryChannelsAndHydrate')
        .mockRejectedValue(new Error('fail'));

      await paginator.toTail();

      // initial attempt + however many retries are configured (matches the legacy ChannelManager)
      expect(queryChannels).toHaveBeenCalledTimes(DEFAULT_QUERY_CHANNELS_RETRY_COUNT + 1);
      expect(
        sleepSpy.mock.calls.filter(
          ([ms]) => ms === DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES,
        ),
      ).toHaveLength(DEFAULT_QUERY_CHANNELS_RETRY_COUNT);
      expect(paginator.lastQueryError).toEqual(new Error('fail'));
    });

    it('stops retrying once a query succeeds', async () => {
      vi.spyOn(utils, 'sleep').mockResolvedValue(undefined);
      const channelA = new Channel(client, 'type', 'retry-a', {});
      const queryChannels = vi
        .spyOn(client, 'queryChannelsAndHydrate')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue({ channels: [channelA], duration: '0.1ms' });

      const paginator = new ChannelPaginator({ client });
      await paginator.toTail();

      expect(queryChannels).toHaveBeenCalledTimes(2);
      expect(paginator.lastQueryError).toBeUndefined();
      expect(paginator.items).toStrictEqual([channelA]);
    });

    it('accepts an explicit retryCount through paginatorOptions', async () => {
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { retryCount: 0 },
      });
      vi.spyOn(utils, 'sleep').mockResolvedValue(undefined);
      const queryChannels = vi
        .spyOn(client, 'queryChannelsAndHydrate')
        .mockRejectedValue(new Error('fail'));

      await paginator.toTail();

      expect(queryChannels).toHaveBeenCalledTimes(1);
    });
  });

  describe('offline support', () => {
    const requestOptions: ChannelOptions = {
      predefined_filter: 'user_messaging',
      filter_values: { user_id: 'dan' },
      sort_values: { sort_field: 'last_message_at' },
    };
    let offlineDb: MockOfflineDB;
    let upsertCidsForQuery: MockInstance;
    let getChannelsForQuery: MockInstance;
    let scheduleSyncStatusChangeCallback: MockInstance;

    const setUpOfflineDb = async ({ syncStatus }: { syncStatus: boolean }) => {
      offlineDb = new MockOfflineDB({ client });
      client.setOfflineDBApi(offlineDb);
      (client.offlineDb!.initializeDB as unknown as MockInstance).mockReturnValue(true);
      await client.offlineDb!.init(client.userID as string);
      client.offlineDb!.syncManager.syncStatus = syncStatus;
      upsertCidsForQuery = client.offlineDb!
        .upsertCidsForQuery as unknown as MockInstance;
      upsertCidsForQuery.mockImplementation(() => Promise.resolve(true));
      getChannelsForQuery = client.offlineDb!
        .getChannelsForQuery as unknown as MockInstance;
      getChannelsForQuery.mockResolvedValue(null);
      scheduleSyncStatusChangeCallback = vi.spyOn(
        client.offlineDb!.syncManager,
        'scheduleSyncStatusChangeCallback',
      );
    };

    const makePaginator = ({
      filters = { type: 'type' } as ChannelFilters | undefined,
    } = {}) =>
      new ChannelPaginator({
        client,
        filters,
        requestOptions,
        sort: [{ field: 'last_message_at', direction: -1 }],
      });

    it('reads the cache with the full query request, including predefined-filter options', async () => {
      await setUpOfflineDb({ syncStatus: true });
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [],
        duration: '0.1ms',
      });
      const paginator = makePaginator();

      await paginator.toTail();

      expect(getChannelsForQuery).toHaveBeenCalledWith({
        userId: client.userID,
        options: expect.objectContaining({
          filter_conditions: { type: 'type' },
          sort: [{ field: 'last_message_at', direction: -1 }],
          ...requestOptions,
        }),
      });
    });

    it('persists cids under the full query request after a query', async () => {
      await setUpOfflineDb({ syncStatus: true });
      const channelA = new Channel(client, 'type', 'offline-a', {});
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [channelA],
        duration: '0.1ms',
      });
      const paginator = makePaginator();

      await paginator.toTail();

      expect(upsertCidsForQuery).toHaveBeenCalledWith({
        cids: [channelA.cid],
        filters: { type: 'type' },
        options: expect.objectContaining(requestOptions),
        sort: [{ field: 'last_message_at', direction: -1 }],
      });
    });

    it('persists the new cid order after a live ingest and after a removal', async () => {
      await setUpOfflineDb({ syncStatus: true });
      const channelA = new Channel(client, 'type', 'offline-a', {});
      setLastMessageAt(channelA, new Date('1971-01-01T00:00:00.000Z'));
      const channelB = new Channel(client, 'type', 'offline-b', {});
      setLastMessageAt(channelB, new Date('1970-01-01T00:00:00.000Z'));
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [channelA, channelB],
        duration: '0.1ms',
      });
      // no filters: these bare channels carry no `data.type`, and a live ingest of an item the filter
      // rejects would (correctly) remove it instead of reordering
      const paginator = makePaginator({ filters: {} });
      await paginator.toTail();
      upsertCidsForQuery.mockClear();

      // channelB receives a newer message and moves to the top - a reorder with no query performed.
      // Mirrors what the manager's `updateLists` does: boost, then ingest. The boost is what moves the
      // channel — `ingestItem` alone cannot, because the mutated `Channel` is the same object the
      // paginator already holds, so it has no previous sort key to relocate from.
      setLastMessageAt(channelB, new Date('1972-01-01T00:00:00.000Z'));
      paginator.boost(channelB.cid, { seq: paginator.maxBoostSeq + 1 });
      paginator.ingestItem(channelB);

      expect(upsertCidsForQuery).toHaveBeenCalledWith(
        expect.objectContaining({ cids: [channelB.cid, channelA.cid] }),
      );

      upsertCidsForQuery.mockClear();
      paginator.removeItem({ item: channelA });

      expect(upsertCidsForQuery).toHaveBeenCalledWith(
        expect.objectContaining({ cids: [channelB.cid] }),
      );
    });

    it('does not persist when a removal changed nothing', async () => {
      await setUpOfflineDb({ syncStatus: true });
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [],
        duration: '0.1ms',
      });
      const paginator = makePaginator();
      await paginator.toTail();
      upsertCidsForQuery.mockClear();

      paginator.removeItem({ item: new Channel(client, 'type', 'not-in-list', {}) });

      expect(upsertCidsForQuery).not.toHaveBeenCalled();
    });

    // ported from the legacy suite ("continues with normal queryChannels flow if client.user is missing")
    it('queries normally without touching the cache when there is no user', async () => {
      await setUpOfflineDb({ syncStatus: false });
      client.user = undefined;
      const queryChannels = vi
        .spyOn(client, 'queryChannelsAndHydrate')
        .mockResolvedValue({ channels: [], duration: '0.1ms' });
      const paginator = makePaginator();

      await paginator.toTail();

      // no user id means no cache key, so neither the read nor the sync deferral applies
      expect(getChannelsForQuery).not.toHaveBeenCalled();
      expect(scheduleSyncStatusChangeCallback).not.toHaveBeenCalled();
      expect(queryChannels).toHaveBeenCalledTimes(1);
    });

    describe('while the offline sync is in progress', () => {
      it('surfaces the cached page and defers the query until the sync completes', async () => {
        await setUpOfflineDb({ syncStatus: false });
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        getChannelsForQuery.mockResolvedValue([{ channel: cachedChannel.data }]);
        vi.spyOn(client, 'hydrateActiveChannels').mockReturnValue([cachedChannel]);
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({ channels: [], duration: '0.1ms' });
        const paginator = makePaginator();

        await paginator.toTail();

        expect(paginator.items).toStrictEqual([cachedChannel]);
        expect(queryChannels).not.toHaveBeenCalled();
        expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(1);
        expect(scheduleSyncStatusChangeCallback.mock.calls[0][0]).toBe(paginator.id);

        // the scheduled callback runs the deferred query once the sync manager reports completion
        client.offlineDb!.syncManager.syncStatus = true;
        await scheduleSyncStatusChangeCallback.mock.calls[0][1]();

        expect(queryChannels).toHaveBeenCalledTimes(1);
      });

      it('runs the watching query directly when the sync completes during the preload', async () => {
        // This test basically confirms a very intermittent regression that would cause the sync status
        // to be changed to true way before the preload/initial population finishes. In that instance,
        // we would drop all of the listeners and so the actual query would not fire.
        await setUpOfflineDb({ syncStatus: false });
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        // getChannelsForQuery IS the awaited preload: flipping syncStatus here mimics the sync landing
        // mid-await (and the sync manager having already drained + cleared its callback map).
        getChannelsForQuery.mockImplementation(async () => {
          client.offlineDb!.syncManager.syncStatus = true;
          return [{ channel: cachedChannel.data }];
        });
        vi.spyOn(client, 'hydrateActiveChannels').mockReturnValue([cachedChannel]);
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({ channels: [cachedChannel], duration: '0.1ms' });
        const paginator = makePaginator();

        await paginator.toTail();

        // The watching query ran in THIS call; nothing was left dangling on the already-cleared map.
        expect(queryChannels).toHaveBeenCalledTimes(1);
        expect(scheduleSyncStatusChangeCallback).not.toHaveBeenCalled();
        // And the preloaded list was not blanked (non-destructive refresh).
        expect(paginator.items).toStrictEqual([cachedChannel]);
      });

      it('runs the query directly even when the cache is empty and the sync lands during the preload', async () => {
        // Same race, but nothing is cached: the preload returns nothing yet the sync still completes
        // mid-await. We must not strand a callback — run the query directly so the (watched) list still lands.
        await setUpOfflineDb({ syncStatus: false });
        const fresh = new Channel(client, 'type', 'fresh', {});
        getChannelsForQuery.mockImplementation(async () => {
          client.offlineDb!.syncManager.syncStatus = true;
          return null;
        });
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({ channels: [fresh], duration: '0.1ms' });
        const paginator = makePaginator({ filters: {} });

        await paginator.toTail();

        expect(queryChannels).toHaveBeenCalledTimes(1);
        expect(scheduleSyncStatusChangeCallback).not.toHaveBeenCalled();
        expect(paginator.items).toStrictEqual([fresh]);
      });

      it('does not blank the list on the post-sync re-run when the offline cache was invalidated', async () => {
        // Regression: the deferred post-sync re-run must be a NON-DESTRUCTIVE refresh (keepPreviousItems).
        // Otherwise it re-preloads from the offline DB; if the sync invalidated the query cache (i.e. a
        // channel changed while the app was closed), that re-preload returns nothing and the list blanks
        // to a second skeleton before the fresh page lands.
        await setUpOfflineDb({ syncStatus: false });
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        getChannelsForQuery.mockResolvedValue([{ channel: cachedChannel.data }]);
        vi.spyOn(client, 'hydrateActiveChannels').mockReturnValue([cachedChannel]);
        vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
          channels: [cachedChannel],
          duration: '0.1ms',
        });
        const paginator = makePaginator();

        await paginator.toTail(); // cold start: surface the cached page, defer the query
        expect(paginator.items).toStrictEqual([cachedChannel]);

        // The sync invalidates the offline query cache before the deferred re-run fires.
        getChannelsForQuery.mockResolvedValue(null);
        client.offlineDb!.syncManager.syncStatus = true;

        // Watch for ANY transient blank (items === undefined) while the deferred re-run executes.
        let blanked = false;
        const unsubscribe = paginator.state.subscribe((next) => {
          if (next.items === undefined) blanked = true;
        });
        await scheduleSyncStatusChangeCallback.mock.calls[0][1]();
        unsubscribe();

        expect(blanked).toBe(false);
        expect(paginator.items).toStrictEqual([cachedChannel]);
      });

      it('seeds the preloaded channels into the index so a concurrent ingest does not collapse the list', async () => {
        // The cold start preload must SEED the paginator (populate the interval/index), not
        // just set the displayed `items`. Otherwise a channel ingested concurrently during the presync
        // window (i.e a message.new from the offline-send replay in executePendingTasks) rebuilds the
        // list from an empty index and collapses it to just that one channel.
        await setUpOfflineDb({ syncStatus: false });
        const a = new Channel(client, 'type', 'a', {});
        const b = new Channel(client, 'type', 'b', {});
        const c = new Channel(client, 'type', 'c', {});
        getChannelsForQuery.mockResolvedValue([{}, {}, {}]);
        vi.spyOn(client, 'hydrateActiveChannels').mockReturnValue([a, b, c]);
        vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
          channels: [a, b, c],
          duration: '0.1ms',
        });
        const paginator = makePaginator({ filters: {} });

        await paginator.toTail(); // cold start: preload the cached channels + defer
        expect(paginator.items?.map((ch) => ch.cid).sort()).toStrictEqual(
          [a.cid, b.cid, c.cid].sort(),
        );

        // A pending-send message.new lands during the defer window (before sync completes).
        paginator.ingestItem(a);

        // The list must NOT collapse to just the ingested channel.
        expect(paginator.items?.map((ch) => ch.cid).sort()).toStrictEqual(
          [a.cid, b.cid, c.cid].sort(),
        );
      });

      it('defers even when nothing is cached and the list is already loaded', async () => {
        await setUpOfflineDb({ syncStatus: true });
        vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
          channels: [new Channel(client, 'type', 'offline-a', {})],
          duration: '0.1ms',
        });
        const paginator = makePaginator();
        await paginator.toTail();

        client.offlineDb!.syncManager.syncStatus = false;
        getChannelsForQuery.mockClear();
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({ channels: [], duration: '0.1ms' });
        queryChannels.mockClear();

        await paginator.reload();

        expect(queryChannels).not.toHaveBeenCalled();
        // the cache is only read when nothing is loaded yet
        expect(getChannelsForQuery).not.toHaveBeenCalled();
        expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(1);
      });

      it('does not defer a next-page query', async () => {
        await setUpOfflineDb({ syncStatus: true });
        const paginator = new ChannelPaginator({
          client,
          filters: { type: 'type' },
          paginatorOptions: { pageSize: 1 },
        });
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({
            channels: [new Channel(client, 'type', 'offline-a', {})],
            duration: '0.1ms',
          });
        await paginator.toTail();

        client.offlineDb!.syncManager.syncStatus = false;
        queryChannels.mockResolvedValue({
          channels: [new Channel(client, 'type', 'offline-b', {})],
          duration: '0.1ms',
        });
        await paginator.toTail();

        expect(queryChannels).toHaveBeenCalledTimes(2);
        expect(scheduleSyncStatusChangeCallback).not.toHaveBeenCalled();
      });
    });
  });

  describe('query', () => {
    it('is called with correct parameters', async () => {
      const queryChannelsSpy = vi.spyOn(client, 'queryChannels').mockResolvedValue([]);
      const filters: ChannelFilters = { name: 'A' };
      const sort: SortParamRequest[] = [{ field: 'has_unread', direction: -1 }];
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
          filter_conditions: {
            muted: {
              $eq: true,
            },
            name: 'A',
          },
          sort: [{ field: 'has_unread', direction: -1 }],
          limit: 22,
          message_limit: 3,
          offset: 0,
        },
        undefined,
      );
    });
  });

  describe('reload', () => {
    const mockPages = (pages: Channel[][]) => {
      const spy = vi.spyOn(client, 'queryChannelsAndHydrate');
      pages.forEach((channels) =>
        spy.mockResolvedValueOnce({ channels, duration: '0.1ms' }),
      );
      return spy;
    };

    it('re-queries the first page, not the page the list had paginated to', async () => {
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { pageSize: 2 },
      });
      const spy = mockPages([[channel1, channel2], [channel1, channel2], [channel1]]);

      await paginator.toTail(); // first page: offset 0
      await paginator.toTail(); // second page: offset 2
      expect(spy.mock.calls[1][0]).toMatchObject({ offset: 2 });

      await paginator.reload();

      // the reload must restart the pagination, not continue it
      expect(spy.mock.calls[2][0]).toMatchObject({ limit: 2, offset: 0 });
    });

    it('leaves the offset where the restarted pagination lands', async () => {
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { pageSize: 2 },
      });
      mockPages([[channel1, channel2], [channel1, channel2], [channel1]]);

      await paginator.toTail();
      await paginator.toTail();
      expect(paginator.offset).toBe(4);

      await paginator.reload();

      expect(paginator.offset).toBe(1);
      expect(paginator.items?.map(({ cid }) => cid)).toEqual([channel1.cid]);
    });
  });

  describe('predefined filter response metadata', () => {
    const PREDEFINED_FILTER = {
      name: 'unarchived',
      filter: { archived: false },
    };

    const mockQueryResponse = (
      channels: Channel[],
      predefinedFilter?: { name: string; filter: object; sort?: SortParamRequest[] },
    ) =>
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels,
        duration: '0.1ms',
        ...(predefinedFilter ? { predefined_filter: predefinedFilter } : {}),
      });

    const archive = (channel: Channel) => {
      channel.state.membership = { user, archived_at: '2025-09-03T12:19:39.101089Z' };
    };

    it('matches items against the backend-resolved filter', async () => {
      // no local filters -> everything matches until the backend tells us what it filtered by
      const paginator = new ChannelPaginator({ client });
      archive(channel1);
      expect(paginator.matchesFilter(channel1)).toBeTruthy();

      mockQueryResponse([], PREDEFINED_FILTER);
      await paginator.toTail();

      expect(paginator.predefinedFilter?.filter).toEqual({ archived: false });
      expect(paginator.effectiveFilters).toEqual({ archived: false });
      expect(paginator.matchesFilter(channel1)).toBeFalsy();
    });

    it('does not ingest a live item excluded by the backend-resolved filter', async () => {
      const paginator = new ChannelPaginator({ client });
      const channelA = new Channel(client, 'type', 'pf-a', {});

      mockQueryResponse([channelA], PREDEFINED_FILTER);
      await paginator.toTail();
      expect(paginator.items).toStrictEqual([channelA]);

      const archivedChannel = new Channel(client, 'type', 'pf-archived', {});
      archive(archivedChannel);

      expect(paginator.ingestItem(archivedChannel)).toBe(false);
      expect(paginator.items).toStrictEqual([channelA]);
    });

    it('orders items by the backend-resolved sort', async () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'last_message_at', direction: 1 }],
      });
      // ascending: the older channel2 precedes channel1
      expect(paginator.sortComparator(channel1, channel2)).toBeGreaterThan(0);

      mockQueryResponse([], {
        ...PREDEFINED_FILTER,
        sort: [{ field: 'last_message_at', direction: -1 }],
      });
      await paginator.toTail();

      expect(paginator.predefinedFilter?.sort).toEqual([
        { field: 'last_message_at', direction: -1 },
      ]);
      expect(paginator.effectiveSort).toEqual([
        { field: 'last_message_at', direction: -1 },
      ]);
      expect(paginator.sortComparator(channel1, channel2)).toBeLessThan(0);
    });

    it('does not send the predefined filter back to the server', async () => {
      const channelA = new Channel(client, 'type', 'pf-a', {});
      const channelB = new Channel(client, 'type', 'pf-b', {});
      const paginator = new ChannelPaginator({
        client,
        filters: { type: 'type' },
        sort: [{ field: 'last_message_at', direction: -1 }],
        paginatorOptions: { pageSize: 1 },
      });

      const spy = mockQueryResponse([channelA], PREDEFINED_FILTER);
      await paginator.toTail();
      spy.mockResolvedValue({
        channels: [channelB],
        duration: '0.1ms',
        predefined_filter: PREDEFINED_FILTER,
      });
      await paginator.toTail();

      // the request still carries the locally configured filters, and offset 1 proves the query shape
      // did not change under us (a changed shape would restart pagination from offset 0)
      expect(spy).toHaveBeenLastCalledWith(
        {
          filter_conditions: { type: 'type' },
          sort: [{ field: 'last_message_at', direction: -1 }],
          limit: 1,
          offset: 1,
        },
        { withResponse: true },
      );
    });

    it('keeps the predefined-filter metadata while paginating, even if a later page omits it', async () => {
      const channelA = new Channel(client, 'type', 'pf-a', {});
      const channelB = new Channel(client, 'type', 'pf-b', {});
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { pageSize: 1 },
      });

      const spy = mockQueryResponse([channelA], PREDEFINED_FILTER);
      await paginator.toTail();
      spy.mockResolvedValue({ channels: [channelB], duration: '0.1ms' });
      await paginator.toTail();

      expect(paginator.predefinedFilter?.filter).toEqual({ archived: false });
    });

    it('clears the predefined-filter metadata when a first-page query is not a predefined-filter query', async () => {
      const paginator = new ChannelPaginator({ client });
      archive(channel1);

      const spy = mockQueryResponse([], {
        ...PREDEFINED_FILTER,
        sort: [{ field: 'last_message_at', direction: -1 }],
      });
      await paginator.toTail();
      expect(paginator.predefinedFilter?.filter).toEqual({ archived: false });

      spy.mockResolvedValue({ channels: [], duration: '0.1ms' });
      await paginator.reload();

      expect(paginator.predefinedFilter).toBeUndefined();
      expect(paginator.matchesFilter(channel1)).toBeTruthy();
    });

    it('keeps the predefined-filter metadata when a query fails', async () => {
      const paginator = new ChannelPaginator({ client });

      const spy = mockQueryResponse([], PREDEFINED_FILTER);
      await paginator.toTail();

      spy.mockRejectedValue(new Error('query failed'));
      await paginator.reload();

      expect(paginator.lastQueryError).toBeDefined();
      expect(paginator.predefinedFilter?.filter).toEqual({ archived: false });
    });

    it('ignores the response metadata when items are fetched through doRequest', async () => {
      const spy = mockQueryResponse([], PREDEFINED_FILTER);
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { doRequest: async () => ({ items: [] }) },
      });

      await paginator.toTail();

      expect(spy).not.toHaveBeenCalled();
      expect(paginator.predefinedFilter).toBeUndefined();
    });
  });

  describe('interval storage', () => {
    it('is index-addressable by cid, populates headItems, and dedupes across pages', async () => {
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
      expect(paginator.headItems.map((c) => c.cid).sort()).toEqual([
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
      expect(paginator.headmostItem?.cid).toBe('type:newest');
      expect(paginator.headItems[0]?.cid).toBe('type:newest');
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

    it('keeps a pinned channel on top when an unpinned channel receives a new message', async () => {
      const pinned = new Channel(client, 'type', 'pinned', {});
      const plainA = new Channel(client, 'type', 'plainA', {});
      const plainB = new Channel(client, 'type', 'plainB', {});
      pinned.state.membership = { pinned_at: '2020-01-01T00:00:00.000Z' };
      plainA.state.membership = {};
      plainB.state.membership = {};
      setLastMessageAt(pinned, new Date('2020-01-01T00:00:00.000Z')); // old, but pinned → stays on top
      setLastMessageAt(plainA, new Date('2020-03-01T00:00:00.000Z')); // newest unpinned
      setLastMessageAt(plainB, new Date('2020-02-01T00:00:00.000Z')); // older unpinned

      const paginator = new ChannelPaginator({
        client,
        sort: [
          { field: 'pinned_at', direction: -1 },
          { field: 'last_message_at', direction: -1 },
        ],
        paginatorOptions: {
          doRequest: () => Promise.resolve({ items: [pinned, plainA, plainB] }),
          pageSize: 10,
        },
      });
      await paginator.executeQuery({});
      expect(paginator.items?.map((ch) => ch.cid)).toEqual([
        'type:pinned',
        'type:plainA',
        'type:plainB',
      ]);

      // plainB receives a new message → newest last_message_at; re-ingest as updateLists does (no boost).
      setLastMessageAt(plainB, new Date('2020-05-01T00:00:00.000Z'));
      paginator.ingestItem(plainB);

      // plainB relocates ABOVE plainA (newer message) but stays BELOW the pinned channel — the sort's
      // pinned partition holds. A boost would have shoved plainB to index 0, over the pinned channel.
      expect(paginator.items?.map((ch) => ch.cid)).toEqual([
        'type:pinned',
        'type:plainB',
        'type:plainA',
      ]);
    });
  });
});
