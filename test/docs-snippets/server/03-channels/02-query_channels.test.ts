import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

const CHANNEL_COUNT = 12;

describe('_default/03-channels/02-query_channels.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const thierry = uniqueId('thierry');
  const other = uniqueId('other');
  const channelIds = Array.from({ length: CHANNEL_COUNT }, () => uniqueId('channel'));
  // Expected order for `last_message_at: -1`: last created first.
  const newestFirst = [...channelIds].reverse().map((id) => `messaging:${id}`);
  // The docs' placeholder values.
  const userId = thierry;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    cleanup.users.push(thierry, other);
    await serverClient.upsertUsers([{ id: thierry }, { id: other }]);
    for (const id of channelIds) {
      cleanup.channels.push(`messaging:${id}`);
      const channel = serverClient.channel('messaging', id, {
        members: [thierry, other],
        created_by_id: other,
      });
      await channel.create();
      await channel.sendMessage({ text: `hello ${id}`, user_id: other });
    }
  });

  afterAll(() => cleanup.run());

  it('queries channels', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="" tab="Node.js" index=1
    // COPY: thierry="thierry"
    const channels = await serverClient.queryChannels(
      { type: 'messaging', members: { $in: [thierry] } },
      [{ last_message_at: -1 }],
      { limit: 15 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst);
    expect(channels[0].state.messages.length).toBeGreaterThan(0);
  });

  it('filters messaging channels by member', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Messaging and Team Channels" tab="Node.js" index=1
    // COPY: thierry="thierry"
    const filter = { members: { $in: [thierry] }, type: 'messaging' };
    // #endregion snippet

    const channels = await serverClient.queryChannels(filter, {}, { limit: 30 });
    expect(channels.map((c) => c.cid).sort()).toEqual([...newestFirst].sort());
  });

  it('paginates with limit and offset', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Pagination" tab="Node.js" index=1
    // COPY: thierry="thierry"
    // Get channels 11-30
    const channels = await serverClient.queryChannels(
      { members: { $in: [thierry] } },
      { last_message_at: -1 },
      { limit: 20, offset: 10 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst.slice(10));
  });

  it('uses a selective filter with indexed fields', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Good Pattern: Selective Filter with Indexed Fields" tab="Node.js" index=1
    // ✅ GOOD: Selective filter using indexed fields
    const channels = await serverClient.queryChannels(
      {
        type: 'messaging',
        members: { $in: [userId] },
        last_message_at: { $gte: thirtyDaysAgo },
      },
      { last_message_at: -1 },
      { limit: 20 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst);
  });

  it('builds broad and nested filters', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Bad Pattern: Overly Broad or Complex Filters" tab="Node.js" index=1
    // ❌ BAD: Type-only filter (too broad)
    const broadFilter = { type: 'messaging' };

    // ❌ BAD: Deep nesting of logical operators
    const nestedFilter = {
      $and: [
        {
          $or: [{ frozen: true }, { disabled: true }],
        },
        {
          $or: [{ hidden: true }, { muted: true }],
        },
      ],
    };
    // #endregion snippet

    // Both are valid filters: they work, they are just slow at scale.
    const broad = await serverClient.queryChannels(broadFilter, {}, { limit: 1 });
    expect(broad.every((c) => c.type === 'messaging')).toBe(true);
    // `nestedFilter.$and` is inferred as a plain array, not the `ArrayOneOrMore` tuple
    // `ChannelFilters` asks for, so send it as the raw request body. `hidden` / `muted`
    // are per-user, so the server side needs a `user_id`.
    const nested = await serverClient.post<{ channels: unknown[] }>(
      `${serverClient.baseURL}/channels`,
      { filter_conditions: nestedFilter, user_id: thierry, limit: 1 },
    );
    expect(Array.isArray(nested.channels)).toBe(true);
  });

  describe('predefined filters', () => {
    const userMessagingChannels = uniqueId('user_messaging_channels');

    beforeAll(async () => {
      cleanup.add(() => serverClient.deletePredefinedFilter(userMessagingChannels));
      await serverClient.createPredefinedFilter({
        name: userMessagingChannels,
        operation: 'QueryChannels',
        filter: { type: 'messaging', members: { $in: ['{{user_id}}'] } },
      });
    });

    it('queries with a predefined filter in production', async () => {
      // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Using Predefined Filters in Production" tab="Node.js" index=1
      // COPY: userMessagingChannels="user_messaging_channels"
      // Production-ready: Use Predefined Filter
      const channels = await serverClient.queryChannels(
        {}, // filter_conditions ignored with predefined_filter
        { last_message_at: -1 },
        {
          predefined_filter: userMessagingChannels,
          filter_values: { user_id: userId },
          limit: 20,
        },
      );
      // #endregion snippet

      expect(channels.map((c) => c.cid)).toEqual(newestFirst);
    });

    it('queries with a predefined filter', async () => {
      const user123 = thierry;

      // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Using Predefined Filters" tab="Node.js" index=1
      // COPY: userMessagingChannels="user_messaging_channels", user123="user123"
      const channels = await serverClient.queryChannels(
        {}, // filter_conditions ignored with predefined_filter
        { last_message_at: -1 },
        {
          predefined_filter: userMessagingChannels,
          filter_values: { user_id: user123 },
          limit: 20,
        },
      );
      // #endregion snippet

      expect(channels.map((c) => c.cid)).toEqual(newestFirst);
    });
  });

  it('uses a simple, selective filter', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Query Complexity" tab="Node.js" index=1
    // RECOMMENDED: Simple, selective filter with indexed fields
    const filter = {
      type: 'messaging',
      members: { $in: [userId] },
      last_message_at: { $gte: thirtyDaysAgo },
    };
    // #endregion snippet

    const channels = await serverClient.queryChannels(filter, {}, { limit: 30 });
    expect(channels).toHaveLength(CHANNEL_COUNT);
  });

  it('paginates with a members filter', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Pagination Best Practices" tab="Node.js" index=1
    // Efficient pagination with members filter
    const channels = await serverClient.queryChannels(
      { type: 'messaging', members: { $in: [userId] } },
      { last_message_at: -1 },
      { limit: 20 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst);
  });
});
