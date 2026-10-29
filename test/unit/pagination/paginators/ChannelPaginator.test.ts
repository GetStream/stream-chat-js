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
  type Interval,
  PaginatorCursor,
  type StreamChat,
} from '../../../../src';
import { getClientWithUser } from '../../test-utils/getClient';
import { generateMsg } from '../../test-utils/generateMessage';
import { generateChannel } from '../../test-utils/generateChannel';
import type { FieldToDataResolver } from '../../../../src/pagination/types.normalization';
import { MockOfflineDB } from '../../offline-support/MockOfflineDB';
import * as utils from '../../../../src/utils';
import { convertDateToTimestamp } from '../../test-utils/time';
import {
  DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES,
  DEFAULT_QUERY_CHANNELS_RETRY_COUNT,
} from '../../../../src/constants';

const user = { id: 'custom-id' };

// `channel.state.last_message_at` is derived (read-only) from the message paginator's tracked latest
// message. To stage a specific value for sort tests, seed the paginator: clear first so any value
// (including an earlier one) applies, since tracking is monotonic.
const setLatestMessageAt = (channel: Channel, date: Date | null) => {
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
    setLatestMessageAt(channel1, new Date('1972-01-01T08:39:35.235Z'));
    channel1.data!.updated_at = convertDateToTimestamp('1972-01-01T08:39:35.235Z');

    channel2 = new Channel(client, 'type', 'id1', {});
    setLatestMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
    channel2.data!.updated_at = convertDateToTimestamp('1971-01-01T08:39:35.235Z');
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

      setLatestMessageAt(channel1, new Date('1970-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = convertDateToTimestamp('1970-01-01T08:39:35.235Z');

      setLatestMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = convertDateToTimestamp('1971-01-01T08:39:35.235Z');

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

      setLatestMessageAt(channel1, new Date('1970-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = convertDateToTimestamp('1970-01-01T08:39:35.235Z');

      setLatestMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = convertDateToTimestamp('1971-01-01T08:39:35.235Z');

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
        last_read: convertDateToTimestamp(new Date('1972-01-01T08:39:35.235Z')),
        unread_messages: 10,
        user,
      };
      channel2.state.read[user.id] = {
        last_read: convertDateToTimestamp(new Date('1972-01-01T08:39:35.235Z')),
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
      setLatestMessageAt(channel1, new Date('1975-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = convertDateToTimestamp('1970-01-01T08:39:35.235Z');
      setLatestMessageAt(channel2, new Date('1971-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = convertDateToTimestamp('1973-01-01T08:39:35.235Z');
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      // compares channel2.state.last_message_at with channel1.data!.updated_at
      setLatestMessageAt(channel1, new Date('1975-01-01T08:39:35.235Z'));
      channel1.data!.updated_at = convertDateToTimestamp('1976-01-01T08:39:35.235Z');
      setLatestMessageAt(channel2, new Date('1978-01-01T08:39:35.235Z'));
      channel2.data!.updated_at = convertDateToTimestamp('1973-01-01T08:39:35.235Z');
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
      channel1.state.membership = {
        pinned_at: convertDateToTimestamp('1972-01-01T08:39:35.235Z'),
      };
      channel2.state.membership = {
        pinned_at: convertDateToTimestamp('1971-01-01T08:39:35.235Z'),
      };
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.state.membership = {
        pinned_at: convertDateToTimestamp('1970-01-01T08:39:35.235Z'),
      };
      channel2.state.membership = {
        pinned_at: convertDateToTimestamp('1971-01-01T08:39:35.235Z'),
      };
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);
    });
    it('should sort by unread_count', () => {
      const paginator = new ChannelPaginator({
        client,
        sort: [{ field: 'unread_count', direction: 1 }],
      });
      channel1.state.read[user.id] = {
        last_read: convertDateToTimestamp(new Date()),
        unread_messages: 10,
        user,
      };
      channel2.state.read[user.id] = {
        last_read: convertDateToTimestamp(new Date()),
        unread_messages: 0,
        user,
      };
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.state.read[user.id] = {
        last_read: convertDateToTimestamp(new Date()),
        unread_messages: 10,
        user,
      };
      channel2.state.read[user.id] = {
        last_read: convertDateToTimestamp(new Date()),
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

      channel1.data!.updated_at = convertDateToTimestamp('1972-01-01T08:39:35.235Z');
      channel2.data!.updated_at = convertDateToTimestamp('1971-01-01T08:39:35.235Z');
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      channel1.data!.updated_at = convertDateToTimestamp('1970-01-01T08:39:35.235Z');
      channel2.data!.updated_at = convertDateToTimestamp('1971-01-01T08:39:35.235Z');
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
        [user.id]: {
          last_read: convertDateToTimestamp(new Date(2000)),
          unread_messages: 0,
          user,
        },
        [otherUserId]: {
          last_read: convertDateToTimestamp(new Date(1000)),
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
        channel1.data = { created_at: undefined };
        setLatestMessageAt(channel1, new Date(1000));

        expect(paginator.matchesFilter(channel1)).toBeTruthy();

        channel1.data = {
          created_at: convertDateToTimestamp(new Date(1000).toISOString()),
        };
        setLatestMessageAt(channel1, null);

        expect(paginator.matchesFilter(channel1)).toBeTruthy();

        channel1.data = { created_at: undefined };
        setLatestMessageAt(channel1, null);
        expect(paginator.matchesFilter(channel1)).toBeFalsy();

        // the server ignores `updated_at` for `last_updated`
        channel1.data = {
          created_at: undefined,
          updated_at: convertDateToTimestamp(new Date(1000).toISOString()),
        };
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

        channel1.data = { created_at: undefined };
        scenarios.forEach(({ val, expected }) => {
          setLatestMessageAt(channel1, new Date(val));
          expect(paginator.matchesFilter(channel1)).toBe(expected);
        });

        setLatestMessageAt(channel1, null);
        scenarios.forEach(({ val, expected }) => {
          channel1.data = {
            created_at: convertDateToTimestamp(new Date(val).toISOString()),
          };
          expect(paginator.matchesFilter(channel1)).toBe(expected);
        });

        channel1.data = { created_at: undefined };
        setLatestMessageAt(channel1, null);
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
        pinned_at: convertDateToTimestamp('2025-09-03T12:19:39.101089Z'),
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

  describe('unchanged items', () => {
    const setup = () => {
      const newer = new Channel(client, 'type', 'unchanged-newer', {});
      setLatestMessageAt(newer, new Date('1971-01-01T00:00:00.000Z'));
      const older = new Channel(client, 'type', 'unchanged-older', {});
      setLatestMessageAt(older, new Date('1970-01-01T00:00:00.000Z'));
      const paginator = new ChannelPaginator({ client, filters: {} });
      paginator.setItems({
        valueOrFactory: [newer, older],
        isFirstPage: true,
        isLastPage: true,
      });
      return { newer, older, paginator };
    };

    it('keeps the items array when an ingested channel stays in place', () => {
      const { newer, paginator } = setup();
      const items = paginator.items;

      paginator.ingestItem(newer);

      expect(paginator.items).toBe(items);
    });

    it('publishes a new items array when the order changes', () => {
      const { older, paginator } = setup();
      const items = paginator.items;

      setLatestMessageAt(older, new Date('1972-01-01T00:00:00.000Z'));
      paginator.boost(older.cid);
      paginator.ingestItem(older);

      expect(paginator.items).not.toBe(items);
      expect(paginator.items?.map((c) => c.id)).toEqual([
        'unchanged-older',
        'unchanged-newer',
      ]);
    });

    it('keeps the items array when setItems gets the same channels', () => {
      const { newer, older, paginator } = setup();
      const items = paginator.items;

      paginator.setItems({
        valueOrFactory: [newer, older],
        isFirstPage: true,
        isLastPage: true,
      });

      expect(paginator.items).toBe(items);
    });

    it('keeps the items array when a page with the same channels is ingested', () => {
      const { newer, older, paginator } = setup();
      const items = paginator.items;

      paginator.ingestPage({
        page: [newer, older],
        isHead: true,
        isTail: true,
        setActive: true,
      });

      expect(paginator.items).toBe(items);
    });

    it('keeps the items array when the active interval is activated again', () => {
      const { paginator } = setup();
      const items = paginator.items;

      paginator.setActiveInterval(paginator.itemIntervals[0] as Interval);

      expect(paginator.items).toBe(items);
    });

    it('keeps the items array when a refresh returns the same channels, and still ends loading', async () => {
      const { newer, older, paginator } = setup();
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [newer, older],
        duration: '0.1ms',
      });
      await paginator.toTail();
      const items = paginator.items;

      // the refresh reconnect recovery runs
      await paginator.toTail({ keepPreviousItems: true, reset: 'yes' });

      expect(paginator.items).toBe(items);
      expect(paginator.isLoading).toBe(false);
    });
  });

  describe('empty sort', () => {
    // Regression: `<ChannelList>` defaults its `sort` prop to `[]`, which `??` does not treat as
    // "unset". The comparator then had no fields, every comparison tied, and the id tiebreaker
    // re-sorted the whole list into cid order on the first ingest.
    it('falls back to the backend default when given an empty array', () => {
      const paginator = new ChannelPaginator({ client, filters: {}, sort: [] });

      expect(paginator.sort).toStrictEqual([
        { direction: -1, field: 'last_message_at' },
        { direction: -1, field: 'updated_at' },
      ]);
    });

    it('falls back after the sort setter is handed an empty array', () => {
      const paginator = new ChannelPaginator({
        client,
        filters: {},
        sort: [{ direction: -1, field: 'created_at' }],
      });
      paginator.sort = [];

      expect(paginator.sort).toStrictEqual([
        { direction: -1, field: 'last_message_at' },
        { direction: -1, field: 'updated_at' },
      ]);
    });

    it('sends the backend default to the server rather than an empty sort', async () => {
      const queryChannels = vi
        .spyOn(client, 'queryChannelsAndHydrate')
        .mockResolvedValue({ channels: [], duration: '0.1ms' });
      const paginator = new ChannelPaginator({ client, filters: {}, sort: [] });

      await paginator.toTail();

      expect(queryChannels.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          sort: [
            { direction: -1, field: 'last_message_at' },
            { direction: -1, field: 'updated_at' },
          ],
        }),
      );
    });

    it('does not re-sort the list into cid order when an item is ingested', () => {
      // `zeta` is the most recently active, so it must stay on top however often it is re-ingested.
      const zeta = new Channel(client, 'type', 'zeta', {});
      setLatestMessageAt(zeta, new Date('1999-01-01T00:00:00.000Z'));
      const alpha = new Channel(client, 'type', 'alpha', {});
      setLatestMessageAt(alpha, new Date('1980-01-01T00:00:00.000Z'));
      const paginator = new ChannelPaginator({ client, filters: {}, sort: [] });
      paginator.setItems({ valueOrFactory: [zeta, alpha], isFirstPage: true });

      paginator.ingestItem(zeta);

      expect(paginator.items?.map((c) => c.id)).toStrictEqual(['zeta', 'alpha']);
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
      // An empty sort is a RESET to the backend default, not "sort by nothing".
      expect(paginator.sort).toStrictEqual([
        { direction: -1, field: 'last_message_at' },
        { direction: -1, field: 'updated_at' },
      ]);
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
      await client.offlineDb!.init(client.userId as string);
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

    const setUpOfflineDb = async ({ isSynced }: { isSynced: boolean }) => {
      offlineDb = new MockOfflineDB({ client });
      client.setOfflineDBApi(offlineDb);
      (client.offlineDb!.initializeDB as unknown as MockInstance).mockReturnValue(true);
      await client.offlineDb!.init(client.userId as string);
      client.offlineDb!.syncManager.isSynced = isSynced;
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
      await setUpOfflineDb({ isSynced: true });
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [],
        duration: '0.1ms',
      });
      const paginator = makePaginator();

      await paginator.toTail();

      expect(getChannelsForQuery).toHaveBeenCalledWith({
        userId: client.userId,
        options: expect.objectContaining({
          filter_conditions: { type: 'type' },
          sort: [{ field: 'last_message_at', direction: -1 }],
          ...requestOptions,
        }),
      });
    });

    describe('cached messages', () => {
      const preloadWithMessageLimit = async (cachedMessageCount: number) => {
        await setUpOfflineDb({ isSynced: false });
        getChannelsForQuery.mockResolvedValue({
          channels: [
            generateChannel({
              channel: { id: 'cached', type: 'type' },
              messages: Array.from({ length: cachedMessageCount }, (_, i) =>
                generateMsg({
                  cid: 'type:cached',
                  date: new Date(Date.UTC(2026, 0, 1, 0, i)),
                }),
              ),
            }),
          ],
        });
        const paginator = new ChannelPaginator({
          client,
          filters: { type: 'type' },
          requestOptions: { message_limit: 10 },
          sort: [{ field: 'last_message_at', direction: -1 }],
        });

        await paginator.toTail();

        return paginator.items![0];
      };

      it('reads a full cached page as having older messages', async () => {
        const channel = await preloadWithMessageLimit(10);

        expect(channel.messagePaginator.state.getLatestValue().hasMoreTail).toBe(true);
      });

      it('reads a short cached page as the start of the channel', async () => {
        const channel = await preloadWithMessageLimit(8);

        expect(channel.messagePaginator.state.getLatestValue().hasMoreTail).toBe(false);
      });
    });

    it('persists cids under the full query request after a query', async () => {
      await setUpOfflineDb({ isSynced: true });
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
        predefinedFilter: undefined,
        sort: [{ field: 'last_message_at', direction: -1 }],
      });
    });

    it('persists the new cid order after a live ingest and after a removal', async () => {
      await setUpOfflineDb({ isSynced: true });
      const channelA = new Channel(client, 'type', 'offline-a', {});
      setLatestMessageAt(channelA, new Date('1971-01-01T00:00:00.000Z'));
      const channelB = new Channel(client, 'type', 'offline-b', {});
      setLatestMessageAt(channelB, new Date('1970-01-01T00:00:00.000Z'));
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
      setLatestMessageAt(channelB, new Date('1972-01-01T00:00:00.000Z'));
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

    it('keeps paginating after removing a channel that moved into the loaded window from the logical tail', async () => {
      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id, index) => {
        const channel = new Channel(client, 'type', id, {});
        setLatestMessageAt(channel, new Date(Date.UTC(1970, 0, 10 - index * 2)));
        return channel;
      });
      vi.spyOn(client, 'queryChannelsAndHydrate')
        .mockResolvedValueOnce({ channels: [a, b], duration: '0.1ms' })
        .mockResolvedValueOnce({ channels: [c, d], duration: '0.1ms' });
      const paginator = new ChannelPaginator({
        client,
        filters: {},
        paginatorOptions: { pageSize: 2 },
        sort: [{ field: 'last_message_at', direction: -1 }],
      });
      await paginator.toTail();

      // It is added with no messages yet, so it sorts below the loaded page into the logical tail.
      const added = new Channel(client, 'type', 'added', {});
      paginator.ingestItem(added);
      // Its first message arrives on the same instance, so it now sorts between a and b.
      setLatestMessageAt(added, new Date(Date.UTC(1970, 0, 9)));
      // Then it leaves the list (archived, say).
      paginator.removeItem({ item: added });

      await paginator.toTail();

      expect(paginator.isLoading).toBe(false);
      expect(paginator.items?.map((channel) => channel.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('persists only the first page, including after paginating and live reorders', async () => {
      await setUpOfflineDb({ isSynced: true });
      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id, index) => {
        const channel = new Channel(client, 'type', id, {});
        setLatestMessageAt(channel, new Date(Date.UTC(1970, 0, 10 - index)));
        return channel;
      });
      vi.spyOn(client, 'queryChannelsAndHydrate')
        .mockResolvedValueOnce({ channels: [a, b], duration: '0.1ms' })
        .mockResolvedValueOnce({ channels: [c, d], duration: '0.1ms' });
      const paginator = new ChannelPaginator({
        client,
        filters: {},
        paginatorOptions: { pageSize: 2 },
        sort: [{ field: 'last_message_at', direction: -1 }],
      });

      await paginator.toTail();
      expect(upsertCidsForQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ cids: [a.cid, b.cid] }),
      );
      upsertCidsForQuery.mockClear();

      // A later page cannot change the first page, so it is not written.
      await paginator.toTail();

      expect(paginator.items).toHaveLength(4);
      expect(upsertCidsForQuery).not.toHaveBeenCalled();

      // `d` receives a newer message and moves to the top.
      setLatestMessageAt(d, new Date(Date.UTC(1970, 0, 20)));
      paginator.boost(d.cid, { seq: paginator.maxBoostSeq + 1 });
      paginator.ingestItem(d);

      expect(upsertCidsForQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ cids: [d.cid, a.cid] }),
      );
    });

    it('does not persist when a removal changed nothing', async () => {
      await setUpOfflineDb({ isSynced: true });
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
      await setUpOfflineDb({ isSynced: false });
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
        await setUpOfflineDb({ isSynced: false });
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        getChannelsForQuery.mockResolvedValue({
          channels: [{ channel: cachedChannel.data }],
        });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue([cachedChannel]);
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
        client.offlineDb!.syncManager.isSynced = true;
        await scheduleSyncStatusChangeCallback.mock.calls[0][1]();

        expect(queryChannels).toHaveBeenCalledTimes(1);
      });

      it('runs the watching query directly when the sync completes during the preload', async () => {
        // This test basically confirms a very intermittent regression that would cause the sync status
        // to be changed to true way before the preload/initial population finishes. In that instance,
        // we would drop all of the listeners and so the actual query would not fire.
        await setUpOfflineDb({ isSynced: false });
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        // getChannelsForQuery IS the awaited preload: flipping isSynced here mimics the sync landing
        // mid-await (and the sync manager having already drained + cleared its callback map).
        getChannelsForQuery.mockImplementation(async () => {
          client.offlineDb!.syncManager.isSynced = true;
          return { channels: [{ channel: cachedChannel.data }] };
        });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue([cachedChannel]);
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
        // The seed recorded `offset = 1`; this call site must still ask for the first page.
        expect(queryChannels.mock.calls[0][0]).toEqual(
          expect.objectContaining({ offset: 0 }),
        );
      });

      it('runs the query directly even when the cache is empty and the sync lands during the preload', async () => {
        // Same race, but nothing is cached: the preload returns nothing yet the sync still completes
        // mid-await. We must not strand a callback — run the query directly so the (watched) list still lands.
        await setUpOfflineDb({ isSynced: false });
        const fresh = new Channel(client, 'type', 'fresh', {});
        getChannelsForQuery.mockImplementation(async () => {
          client.offlineDb!.syncManager.isSynced = true;
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
        await setUpOfflineDb({ isSynced: false });
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        getChannelsForQuery.mockResolvedValue({
          channels: [{ channel: cachedChannel.data }],
        });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue([cachedChannel]);
        vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
          channels: [cachedChannel],
          duration: '0.1ms',
        });
        const paginator = makePaginator();

        await paginator.toTail(); // cold start: surface the cached page, defer the query
        expect(paginator.items).toStrictEqual([cachedChannel]);

        // The sync invalidates the offline query cache before the deferred re-run fires.
        getChannelsForQuery.mockResolvedValue(null);
        client.offlineDb!.syncManager.isSynced = true;

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

      describe('when the list is requested again before the sync completes', () => {
        const setUpCachedPage = async () => {
          await setUpOfflineDb({ isSynced: false });
          const cachedChannel = new Channel(client, 'type', 'cached', {});
          getChannelsForQuery.mockResolvedValue({
            channels: [{ channel: cachedChannel.data }],
          });
          vi.spyOn(client, 'hydrateChannels').mockReturnValue([cachedChannel]);
          const queryChannels = vi
            .spyOn(client, 'queryChannelsAndHydrate')
            .mockResolvedValue({ channels: [cachedChannel], duration: '0.1ms' });
          return { queryChannels };
        };

        const runScheduledQuery = async () => {
          client.offlineDb!.syncManager.isSynced = true;
          await scheduleSyncStatusChangeCallback.mock.calls.at(-1)![1]();
        };

        it('reads the cache and queries once for calls made in the same tick', async () => {
          const { queryChannels } = await setUpCachedPage();
          const paginator = makePaginator();

          await Promise.all([paginator.reload(), paginator.reload(), paginator.toTail()]);
          await runScheduledQuery();

          expect(getChannelsForQuery).toHaveBeenCalledTimes(1);
          expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(1);
          expect(queryChannels).toHaveBeenCalledTimes(1);
        });

        it('reads the cache and queries once for calls made after the cache was read', async () => {
          const { queryChannels } = await setUpCachedPage();
          const paginator = makePaginator();

          await paginator.reload();
          await paginator.reload();
          await paginator.toTail();
          await runScheduledQuery();

          expect(getChannelsForQuery).toHaveBeenCalledTimes(1);
          expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(1);
          expect(queryChannels).toHaveBeenCalledTimes(1);
        });

        it('reads the cache again for a different query made in the same tick', async () => {
          await setUpCachedPage();
          const paginator = makePaginator();

          const first = paginator.reload();
          paginator.staticFilters = { type: 'other' } as ChannelFilters;
          await Promise.all([first, paginator.reload()]);

          expect(getChannelsForQuery).toHaveBeenCalledTimes(2);
          expect(
            getChannelsForQuery.mock.calls[1][0].options.filter_conditions,
          ).toStrictEqual({
            type: 'other',
          });
        });

        it('reads the cache again after the state was reset', async () => {
          await setUpCachedPage();
          const paginator = makePaginator();

          await paginator.reload();
          paginator.resetState();
          await paginator.reload();

          expect(getChannelsForQuery).toHaveBeenCalledTimes(2);
        });

        it('reads the cache again after the cache read failed', async () => {
          await setUpCachedPage();
          getChannelsForQuery.mockRejectedValueOnce(new Error('db failed'));
          const paginator = makePaginator();
          paginator.updateConfig({ throwErrors: true });

          await expect(paginator.reload()).rejects.toThrow('db failed');
          await paginator.reload();

          expect(getChannelsForQuery).toHaveBeenCalledTimes(2);
          expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(1);
        });

        it('waits for the next sync again once the waiting query ran', async () => {
          await setUpCachedPage();
          const paginator = makePaginator();

          await paginator.reload();
          await runScheduledQuery();
          // the socket dropped, so the next sync is pending again
          client.offlineDb!.syncManager.isSynced = false;
          await paginator.reload();

          expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(2);
        });

        it('waits for the next sync again once the query ran right after the cache read', async () => {
          await setUpCachedPage();
          getChannelsForQuery.mockImplementationOnce(async () => {
            client.offlineDb!.syncManager.isSynced = true;
            return null;
          });
          const paginator = makePaginator();

          await paginator.reload();
          client.offlineDb!.syncManager.isSynced = false;
          await paginator.reload();

          expect(scheduleSyncStatusChangeCallback).toHaveBeenCalledTimes(1);
        });
      });

      it('seeds the preloaded channels into the index so a concurrent ingest does not collapse the list', async () => {
        // The cold start preload must SEED the paginator (populate the interval/index), not
        // just set the displayed `items`. Otherwise a channel ingested concurrently during the presync
        // window (i.e a message.new from the offline-send replay in executePendingTasks) rebuilds the
        // list from an empty index and collapses it to just that one channel.
        await setUpOfflineDb({ isSynced: false });
        const a = new Channel(client, 'type', 'a', {});
        const b = new Channel(client, 'type', 'b', {});
        const c = new Channel(client, 'type', 'c', {});
        getChannelsForQuery.mockResolvedValue({ channels: [{}, {}, {}] });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue([a, b, c]);
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
        await setUpOfflineDb({ isSynced: true });
        vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
          channels: [new Channel(client, 'type', 'offline-a', {})],
          duration: '0.1ms',
        });
        const paginator = makePaginator();
        await paginator.toTail();

        client.offlineDb!.syncManager.isSynced = false;
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
        await setUpOfflineDb({ isSynced: true });
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

        client.offlineDb!.syncManager.isSynced = false;
        queryChannels.mockResolvedValue({
          channels: [new Channel(client, 'type', 'offline-b', {})],
          duration: '0.1ms',
        });
        await paginator.toTail();

        expect(queryChannels).toHaveBeenCalledTimes(2);
        expect(scheduleSyncStatusChangeCallback).not.toHaveBeenCalled();
      });

      // The cold start `<ChannelList>` actually performs. A list seeded from the offline cache is
      // short, so its FlatList sits within the scroll threshold of its own bottom at mount and fires
      // `onEndReached` straight away — and again on the re-render a `message.new` causes.
      const seedFromCache = async () => {
        await setUpOfflineDb({ isSynced: false });
        const cached = [
          new Channel(client, 'type', 'a', {}),
          new Channel(client, 'type', 'b', {}),
          new Channel(client, 'type', 'c', {}),
        ];
        getChannelsForQuery.mockResolvedValue({ channels: cached.map(() => ({})) });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue(cached);
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({ channels: cached, duration: '0.1ms' });
        const paginator = makePaginator({ filters: {} });

        await paginator.toTail(); // cold start: surface the cached page, defer the query
        expect(paginator.items).toStrictEqual(cached);
        expect(queryChannels).not.toHaveBeenCalled();

        return { cached, paginator, queryChannels };
      };

      it('does not paginate a window that came only from the cache', async () => {
        const { paginator, queryChannels } = await seedFromCache();

        await paginator.toTail();

        // A cache-seeded window is not an already-loaded list: the seed records `offset = 3` without
        // any page having been fetched, so an un-deferred continuation would ask the server for
        // whatever follows the ENTIRE cache instead of for the list's first page.
        expect(queryChannels).not.toHaveBeenCalled();
      });

      it('refreshes a cache-seeded window from the first page, not from the end of the cache', async () => {
        const { cached, paginator, queryChannels } = await seedFromCache();

        await paginator.toTail(); // the extra onEndReached, deferred like the first

        client.offlineDb!.syncManager.isSynced = true;
        // Callbacks are stored in a Map keyed by paginator id, so only the last schedule survives.
        const calls = scheduleSyncStatusChangeCallback.mock.calls;
        await calls[calls.length - 1][1]();

        expect(queryChannels).toHaveBeenCalledTimes(1);
        // `toTail` asks to continue tailward; the deferred refresh must override that, because the
        // position it would continue from was recorded by the seed rather than earned by a query.
        expect(queryChannels.mock.calls[0][0]).toEqual(
          expect.objectContaining({ offset: 0 }),
        );
        // ...and the cached list stayed on screen throughout.
        expect(paginator.items).toStrictEqual(cached);
      });

      it('resumes normal pagination once a query has confirmed the window', async () => {
        // The cache-only rewrite turns a continuation into a first-page refresh. If the flag outlived
        // the first real query, EVERY later page would be rewritten too and the list could never
        // paginate past page one.
        await setUpOfflineDb({ isSynced: false });
        const channel = (id: string) => new Channel(client, 'type', id, {});
        const cached = [channel('a'), channel('b')];
        getChannelsForQuery.mockResolvedValue({ channels: cached.map(() => ({})) });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue(cached);
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValueOnce({ channels: cached, duration: '0.1ms' })
          .mockResolvedValueOnce({
            channels: [channel('c'), channel('d')],
            duration: '0.1ms',
          });
        const paginator = new ChannelPaginator({
          client,
          filters: {},
          paginatorOptions: { pageSize: 2 },
        });

        await paginator.toTail();
        client.offlineDb!.syncManager.isSynced = true;
        const calls = scheduleSyncStatusChangeCallback.mock.calls;
        await calls[calls.length - 1][1]();

        expect(queryChannels.mock.calls[0][0]).toEqual(
          expect.objectContaining({ offset: 0 }),
        );

        await paginator.toTail();

        expect(queryChannels.mock.calls[1][0]).toEqual(
          expect.objectContaining({ offset: 2 }),
        );
      });

      describe('replacing the cache-seeded window with the refreshed first page', () => {
        const channel = (id: string) => new Channel(client, 'type', id, {});

        const seedAndSync = async (cached: Channel[], pageSize: number) => {
          await setUpOfflineDb({ isSynced: false });
          getChannelsForQuery.mockResolvedValue({ channels: cached.map(() => ({})) });
          vi.spyOn(client, 'hydrateChannels').mockReturnValue(cached);
          const queryChannels = vi.spyOn(client, 'queryChannelsAndHydrate');
          const paginator = new ChannelPaginator({
            client,
            filters: {},
            paginatorOptions: { pageSize },
          });

          await paginator.toTail(); // cold start: surface the cache, defer the query
          expect(paginator.items).toEqual(cached);
          client.offlineDb!.syncManager.isSynced = true;
          const runDeferredRefresh = async () => {
            const calls = scheduleSyncStatusChangeCallback.mock.calls;
            await calls[calls.length - 1][1]();
          };

          return { paginator, queryChannels, runDeferredRefresh };
        };

        it('drops cached channels the server no longer returns and paginates after the page', async () => {
          // Regression: the refresh MERGED into the cache, so channels hidden, deleted or left while the
          // app was closed stayed in the list, and pagination continued from the end of page 1 while the
          // whole cache stayed loaded - the next pages re-fetched cached channels and looked stuck.
          const { paginator, queryChannels, runDeferredRefresh } = await seedAndSync(
            ['a', 'hidden', 'b', 'c', 'd'].map(channel),
            2,
          );
          queryChannels
            .mockResolvedValueOnce({
              channels: [channel('a'), channel('b')],
              duration: '0.1ms',
            })
            .mockResolvedValueOnce({
              channels: [channel('c'), channel('d')],
              duration: '0.1ms',
            });

          await runDeferredRefresh();

          expect(queryChannels.mock.calls[0][0]).toEqual(
            expect.objectContaining({ offset: 0 }),
          );
          expect(paginator.items?.map(({ id }) => id)).toEqual(['a', 'b']);
          expect(paginator.offset).toBe(2);

          await paginator.toTail();

          expect(queryChannels.mock.calls[1][0]).toEqual(
            expect.objectContaining({ offset: 2 }),
          );
          expect(paginator.items?.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
        });

        it('replaces the cached window in a single update, without blanking it', async () => {
          const { paginator, queryChannels, runDeferredRefresh } = await seedAndSync(
            ['a', 'hidden'].map(channel),
            2,
          );
          queryChannels.mockResolvedValueOnce({
            channels: [channel('a')],
            duration: '0.1ms',
          });
          const publishedItems: Array<string[] | undefined> = [];
          const unsubscribe = paginator.state.subscribeWithSelector(
            ({ items }) => ({ items }),
            ({ items }) => publishedItems.push(items?.map(({ id }) => id)),
          );
          publishedItems.length = 0; // drop the subscription's initial value

          await runDeferredRefresh();
          unsubscribe();

          expect(publishedItems).toEqual([['a']]);
        });
      });

      it('does not continue from the seeded position once the sync completes', async () => {
        const { cached, paginator, queryChannels } = await seedFromCache();

        // The sync lands (a queued pending-task replay is exactly this: it holds `isSynced` false
        // for seconds, then flips it), and a fling-driven next-page query races ahead of the
        // deferred refresh. It is no longer deferred — but the window is still cache-only, so it
        // must not continue from the position the seed recorded.
        client.offlineDb!.syncManager.isSynced = true;
        await paginator.toTail();

        expect(queryChannels).toHaveBeenCalledTimes(1);
        expect(queryChannels.mock.calls[0][0]).toEqual(
          expect.objectContaining({ offset: 0 }),
        );
        expect(paginator.items).toStrictEqual(cached);
      });
    });

    describe('predefined-filter metadata in the cache', () => {
      // The rule the server resolved for a `predefined_filter` list. A cache-seeded window has no
      // response to learn it from, so without persisting it the paginator matches against the LOCAL
      // filters and orders by `DEFAULT_BACKEND_SORT` until the first query lands - a window a queued
      // pending-task replay can stretch to seconds.
      const RESOLVED = {
        name: 'user_messaging',
        filter: { archived: false },
        sort: [{ field: 'last_message_at', direction: 1 as const }],
      };

      const seedWith = async (
        predefinedFilter: typeof RESOLVED | undefined,
        channels: Channel[],
      ) => {
        await setUpOfflineDb({ isSynced: false });
        getChannelsForQuery.mockResolvedValue({
          channels: channels.map(() => ({})),
          predefinedFilter,
        });
        vi.spyOn(client, 'hydrateChannels').mockReturnValue(channels);
        const queryChannels = vi
          .spyOn(client, 'queryChannelsAndHydrate')
          .mockResolvedValue({ channels: [], duration: '0.1ms' });
        const paginator = makePaginator({ filters: {} });
        await paginator.toTail();
        return { paginator, queryChannels };
      };

      it('persists the resolved metadata with the cid order it produced', async () => {
        await setUpOfflineDb({ isSynced: true });
        const channelA = new Channel(client, 'type', 'offline-a', {});
        vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
          channels: [channelA],
          duration: '0.1ms',
          predefined_filter: RESOLVED,
        });
        const paginator = makePaginator({ filters: {} });

        await paginator.toTail();

        expect(upsertCidsForQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            cids: [channelA.cid],
            predefinedFilter: RESOLVED,
          }),
        );
      });

      it('restores it from the cache and writes it back with the seeded order', async () => {
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        const { paginator } = await seedWith(RESOLVED, [cachedChannel]);

        expect(paginator.predefinedFilter).toEqual(RESOLVED);
        expect(paginator.effectiveFilters).toEqual(RESOLVED.filter);
        expect(paginator.effectiveSort).toEqual(RESOLVED.sort);
        expect(upsertCidsForQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            cids: [cachedChannel.cid],
            predefinedFilter: RESOLVED,
          }),
        );
      });

      it('orders a live ingest into the seeded window by the restored sort', async () => {
        const older = new Channel(client, 'type', 'older', {});
        setLatestMessageAt(older, new Date('1970-01-01T00:00:00.000Z'));
        const newer = new Channel(client, 'type', 'newer', {});
        setLatestMessageAt(newer, new Date('1980-01-01T00:00:00.000Z'));
        // RESOLVED sorts ASCENDING - the opposite of the `DEFAULT_BACKEND_SORT` fallback, so the
        // placement below tells the two rules apart.
        const { paginator } = await seedWith(RESOLVED, [older, newer]);

        const oldest = new Channel(client, 'type', 'oldest', {});
        setLatestMessageAt(oldest, new Date('1960-01-01T00:00:00.000Z'));
        paginator.ingestItem(oldest);

        // Ascending, it belongs at the head - which the seeded window has loaded. Under the fallback
        // it would sort past the last item into unloaded tail territory and be dropped instead.
        expect(paginator.items?.map(({ cid }) => cid)).toEqual([
          oldest.cid,
          older.cid,
          newer.cid,
        ]);
        expect(paginator.sortComparator(older, newer)).toBeLessThan(0);
      });

      it('rejects a live ingest the restored filter excludes', async () => {
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        // The paginator's own filters are `{}` - everything matches until the restored rule says
        // otherwise, which is the membership half of the bug.
        const { paginator } = await seedWith(RESOLVED, [cachedChannel]);

        const archived = new Channel(client, 'type', 'archived', {});
        archived.state.membership = { user, archived_at: '2025-09-03T12:19:39.101089Z' };

        expect(paginator.ingestItem(archived)).toBe(false);
        expect(paginator.items).toStrictEqual([cachedChannel]);
      });

      it('lets the first real response overwrite what the cache restored', async () => {
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        const { paginator, queryChannels } = await seedWith(RESOLVED, [cachedChannel]);
        const server = {
          name: 'user_messaging',
          filter: { archived: true },
          sort: [{ field: 'last_message_at', direction: -1 as const }],
        };
        queryChannels.mockResolvedValue({
          channels: [cachedChannel],
          duration: '0.1ms',
          predefined_filter: server,
        });

        client.offlineDb!.syncManager.isSynced = true;
        const calls = scheduleSyncStatusChangeCallback.mock.calls;
        await calls[calls.length - 1][1]();

        expect(paginator.predefinedFilter).toEqual(server);
      });

      it('leaves the metadata unset when the cached query carried none', async () => {
        const cachedChannel = new Channel(client, 'type', 'cached', {});
        const { paginator } = await seedWith(undefined, [cachedChannel]);

        expect(paginator.predefinedFilter).toBeUndefined();
        expect(upsertCidsForQuery).toHaveBeenCalledWith(
          expect.objectContaining({ predefinedFilter: undefined }),
        );
      });
    });
  });

  describe('fetchQueryResponse', () => {
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

      // @ts-expect-error calling the protected fetching step
      await paginator.fetchQueryResponse();
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

    it('continues after the loaded list when a non-destructive refresh re-fetched page 1', async () => {
      // The refresh `ChannelManager.recover()` runs on reconnect. Regression: it left the position at
      // the end of page 1 while every loaded page stayed in the list, so the next two pages were
      // re-fetched (offset 2, then 4) before anything new arrived.
      const channel = (id: string) => new Channel(client, 'type', id, {});
      const [a, b, c, d, e, f, g] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(channel);
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { pageSize: 2 },
      });
      // The refresh asks for all 6 loaded channels; the server caps it at 4.
      const spy = mockPages([[a, b], [c, d], [e, f], [a, b, c, d], [g]]);

      await paginator.toTail();
      await paginator.toTail();
      await paginator.toTail();
      await paginator.toTail({ keepPreviousItems: true, reset: 'yes' });

      expect(spy.mock.calls[3][0]).toMatchObject({ limit: 6, offset: 0 });
      expect(paginator.items).toHaveLength(6);
      // A capped response is not the end of the list.
      expect(paginator.hasMoreTail).toBe(true);

      await paginator.toTail();

      expect(spy.mock.calls[4][0]).toMatchObject({ limit: 2, offset: 6 });
      expect(paginator.items).toHaveLength(7);
    });

    it('asks for one page when not refreshing, even at offset 0 with channels loaded', async () => {
      // Only a non-destructive refresh asks for more than a page. Here the offset drops back to 0 after a
      // removal while live-ingested channels are still loaded, and the next page must still be one page.
      const dated = (id: string, date: string) => {
        const datedChannel = new Channel(client, 'type', id, {});
        setLatestMessageAt(datedChannel, new Date(date));
        return datedChannel;
      };
      const a = dated('a', '2020-01-01');
      const paginator = new ChannelPaginator({
        client,
        filters: {},
        paginatorOptions: { pageSize: 1 },
      });
      const spy = mockPages([[a], []]);

      await paginator.toTail();
      paginator.ingestItem(dated('b', '2020-01-02'));
      paginator.ingestItem(dated('c', '2020-01-03'));
      paginator.removeItem({ item: a });
      expect(paginator.offset).toBe(0);
      expect(paginator.items).toHaveLength(2);

      await paginator.toTail();

      expect(spy.mock.calls[1][0]).toMatchObject({ limit: 1, offset: 0 });
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
    it('is index-addressable by cid, populates anchoredHeadItems, and dedupes across pages', async () => {
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
      expect(paginator.anchoredHeadItems.map((c) => c.cid).sort()).toEqual([
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
      setLatestMessageAt(newest, new Date('2020-03-01T00:00:00.000Z'));
      setLatestMessageAt(middle, new Date('2020-02-01T00:00:00.000Z'));
      setLatestMessageAt(oldest, new Date('2020-01-01T00:00:00.000Z'));

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
      expect(paginator.anchoredHeadItem?.cid).toBe('type:newest');
      expect(paginator.anchoredHeadItems[0]?.cid).toBe('type:newest');
    });

    it('promotes a non-headmost channel to the top on re-ingest without dropping it', async () => {
      // Reproduces the reorder-on-new-message bug: a channel below the head gets a newer
      // last_message_at and is re-ingested (as the orchestrator does on message.new). It must move to
      // the top and stay visible — not escape into the logical-head interval and disappear.
      const a = new Channel(client, 'type', 'a', {});
      const b = new Channel(client, 'type', 'b', {});
      const c = new Channel(client, 'type', 'c', {});
      setLatestMessageAt(a, new Date('2020-03-01T00:00:00.000Z'));
      setLatestMessageAt(b, new Date('2020-02-01T00:00:00.000Z'));
      setLatestMessageAt(c, new Date('2020-01-01T00:00:00.000Z')); // oldest / non-headmost

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
      setLatestMessageAt(c, new Date('2020-04-01T00:00:00.000Z'));
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
      pinned.state.membership = {
        pinned_at: convertDateToTimestamp('2020-01-01T00:00:00.000Z'),
      };
      plainA.state.membership = {};
      plainB.state.membership = {};
      setLatestMessageAt(pinned, new Date('2020-01-01T00:00:00.000Z')); // old, but pinned → stays on top
      setLatestMessageAt(plainA, new Date('2020-03-01T00:00:00.000Z')); // newest unpinned
      setLatestMessageAt(plainB, new Date('2020-02-01T00:00:00.000Z')); // older unpinned

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
      setLatestMessageAt(plainB, new Date('2020-05-01T00:00:00.000Z'));
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
  // Every channel the user reads leaves `has_unread: true` server-side, so the result set shrinks under
  // the query and the next page has to start that many positions earlier (Zendesk 82913).
  describe('pagination over a result set that shrinks', () => {
    const CHANNEL_COUNT = 30;
    const PAGE_SIZE = 10;

    const buildInbox = () =>
      Array.from({ length: CHANNEL_COUNT }, (_, index) => {
        const channel = new Channel(
          client,
          'messaging',
          `channel-${String(index).padStart(2, '0')}`,
          {},
        );
        setLatestMessageAt(channel, new Date(CHANNEL_COUNT - index));
        channel.state.read = {
          [user.id]: {
            last_read: convertDateToTimestamp(new Date(0)),
            unread_messages: 1,
            user,
          },
        };
        return channel;
      });

    const isUnread = (channel: Channel) =>
      channel.state.read[user.id].unread_messages > 0;

    it('returns every unread channel while the user reads each page', async () => {
      const inbox = buildInbox();
      const offsets: number[] = [];
      const everReturned = new Set<string>();

      const paginator = new ChannelPaginator({
        client,
        filters: { has_unread: true },
        sort: [{ direction: -1, field: 'last_message_at' }],
        paginatorOptions: {
          pageSize: PAGE_SIZE,
          // stands in for the backend: honours both `has_unread` and `offset`
          doRequest: async (queryShape) => {
            const offset = queryShape?.offset ?? 0;
            const page = inbox
              .filter(isUnread)
              .slice(offset, offset + (queryShape?.limit ?? PAGE_SIZE));
            offsets.push(offset);
            page.forEach((channel) => everReturned.add(channel.cid));
            return { items: page };
          },
        },
      });

      await paginator.toTail({ reset: 'yes' });

      let previouslyReturned = -1;
      while (paginator.hasMoreTail && everReturned.size !== previouslyReturned) {
        previouslyReturned = everReturned.size;
        // the user works through every loaded channel
        (paginator.items ?? []).slice().forEach((channel) => {
          channel.state.read[user.id].unread_messages = 0;
          paginator.ingestItem(channel);
        });
        await paginator.toTail();
      }

      // the result set shrank by exactly the page that was read, so every page starts at its head
      expect(offsets).toEqual([0, 0, 0, 0]);
      expect(everReturned.size).toBe(CHANNEL_COUNT);
      expect(paginator.items).toHaveLength(0);
      expect(paginator.hasMoreTail).toBe(false);
    });
  });
  describe('first page loaded as a keepPreviousItems refresh', () => {
    it('is the head, so a channel with a newer message moves to the top instead of vanishing', async () => {
      const channels = [0, 1, 2].map((i) => {
        const channel = new Channel(client, 'messaging', `kpi-${i}`, {});
        setLatestMessageAt(channel, new Date(Date.UTC(2020, 0, 3 - i)));
        return channel;
      });
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: {
          doRequest: () => Promise.resolve({ items: channels }),
          pageSize: 3,
        },
      });

      await paginator.toTail({ keepPreviousItems: true, reset: 'yes' });
      expect(paginator.itemIntervals.map((i) => i.isHead)).toEqual([true]);

      setLatestMessageAt(channels[2], new Date(Date.UTC(2020, 0, 9)));
      paginator.ingestItem(channels[2]);

      expect(paginator.items?.map((channel) => channel.id)).toEqual([
        'kpi-2',
        'kpi-0',
        'kpi-1',
      ]);
    });

    it('keeps the list paging when a full refreshed page merges the list that ended', async () => {
      const channels = [0, 1, 2, 3].map((i) => {
        const channel = new Channel(client, 'messaging', `kpi-${i}`, {});
        setLatestMessageAt(channel, new Date(Date.UTC(2020, 0, 9 - i)));
        return channel;
      });
      const [newChannel, ...loadedChannels] = channels;
      const doRequest = vi
        .fn()
        .mockResolvedValueOnce({ items: loadedChannels.slice(0, 2) })
        // a short page: the end of the list
        .mockResolvedValueOnce({ items: loadedChannels.slice(2) })
        // reconnect: a channel entered the list at the top, so the first page is full
        .mockResolvedValueOnce({ items: [newChannel, loadedChannels[0]] });
      const paginator = new ChannelPaginator({
        client,
        paginatorOptions: { doRequest, pageSize: 2 },
      });
      await paginator.toTail();
      await paginator.toTail();
      expect(paginator.hasMoreTail).toBe(false);

      await paginator.toTail({ keepPreviousItems: true, reset: 'yes' });

      expect(paginator.items?.map((channel) => channel.id)).toEqual([
        'kpi-0',
        'kpi-1',
        'kpi-2',
        'kpi-3',
      ]);
      expect(paginator.hasMoreTail).toBe(true);
    });
  });
  describe('fields kept under data.custom', () => {
    beforeEach(() => {
      // @ts-expect-error using undeclared custom properties
      channel1.data!.custom = { color: 'red', name: 'general' };
    });

    it('matches name and custom fields as a channel response keeps them', () => {
      const matches = (filters: object) =>
        new ChannelPaginator({ client, filters: filters as never }).matchesFilter(
          channel1,
        );

      expect(matches({ name: { $autocomplete: 'gen' } })).toBeTruthy();
      expect(matches({ color: 'red' })).toBeTruthy();
      expect(matches({ 'custom.color': 'red' })).toBeTruthy();
      expect(matches({ color: 'blue' })).toBeFalsy();
    });

    it('applies a negative operator to the custom value, not to a missing one', () => {
      const matches = (filters: object) =>
        new ChannelPaginator({ client, filters: filters as never }).matchesFilter(
          channel1,
        );

      expect(matches({ name: { $ne: 'general' } })).toBeFalsy();
      expect(matches({ name: { $ne: 'random' } })).toBeTruthy();
    });

    it('sorts by a custom field', () => {
      // @ts-expect-error using undeclared custom properties
      channel2.data!.custom = { color: 'blue', name: 'random' };
      const paginator = new ChannelPaginator({
        client,
        sort: [{ direction: 1, field: 'color' }],
      });

      expect(paginator.sortComparator(channel1, channel2)).toBeGreaterThan(0);
    });
  });

  it('matches type, id and cid of a channel never queried, whose data lacks them', () => {
    const unqueried = client.channelManager.ensure({
      type: 'messaging',
      id: 'unqueried',
      data: { custom: {} } as never,
    });
    const matches = (filters: object) =>
      new ChannelPaginator({ client, filters: filters as never }).matchesFilter(
        unqueried,
      );

    expect(unqueried.data?.type).toBeUndefined();
    expect(matches({ type: 'messaging' })).toBeTruthy();
    expect(matches({ id: 'unqueried' })).toBeTruthy();
    expect(matches({ cid: { $in: ['messaging:unqueried'] } })).toBeTruthy();
    expect(matches({ type: 'livestream' })).toBeFalsy();
  });

  it('matches members: { $in: [me] } through the membership when I am not among the loaded members', () => {
    const paginator = new ChannelPaginator({
      client,
      filters: { members: { $in: [user.id] } },
    });
    channel1.state.members = { other: { user: { id: 'other' } } };
    channel1.state.membership = { user };

    expect(paginator.matchesFilter(channel1)).toBeTruthy();
  });

  describe('recoverLoadedItems', () => {
    // The server caps a page below what the list asks for, as the real API caps at 30.
    const SERVER_PAGE_CAP = 2;
    const channelResponse = (id: string, updatedAt: string, name = id) =>
      generateChannel({
        channel: {
          id,
          name,
          type: 'messaging',
          updated_at: convertDateToTimestamp(updatedAt),
        },
      });

    const setup = async ({ pages = 2 } = {}) => {
      let serverChannels = [
        channelResponse('c1', '2024-01-04T00:00:00.000Z'),
        channelResponse('c2', '2024-01-03T00:00:00.000Z'),
        channelResponse('c3', '2024-01-02T00:00:00.000Z'),
        channelResponse('c4', '2024-01-01T00:00:00.000Z'),
      ];
      const queryChannels = vi
        .spyOn(client, 'queryChannels')
        .mockImplementation(async (options) => {
          const offset = options?.offset ?? 0;
          const limit = Math.min(options?.limit ?? SERVER_PAGE_CAP, SERVER_PAGE_CAP);
          return {
            channels: serverChannels.slice(offset, offset + limit),
            duration: '0ms',
          } as never;
        });
      const paginator = new ChannelPaginator({
        client,
        filters: {},
        sort: [{ field: 'updated_at', direction: -1 }],
        paginatorOptions: { pageSize: SERVER_PAGE_CAP },
      });
      for (let page = 0; page < pages; page++) await paginator.toTail();
      const setServerChannels = (next: typeof serverChannels) => (serverChannels = next);
      return { paginator, queryChannels, serverChannels, setServerChannels };
    };

    it('rehydrates every loaded channel, including the ones that did not move, without a new list', async () => {
      const { paginator, serverChannels, setServerChannels } = await setup();
      const itemsBefore = paginator.items!;
      const c3 = itemsBefore[2];
      expect(itemsBefore.map((channel) => channel.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
      // While away, `c3` changed in place: same position, new data.
      setServerChannels(
        serverChannels.map((response) =>
          response.channel.id === 'c3'
            ? channelResponse('c3', '2024-01-02T00:00:00.000Z', 'c3 renamed')
            : response,
        ),
      );
      const publishedItems: Channel[][] = [];
      const unsubscribe = paginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        ({ items }) => publishedItems.push(items!),
      );
      publishedItems.length = 0;

      await paginator.recoverLoadedItems();
      unsubscribe();

      // The instance the list holds carries the new data, though it sits on the second page.
      expect(paginator.items![2]).toBe(c3);
      expect(c3.data?.name).toBe('c3 renamed');
      // Nothing moved, so the list keeps its array: no publish hands out a new one.
      expect(paginator.items).toBe(itemsBefore);
      expect(publishedItems).toEqual([]);
    });

    it('drops a loaded channel that another list owns now, though its own query still returns it', async () => {
      const { paginator, serverChannels, setServerChannels } = await setup();
      const owner = new ChannelPaginator({ client, filters: {} });
      // `c3` belongs to `owner` once its data says so; every other channel stays with this list.
      client.channelManager.setOwnershipResolver(({ channel }) =>
        channel.data?.name === 'c3 for the owner' ? [owner.id] : [paginator.id],
      );
      client.channelManager.setPaginators([paginator, owner]);
      setServerChannels(
        serverChannels.map((response) =>
          response.channel.id === 'c3'
            ? channelResponse('c3', '2024-01-02T00:00:00.000Z', 'c3 for the owner')
            : response,
        ),
      );

      await paginator.recoverLoadedItems();

      expect(paginator.items!.map((channel) => channel.id)).toEqual(['c1', 'c2', 'c4']);
    });

    it('leaves pagination open, so the next page finds the end of the list itself', async () => {
      const { paginator, queryChannels } = await setup();
      // the list is loaded to its end: the next page came back empty
      await paginator.toTail();
      expect(paginator.hasMoreTail).toBe(false);

      await paginator.recoverLoadedItems();
      expect(paginator.hasMoreTail).toBe(true);
      const requests = queryChannels.mock.calls.length;
      await paginator.toTail();

      expect(queryChannels.mock.calls.length).toBe(requests + 1);
      expect(paginator.hasMoreTail).toBe(false);
    });

    it('keeps paginating when the last recovery request asked for less than a page', async () => {
      const { paginator, serverChannels, setServerChannels } = await setup();
      setServerChannels([
        ...serverChannels,
        channelResponse('c5', '2023-12-31T00:00:00.000Z'),
      ]);
      // a short third page: 5 loaded, and the list believes it reached its end
      await paginator.toTail();
      expect(paginator.hasMoreTail).toBe(false);
      setServerChannels([
        ...serverChannels,
        channelResponse('c5', '2023-12-31T00:00:00.000Z'),
        channelResponse('c6', '2023-12-30T00:00:00.000Z'),
      ]);

      // the recovery's last request asks for the 1 channel still to cover, less than a page
      await paginator.recoverLoadedItems();
      await paginator.toTail();

      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c1',
        'c2',
        'c3',
        'c4',
        'c5',
        'c6',
      ]);
    });

    it('shows the first page in its new order before the later pages arrive', async () => {
      const { paginator, queryChannels, serverChannels, setServerChannels } =
        await setup();
      // while away, c3 got a message and is now the first channel
      setServerChannels([
        channelResponse('c3', '2024-01-05T00:00:00.000Z'),
        ...serverChannels.filter((response) => response.channel.id !== 'c3'),
      ]);
      const answer = queryChannels.getMockImplementation()!;
      let releaseSecondPage = () => {};
      queryChannels.mockImplementation((options) => {
        if (!options?.offset) return answer(options);
        return new Promise(
          (resolve) => (releaseSecondPage = () => resolve(answer(options))),
        );
      });
      // only the recovery's own requests count below
      queryChannels.mockClear();

      const recovery = paginator.recoverLoadedItems();
      await vi.waitFor(() => expect(queryChannels.mock.lastCall?.[0]?.offset).toBe(2));

      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c3',
        'c1',
        'c2',
        'c4',
      ]);
      releaseSecondPage();
      await recovery;
    });

    it('recovers once a next page already in flight lands', async () => {
      const { paginator, queryChannels, serverChannels, setServerChannels } =
        await setup();
      setServerChannels([
        ...serverChannels,
        channelResponse('c5', '2023-12-31T00:00:00.000Z'),
        channelResponse('c6', '2023-12-30T00:00:00.000Z'),
      ]);
      const answer = queryChannels.getMockImplementation()!;
      let releaseNextPage = () => {};
      queryChannels.mockImplementationOnce(
        (options) =>
          new Promise((resolve) => (releaseNextPage = () => resolve(answer(options)))),
      );
      // the list end asked for the next page just before the connection dropped
      const nextPage = paginator.toTail();
      await vi.waitFor(() => expect(paginator.isLoading).toBe(true));
      // while away, c2 was deleted
      setServerChannels([
        serverChannels[0],
        ...serverChannels.slice(2),
        channelResponse('c5', '2023-12-31T00:00:00.000Z'),
        channelResponse('c6', '2023-12-30T00:00:00.000Z'),
      ]);

      const recovery = paginator.recoverLoadedItems();
      releaseNextPage();
      await nextPage;
      await recovery;

      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c1',
        'c3',
        'c4',
        'c5',
        'c6',
      ]);
    });

    it('keeps showing the list when a later page shares no channel with it', async () => {
      const { paginator, setServerChannels } = await setup({ pages: 0 });
      const day = (n: number) => new Date(Date.UTC(2024, 0, 10 - n)).toISOString();
      const all = Array.from({ length: 8 }, (_, i) =>
        channelResponse(`c${i + 1}`, day(i)),
      );
      setServerChannels(all);
      for (let page = 0; page < 3; page++) await paginator.toTail();
      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c1',
        'c2',
        'c3',
        'c4',
        'c5',
        'c6',
      ]);
      // while away, c2-c4 were deleted: the last page (c8) holds no channel the list loaded
      setServerChannels(
        all.filter((response) => !['c2', 'c3', 'c4'].includes(response.channel.id!)),
      );

      await paginator.recoverLoadedItems();

      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c1',
        'c5',
        'c6',
        'c7',
        'c8',
      ]);
    });

    it('removes a gone channel at the end of a list loaded to its end', async () => {
      const { paginator, serverChannels, setServerChannels } = await setup();
      // while away, c4, the last channel, was deleted: the second page comes back short
      setServerChannels(serverChannels.slice(0, 3));

      await paginator.recoverLoadedItems();

      expect(paginator.items!.map((channel) => channel.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it('re-queries at most 150 channels and keeps the ones loaded past them', async () => {
      let serverChannels = Array.from({ length: 160 }, (_, i) =>
        channelResponse(
          `d${i}`,
          new Date(Date.UTC(2024, 0, 1) - i * 60_000).toISOString(),
        ),
      );
      const queryChannels = vi
        .spyOn(client, 'queryChannels')
        .mockImplementation(async (options) => {
          const offset = options?.offset ?? 0;
          const limit = Math.min(options?.limit ?? 30, 30);
          return {
            channels: serverChannels.slice(offset, offset + limit),
            duration: '0ms',
          } as never;
        });
      const paginator = new ChannelPaginator({
        client,
        filters: {},
        sort: [{ field: 'updated_at', direction: -1 }],
        paginatorOptions: { pageSize: 30 },
      });
      while (paginator.hasMoreTail) await paginator.toTail();
      expect(paginator.items).toHaveLength(160);
      // while away, d1-d3 were deleted: the 150 re-queried now end at d152, and d153-d159 sort
      // below them though they are still there
      serverChannels = serverChannels.filter(
        (response) => !['d1', 'd2', 'd3'].includes(response.channel.id!),
      );
      queryChannels.mockClear();

      await paginator.recoverLoadedItems();

      expect(queryChannels.mock.calls.map(([options]) => options?.offset)).toEqual([
        0, 30, 60, 90, 120,
      ]);
      expect(paginator.items!.map((channel) => channel.id)).toEqual(
        serverChannels.map((response) => response.channel.id),
      );
      expect(paginator.hasMoreTail).toBe(true);
    });

    it('publishes a list it recovers in one page once', async () => {
      const { paginator } = await setup({ pages: 1 });
      const setActiveInterval = vi.spyOn(paginator, 'setActiveInterval');

      await paginator.recoverLoadedItems();

      const publishing = setActiveInterval.mock.calls.filter(
        ([, options]) => options?.updateState !== false,
      );
      expect(publishing).toHaveLength(1);
    });

    it('shows a reorder on a later page once the last page is in', async () => {
      const { paginator, serverChannels, setServerChannels } = await setup();
      // while away, c4 moved above c3: both stay on the second page and nothing leaves the list
      setServerChannels([
        ...serverChannels.slice(0, 2),
        channelResponse('c4', '2024-01-02T12:00:00.000Z'),
        channelResponse('c3', '2024-01-02T00:00:00.000Z'),
      ]);

      await paginator.recoverLoadedItems();

      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c1',
        'c2',
        'c4',
        'c3',
      ]);
    });

    it('shows a first page that shares no channel with the loaded list', async () => {
      const { paginator, setServerChannels } = await setup();
      // while away, c1 and c2 left and two channels the list never loaded took the top
      setServerChannels([
        channelResponse('y1', '2024-01-06T00:00:00.000Z'),
        channelResponse('y2', '2024-01-05T00:00:00.000Z'),
        channelResponse('c3', '2024-01-02T00:00:00.000Z'),
        channelResponse('c4', '2024-01-01T00:00:00.000Z'),
      ]);

      await paginator.recoverLoadedItems();

      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'y1',
        'y2',
        'c3',
        'c4',
      ]);
    });

    it('shows the channels a list that was empty at the reconnect gained', async () => {
      const { paginator, setServerChannels } = await setup({ pages: 0 });
      setServerChannels([]);
      await paginator.toTail();
      expect(paginator.items).toEqual([]);
      setServerChannels([
        channelResponse('e1', '2024-01-02T00:00:00.000Z'),
        channelResponse('e2', '2024-01-01T00:00:00.000Z'),
      ]);

      await paginator.recoverLoadedItems();

      expect(paginator.items!.map((channel) => channel.id)).toEqual(['e1', 'e2']);
    });

    it('queries a next page asked for while recovering once the recovery ends', async () => {
      const { paginator, queryChannels, serverChannels, setServerChannels } =
        await setup();
      setServerChannels([
        ...serverChannels,
        channelResponse('c5', '2023-12-31T00:00:00.000Z'),
        channelResponse('c6', '2023-12-30T00:00:00.000Z'),
      ]);
      const answer = queryChannels.getMockImplementation()!;
      let releaseSecondPage = () => {};
      queryChannels.mockImplementation((options) => {
        if (options?.offset !== 2) return answer(options);
        return new Promise(
          (resolve) => (releaseSecondPage = () => resolve(answer(options))),
        );
      });
      queryChannels.mockClear();

      const recovery = paginator.recoverLoadedItems();
      await vi.waitFor(() => expect(queryChannels.mock.lastCall?.[0]?.offset).toBe(2));
      // the list end reached while the second page is in flight
      expect(await paginator.toTail()).toBeUndefined();
      releaseSecondPage();
      await recovery;
      await vi.waitFor(() => expect(paginator.items).toHaveLength(6));

      // the next page is queried from where the recovery left the list, not from its first page
      expect(
        queryChannels.mock.calls.map(([options]) => [options?.offset, options?.limit]),
      ).toEqual([
        [0, 4],
        [2, 2],
        [4, 2],
      ]);
      expect(paginator.items!.map((channel) => channel.id)).toEqual([
        'c1',
        'c2',
        'c3',
        'c4',
        'c5',
        'c6',
      ]);
    });
  });
});
