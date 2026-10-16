import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nsToDate } from '../../../../../src';
import type {
  Channel,
  StreamChat,
  TimestampNS,
  UpdateMessagePartialResponse,
} from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

/** Server timestamps are unix nanoseconds; '' when unset. */
const isoString = (timestamp: TimestampNS | undefined) =>
  timestamp === undefined ? '' : nsToDate(timestamp).toISOString();

describe('_default/04-messages/05-pinned_messages.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('general');
  const pagingChannelId = uniqueId('pinned-paging');
  let client: StreamChat;
  let channel: Channel;
  let pagingChannel: Channel;
  /** Ids of the pinned messages in `pagingChannel`, in pin order (oldest first). */
  const pinnedIds: string[] = [];

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId, { members: [{ user_id: userId }] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();

    pagingChannel = client.channel('messaging', pagingChannelId, {
      members: [{ user_id: userId }],
    });
    cleanup.channels.push(`messaging:${pagingChannelId}`);
    await pagingChannel.create();
    // 12 pinned messages, pinned one at a time so `pinned_at` follows this order.
    for (let i = 0; i < 12; i++) {
      const { message } = await pagingChannel.sendMessage({
        message: { text: `Pinned ${i}` },
      });
      await client.pinMessage(message);
      pinnedIds.push(message.id);
    }
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('pins and unpins messages', async () => {
    const pinSpy = vi.spyOn(client, 'pinMessage');
    const unpinSpy = vi.spyOn(client, 'unpinMessage');
    const before = Date.now();

    // #region snippet docs="chat/_default/04-messages/05-pinned_messages.md" heading="Pinning and Unpinning Messages" tab="JavaScript" index=1
    // Create a pinned message
    const { message } = await channel.sendMessage({
      message: {
        text: 'Important announcement',
        pinned: true,
        pin_expires: new Date('2077-01-01T00:00:00Z'),
      },
    });

    // Pin an existing message for 120 seconds
    await client.pinMessage(message, 120);

    // Pin with a specific expiration date
    await client.pinMessage(message, '2077-01-01T00:00:00Z');

    // Pin indefinitely (remove expiration)
    await client.pinMessage(message, null);

    // Unpin a message
    await client.unpinMessage(message);
    // #endregion snippet

    expect(message.pinned).toBe(true);
    expect(isoString(message.pin_expires)).toMatch(/^2077-01-01T00:00:00/);
    expect(message.pinned_by?.id).toBe(userId);

    const [timed, dated, indefinite]: UpdateMessagePartialResponse[] = await Promise.all(
      pinSpy.mock.results.map((r) => r.value),
    );
    pinSpy.mockRestore();
    expect(timed.message?.pinned).toBe(true);
    const timedExpires = new Date(isoString(timed.message?.pin_expires)).getTime();
    expect(timedExpires).toBeGreaterThanOrEqual(before + 110_000);
    expect(timedExpires).toBeLessThanOrEqual(Date.now() + 130_000);
    expect(dated.message?.pinned).toBe(true);
    expect(isoString(dated.message?.pin_expires)).toMatch(/^2077-01-01T00:00:00/);
    expect(indefinite.message?.pinned).toBe(true);
    expect(indefinite.message?.pin_expires ?? null).toBeNull();

    const [unpinned]: UpdateMessagePartialResponse[] = await Promise.all(
      unpinSpy.mock.results.map((r) => r.value),
    );
    unpinSpy.mockRestore();
    expect(unpinned.message?.pinned).toBe(false);
    const { message: stored } = await serverClient.chat.getMessage({ id: message.id });
    expect(stored.pinned).toBe(false);
  });

  it('retrieves pinned messages with the channel state', async () => {
    const { message: pinned } = await channel.sendMessage({
      message: { text: 'Pinned for query', pinned: true },
    });
    await channel.sendMessage({ message: { text: 'Not pinned' } });

    // #region snippet docs="chat/_default/04-messages/05-pinned_messages.md" heading="Retrieving Pinned Messages" tab="JavaScript" index=1
    const channelState = await client.channel('messaging', channelId).query();
    const pinnedMessages = channelState.pinned_messages;
    // #endregion snippet

    const ids = pinnedMessages.map((m) => m.id);
    expect(ids).toContain(pinned.id);
    expect(pinnedMessages.every((m) => m.pinned)).toBe(true);
  });

  it('paginates pinned messages', async () => {
    const channel = pagingChannel;

    // #region snippet docs="chat/_default/04-messages/05-pinned_messages.md" heading="Paginating Pinned Messages" tab="JavaScript" index=1
    // First page, newest first
    const page1 = await channel.getPinnedMessages({
      limit: 10,
      sort: [{ field: 'pinned_at', direction: -1 }],
    });

    // Next page
    const lastMsg = page1.messages[page1.messages.length - 1];
    const page2 = await channel.getPinnedMessages({
      limit: 10,
      id_lt: lastMsg.id,
      sort: [{ field: 'pinned_at', direction: -1 }],
    });

    // Oldest first
    const ascPage = await channel.getPinnedMessages({ limit: 10 });
    const ascLastMsg = ascPage.messages[ascPage.messages.length - 1];
    const ascPage2 = await channel.getPinnedMessages({
      limit: 10,
      id_gt: ascLastMsg.id,
    });
    // #endregion snippet

    const ids = (page: { messages: { id: string }[] }) => page.messages.map((m) => m.id);
    const newestFirst = [...pinnedIds].reverse();
    expect(ids(page1)).toEqual(newestFirst.slice(0, 10));
    expect(ids(page2)).toEqual(newestFirst.slice(10));
    expect(ids(ascPage)).toEqual(pinnedIds.slice(0, 10));
    expect(ids(ascPage2)).toEqual(pinnedIds.slice(10));
  });
});
