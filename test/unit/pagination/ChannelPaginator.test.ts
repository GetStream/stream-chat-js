import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Channel,
  type ChannelFilters,
  ChannelOptions,
  ChannelPaginator,
  ChannelSort,
  DEFAULT_PAGINATION_OPTIONS,
  type FilterBuilderGenerators,
  type StreamChat,
} from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';
import type { FieldToDataResolver } from '../../../src/pagination/types.normalization';

const user = { id: 'custom-id' };

describe('ChannelPaginator', () => {
  let client: StreamChat;
  let channel1: Channel;
  let channel2: Channel;

  beforeEach(() => {
    client = getClientWithUser(user);

    channel1 = new Channel(client, 'type', 'id1', {});
    channel1.state.last_message_at = new Date('1972-01-01T08:39:35.235Z');
    channel1.data!.updated_at = '1972-01-01T08:39:35.235Z';

    channel2 = new Channel(client, 'type', 'id1', {});
    channel2.state.last_message_at = new Date('1971-01-01T08:39:35.235Z');
    channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';
  });

  it('initiates with defaults', () => {
    const paginator = new ChannelPaginator({ client });
    expect(paginator.pageSize).toBe(DEFAULT_PAGINATION_OPTIONS.pageSize);
    expect(paginator.state.getLatestValue()).toEqual({
      hasNext: true,
      hasPrev: true,
      isLoading: false,
      items: undefined,
      lastQueryError: undefined,
      cursor: undefined,
      offset: 0,
    });
    expect(paginator.id.startsWith('channel-paginator')).toBeTruthy();
    expect(paginator.sortComparator).toBeDefined();

    channel1.state.last_message_at = new Date('1970-01-01T08:39:35.235Z');
    channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';

    channel2.state.last_message_at = new Date('1971-01-01T08:39:35.235Z');
    channel2.data!.updated_at = '1971-01-01T08:39:35.235Z';

    expect(paginator.sortComparator(channel1, channel2)).toBe(1); // channel2 comes before channel1
    expect(paginator.filterBuilder.buildFilters()).toStrictEqual({});
    expect(
      paginator.filterBuilder.buildFilters({ baseFilters: paginator.filters }),
    ).toStrictEqual({});
    // @ts-expect-error accessing protected property
    expect(paginator._filterFieldToDataResolvers).toHaveLength(4);
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

    const paginator = new ChannelPaginator({
      client,
      id: customId,
      filterBuilderOptions: {
        initialContext: initialFilterBuilderContext,
        initialFilterConfig: filterGenerators,
      },
      filters: { type: 'type' },
      paginatorOptions: { pageSize: 2 },
      requestOptions: { member_limit: 5 },
      sort: { created_at: 1 },
    });
    expect(paginator.pageSize).toBe(2);
    expect(paginator.state.getLatestValue()).toEqual({
      hasNext: true,
      hasPrev: true,
      isLoading: false,
      items: undefined,
      lastQueryError: undefined,
      cursor: undefined,
      offset: 0,
    });
    expect(paginator.id.startsWith(customId)).toBeTruthy();

    expect(paginator.sortComparator(channel1, channel2)).toBe(-1); // channel1 comes before channel2
    expect(paginator.filterBuilder.buildFilters()).toStrictEqual({
      ...initialFilterBuilderContext,
    });
    expect(
      paginator.filterBuilder.buildFilters({ baseFilters: paginator.filters }),
    ).toStrictEqual({
      type: 'type',
      ...initialFilterBuilderContext,
    });
    // @ts-expect-error accessing protected property
    expect(paginator._filterFieldToDataResolvers).toHaveLength(4);
  });

  describe('sortComparator', () => {
    const changeOrder = 1;
    const keepOrder = -1;
    it('should sort be default sort', () => {
      const paginator = new ChannelPaginator({ client });
      expect(paginator.sortComparator(channel1, channel2)).toBe(keepOrder);

      channel1.state.last_message_at = new Date('1970-01-01T08:39:35.235Z');
      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';

      channel2.state.last_message_at = new Date('1971-01-01T08:39:35.235Z');
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
      channel1.state.last_message_at = new Date('1975-01-01T08:39:35.235Z');
      channel1.data!.updated_at = '1970-01-01T08:39:35.235Z';
      channel2.state.last_message_at = new Date('1971-01-01T08:39:35.235Z');
      channel2.data!.updated_at = '1973-01-01T08:39:35.235Z';
      expect(paginator.sortComparator(channel1, channel2)).toBe(changeOrder);

      // compares channel2.state.last_message_at with channel1.data!.updated_at
      channel1.state.last_message_at = new Date('1975-01-01T08:39:35.235Z');
      channel1.data!.updated_at = '1976-01-01T08:39:35.235Z';
      channel2.state.last_message_at = new Date('1978-01-01T08:39:35.235Z');
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
    const stateAfterQuery = {
      items: [channel1, channel2],
      hasNext: false,
      hasPrev: false,
      offset: 10,
      isLoading: false,
      lastQueryError: undefined,
      cursor: undefined,
    };
    it('filters reset state', () => {
      const paginator = new ChannelPaginator({ client });
      paginator.state.partialNext(stateAfterQuery);
      expect(paginator.state.getLatestValue()).toStrictEqual(stateAfterQuery);
      paginator.filters = {};
      expect(paginator.state.getLatestValue()).toStrictEqual(paginator.initialState);
    });
    it('sort reset state', () => {
      const paginator = new ChannelPaginator({ client });
      paginator.state.partialNext(stateAfterQuery);
      expect(paginator.state.getLatestValue()).toStrictEqual(stateAfterQuery);
      paginator.sort = {};
      expect(paginator.state.getLatestValue()).toStrictEqual(paginator.initialState);
    });
    it('options reset state', () => {
      const paginator = new ChannelPaginator({ client });
      paginator.state.partialNext(stateAfterQuery);
      expect(paginator.state.getLatestValue()).toStrictEqual(stateAfterQuery);
      paginator.options = {};
      expect(paginator.state.getLatestValue()).toStrictEqual(paginator.initialState);
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
      );
    });
  });
});
