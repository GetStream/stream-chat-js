import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { getServerChannel } from '../../helpers/server';
import { retry } from '../../helpers/wait';

const DOCS = '_default/03-channels/02-query_channels.md';
const CHANNEL_COUNT = 12;

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const thierry = uniqueId('thierry');
  const other = uniqueId('other');
  // Channels thierry is a member of, newest message last.
  const channelIds = Array.from({ length: CHANNEL_COUNT }, () => uniqueId('channel'));
  // The docs' placeholder values.
  const userId = thierry;
  const userID = thierry;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let chatClient: StreamChat;

  // Expected order for `last_message_at: -1`: last created first.
  const newestFirst = [...channelIds].reverse().map((id) => `messaging:${id}`);

  beforeAll(async () => {
    cleanup.users.push(thierry, other);
    await serverClient.upsertUsers([{ id: other }]);
    chatClient = await getClientSideClient({ id: thierry });
    for (const id of channelIds) {
      cleanup.channels.push(`messaging:${id}`);
      const channel = serverClient.chat.channel('messaging', id);
      await channel.getOrCreate({
        data: {
          members: [{ user_id: thierry }, { user_id: other }],
          created_by_id: other,
        },
      });
      await channel.sendMessage({ message: { text: `hello ${id}`, user_id: other } });
    }
  });

  afterAll(async () => {
    await disconnectClients(chatClient);
    await cleanup.run();
  });

  it('queries channels', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="" tab="JavaScript" index=1
    // COPY: thierry="thierry"
    const channels = await chatClient.queryChannels(
      { type: 'messaging', members: { $in: [thierry] } },
      [{ last_message_at: -1 }],
      { limit: 15 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst);
    expect(channels[0].state.messages.length).toBeGreaterThan(0);
  });

  it('filters messaging channels by member', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Messaging and Team Channels" tab="JavaScript" index=1
    // COPY: thierry="thierry"
    const filter = { members: { $in: [thierry] }, type: 'messaging' };
    // #endregion snippet

    const channels = await chatClient.queryChannels(filter, {}, { limit: 30 });
    expect(channels.map((c) => c.cid).sort()).toEqual([...newestFirst].sort());
  });

  it('paginates with limit and offset', async () => {
    const authClient = chatClient;

    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Pagination" tab="JavaScript" index=1
    // COPY: thierry="thierry"
    // Get channels 11-30
    const channels = await authClient.queryChannels(
      { members: { $in: [thierry] } },
      { last_message_at: -1 },
      { limit: 20, offset: 10 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst.slice(10));
  });

  it('creates a channel with create, query or watch', async () => {
    const channelId = uniqueId('watch');
    cleanup.channels.push(`messaging:${channelId}`);
    const channel = chatClient.channel('messaging', channelId);

    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Channel Creation and Watching" tab="JavaScript" index=1
    channel.create();
    channel.query();
    channel.watch();
    // #endregion snippet

    const created = await retry(
      () => getServerChannel(serverClient, `messaging:${channelId}`),
      { timeout: 10000, interval: 500 },
    );
    expect(created.channel?.created_by?.id).toBe(thierry);
  });

  it('filters by cid, by type and members, or by type alone', async () => {
    const channelCID = `messaging:${channelIds[0]}`;

    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Filter Best Practices" tab="JavaScript" index=1
    // Most performant: Filter by CID
    const cidFilter = { cid: channelCID };

    // Recommended for social messaging
    const membersFilter = { type: 'messaging', members: { $in: [userID] } };

    // Not recommended: type alone
    const typeFilter = { type: 'messaging' };
    // #endregion snippet

    const byCid = await chatClient.queryChannels(cidFilter);
    expect(byCid.map((c) => c.cid)).toEqual([channelCID]);
    const byMembers = await chatClient.queryChannels(membersFilter, {}, { limit: 30 });
    expect(byMembers).toHaveLength(CHANNEL_COUNT);
    const byType = await chatClient.queryChannels(typeFilter, {}, { limit: 1 });
    expect(byType.every((c) => c.type === 'messaging')).toBe(true);
  });

  it('sorts by last_message_at', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Sort Best Practices" tab="JavaScript" index=1
    const sort = { last_message_at: -1 };
    // #endregion snippet

    const channels = await chatClient.queryChannels(
      { members: { $in: [thierry] } },
      { last_message_at: sort.last_message_at < 0 ? -1 : 1 },
      { limit: 30 },
    );
    expect(channels.map((c) => c.cid)).toEqual(newestFirst);
  });

  it('builds broad and nested filters', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Bad Pattern: Overly Broad or Complex Filters" tab="JavaScript" index=1
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
    const broad = await chatClient.queryChannels(broadFilter, {}, { limit: 1 });
    expect(broad.every((c) => c.type === 'messaging')).toBe(true);
    // `nestedFilter.$and` is inferred as a plain array, not the `ArrayOneOrMore` tuple
    // `ChannelFilters` asks for, so send it as the raw request body. Filtering on
    // `disabled` needs the ReadDisabledChannel permission, which users don't have
    // (the server test runs it).
    await expect(
      chatClient.post(`${chatClient.baseURL}/channels`, {
        filter_conditions: nestedFilter,
        limit: 1,
      }),
    ).rejects.toThrow(/ReadDisabledChannel/);
  });

  describe('predefined filters', () => {
    const userMessagingChannels = uniqueId('user_messaging_channels');

    beforeAll(async () => {
      cleanup.add(() =>
        serverClient.chat.deletePredefinedFilter({ name: userMessagingChannels }),
      );
      await serverClient.chat.createPredefinedFilter({
        name: userMessagingChannels,
        operation: 'QueryChannels',
        filter: { type: 'messaging', members: { $in: ['{{user_id}}'] } },
      });
    });

    it('queries with a predefined filter in production', async () => {
      // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Using Predefined Filters in Production" tab="JavaScript" index=1
      // COPY: userMessagingChannels="user_messaging_channels"
      // Production-ready: Use Predefined Filter
      const channels = await chatClient.queryChannels(
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

      // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Using Predefined Filters" tab="JavaScript" index=1
      // COPY: userMessagingChannels="user_messaging_channels", user123="user123"
      const channels = await chatClient.queryChannels(
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
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Query Complexity" tab="JavaScript" index=1
    // RECOMMENDED: Simple, selective filter with indexed fields
    const filter = {
      type: 'messaging',
      members: { $in: [userId] },
      last_message_at: { $gte: thirtyDaysAgo },
    };
    // #endregion snippet

    const channels = await chatClient.queryChannels(filter, {}, { limit: 30 });
    expect(channels).toHaveLength(CHANNEL_COUNT);
  });

  it('paginates with a members filter', async () => {
    // #region snippet docs="_default/03-channels/02-query_channels.md" heading="Pagination Best Practices" tab="JavaScript" index=1
    // Efficient pagination with members filter
    const channels = await chatClient.queryChannels(
      { type: 'messaging', members: { $in: [userId] } },
      { last_message_at: -1 },
      { limit: 20 },
    );
    // #endregion snippet

    expect(channels.map((c) => c.cid)).toEqual(newestFirst);
  });
});
