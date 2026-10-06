import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { retry } from '../../helpers/wait';

describe('_default/04-messages/06-search.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const otherUserId = uniqueId('other');
  const searchChannelId = uniqueId('search');
  const otherChannelId = uniqueId('search-other');
  const pagingChannelId = uniqueId('search-paging');
  const myChannelCid = `messaging:${pagingChannelId}`;
  const PAGING_COUNT = 15;
  let client: StreamChat;
  const ids: Record<string, string> = {};
  /** Ids of the paging channel's messages, in send order (`my_custom_field` = index). */
  const pagingIds: string[] = [];

  beforeAll(async () => {
    cleanup.users.push(userId, otherUserId);
    await serverClient.upsertUser({ id: otherUserId });
    client = await getClientSideClient({ id: userId });

    const channel = client.channel('messaging', searchChannelId, { members: [userId] });
    cleanup.channels.push(`messaging:${searchChannelId}`);
    await channel.create();
    ids.text = (
      await channel.sendMessage({ text: 'supercalifragilisticexpialidocious' })
    ).message.id;
    ids.plain = (await channel.sendMessage({ text: 'superb, no attachment' })).message.id;
    // Sent server-side: client-side attachments need the `create-attachment` grant.
    ids.attachment = (
      await serverClient.channel('messaging', searchChannelId).sendMessage({
        text: 'super picture',
        user_id: userId,
        attachments: [{ type: 'image', image_url: 'https://getstream.io/random.png' }],
      })
    ).message.id;

    // A channel the user isn't a member of: its messages must not show up.
    const otherChannel = serverClient.channel('messaging', otherChannelId, {
      members: [otherUserId],
      created_by_id: otherUserId,
    });
    cleanup.channels.push(`messaging:${otherChannelId}`);
    await otherChannel.create();
    ids.other = (
      await otherChannel.sendMessage({
        text: 'supercalifragilisticexpialidocious',
        user_id: otherUserId,
        attachments: [{ type: 'image', image_url: 'https://getstream.io/random.png' }],
      })
    ).message.id;

    const pagingChannel = client.channel('messaging', pagingChannelId, {
      members: [userId],
    });
    cleanup.channels.push(myChannelCid);
    await pagingChannel.create();
    for (let i = 0; i < PAGING_COUNT; i++) {
      const { message } = await pagingChannel.sendMessage({
        text: `supercali ${i}`,
        my_custom_field: i,
      });
      pagingIds.push(message.id);
    }

    // Search indexing is eventually consistent: wait until every message is searchable.
    await retry(async () => {
      const [a, b] = await Promise.all([
        client.search(
          { cid: `messaging:${searchChannelId}` },
          { text: { $autocomplete: 'super' } },
        ),
        client.search({ cid: myChannelCid }, { text: { $autocomplete: 'supercali' } }),
      ]);
      expect(a.results).toHaveLength(3);
      expect(b.results).toHaveLength(PAGING_COUNT);
    });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('searches messages', async () => {
    // #region snippet docs="_default/04-messages/06-search.md" heading="Searching Messages" tab="JavaScript" index=1
    // COPY: userId="john"
    // Search for messages containing text
    const results = await client.search(
      { members: { $in: [userId] } },
      'supercalifragilisticexpialidocious',
      { limit: 10 },
    );

    // Search with message filters
    const filtered = await client.search(
      { members: { $in: [userId] } },
      { text: { $autocomplete: 'super' }, attachments: { $exists: true } },
      { limit: 10 },
    );
    // #endregion snippet

    expect(results.results.map((r) => r.message.id)).toEqual([ids.text]);
    expect(filtered.results.map((r) => r.message.id)).toEqual([ids.attachment]);
  });

  it('paginates search results with a cursor', async () => {
    // #region snippet docs="_default/04-messages/06-search.md" heading="Pagination" tab="JavaScript" index=1
    // COPY: myChannelCid="messaging:my-channel"
    const channelFilters = { cid: myChannelCid };
    const messageFilters = { text: { $autocomplete: 'supercali' } };

    // First page with custom sorting
    const page1 = await client.search(channelFilters, messageFilters, {
      sort: [{ relevance: -1 }, { updated_at: 1 }, { my_custom_field: -1 }],
      limit: 10,
    });

    // Next page using cursor
    const page2 = await client.search(channelFilters, messageFilters, {
      limit: 10,
      next: page1.next,
    });

    // Previous page
    const page1Again = await client.search(channelFilters, messageFilters, {
      limit: 10,
      next: page2.previous,
    });
    // #endregion snippet

    const idsOf = (page: typeof page1) => page.results.map((r) => r.message.id);
    expect(idsOf(page1)).toEqual(pagingIds.slice(0, 10));
    expect(idsOf(page2)).toEqual(pagingIds.slice(10));
    expect(page2.next).toBeUndefined();
    // The previous page has the same messages as page 1, but the API returns them in
    // reverse order, so compare them as sets.
    expect([...idsOf(page1Again)].sort()).toEqual([...idsOf(page1)].sort());
  });
});
