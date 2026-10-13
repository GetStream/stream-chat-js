import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../src';
import {
  createUserToken,
  disconnectClients,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { sendServerMessage } from '../../helpers/server';
import { retry } from '../../helpers/wait';

describe('_default/05-features/03-unread.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('myid');
  const otherId = uniqueId('other');
  const channelId = uniqueId('channel');
  const token = createUserToken(userId);
  // Not connected yet: the first snippet connects it.
  const client = new StreamChat(process.env.STREAM_API_KEY as string, {
    allowServerSideConnect: true,
  });
  let firstMessageId = '';

  const sendAsOther = (text: string, mentionMe = false) =>
    sendServerMessage(serverClient, `messaging:${channelId}`, {
      text,
      user_id: otherId,
      ...(mentionMe ? { mentioned_users: [userId] } : {}),
    });

  const serverUnread = async () =>
    (await serverClient.chat.unreadCounts({ user_id: userId })).total_unread_count;

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: userId }, { id: otherId }]);
    cleanup.channels.push(`messaging:${channelId}`);
    await serverClient.chat.channel('messaging', channelId).getOrCreate({
      data: {
        created_by_id: otherId,
        members: [{ user_id: userId }, { user_id: otherId }],
      },
    });
    // unread before connecting, so the connect response has counts to show
    const message = await sendAsOther('first');
    firstMessageId = message.id;
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('reads unread counts on connect and from events', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const onSpy = vi.spyOn(client, 'on');
    try {
      // #region snippet docs="_default/05-features/03-unread.md" heading="Reading Unread Counts" tab="JavaScript" index=1
      // COPY: userId="myid"
      // Step 1: Get initial unread counts when connecting
      const user = await client.connectUser({ id: userId }, token);

      console.log(user?.me?.total_unread_count); // total unread messages
      console.log(user?.me?.unread_channels); // number of channels with unread messages
      console.log(user?.me?.unread_threads); // number of unread threads

      // Step 2: Listen to events for real-time updates
      client.on((event) => {
        if (event.total_unread_count !== undefined) {
          console.log(event.total_unread_count);
        }

        if (event.unread_channels !== undefined) {
          console.log(event.unread_channels);
        }
      });
      // #endregion snippet

      expect(user?.me?.total_unread_count).toBe(1);
      expect(user?.me?.unread_channels).toBe(1);
      expect(user?.me?.unread_threads).toBe(0);

      logSpy.mockClear();
      await sendAsOther('second');
      // notification.message_new carries the new counts
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith(2);
        return Promise.resolve();
      });
    } finally {
      logSpy.mockRestore();
      onSpy.mock.results.forEach((r) =>
        (r.value as { unsubscribe: () => void }).unsubscribe(),
      );
      onSpy.mockRestore();
    }
  });

  it('fetches unread counts without a WS connection', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/03-unread.md" heading="Unread Counts - Server side" tab="JavaScript" index=1
      const response = await client.getUnreadCount();
      console.log(response.total_unread_count); // total unread count for user
      console.log(response.channels); // distribution of unread counts across channels
      console.log(response.channel_type); // distribution of unread counts across channel types
      console.log(response.total_unread_threads_count); // total unread threads
      console.log(response.threads); // list of unread counts per thread
      // #endregion snippet

      expect(response.total_unread_count).toBe(2);
      expect(response.channels).toEqual([
        expect.objectContaining({
          channel_id: `messaging:${channelId}`,
          unread_count: 2,
        }),
      ]);
      expect(response.channel_type).toEqual([
        expect.objectContaining({ channel_type: 'messaging', unread_count: 2 }),
      ]);
      expect(response.total_unread_threads_count).toBe(0);
      expect(response.threads).toEqual([]);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('marks a channel read', async () => {
    const channel = client.channel('messaging', channelId);
    await channel.watch();
    expect(await serverUnread()).toBe(2);

    // #region snippet docs="_default/05-features/03-unread.md" heading="Mark Read" tab="JavaScript" index=1
    // mark all messages on a channel as read
    await channel.markRead();
    // #endregion snippet

    expect(await serverUnread()).toBe(0);
  });

  it('marks a channel unread from a message', async () => {
    const channel = client.channel('messaging', channelId);
    expect(await serverUnread()).toBe(0);

    // #region snippet docs="_default/05-features/03-unread.md" heading="Mark Read" tab="JavaScript" index=2
    // COPY: firstMessageId="<message_id>"
    await channel.markUnread({ message_id: firstMessageId });
    // #endregion snippet

    // the message and everything after it is unread again
    expect(await serverUnread()).toBe(2);
  });

  it('marks all channels read', async () => {
    expect(await serverUnread()).toBe(2);

    // #region snippet docs="_default/05-features/03-unread.md" heading="Mark All As Read" tab="JavaScript" index=1
    // client-side
    await client.markAllRead();
    // #endregion snippet

    expect(await serverUnread()).toBe(0);
  });

  it('shows how far other users have read', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/03-unread.md" heading="Read State - Showing how far other users have read" tab="JavaScript" index=1
      // COPY: channelId="test"
      const channel = client.channel('messaging', channelId);
      await channel.watch();

      console.log(channel.state.read);

      //{ '2fe6019c-872f-482a-989e-ecf4f786501b':
      // { user:
      //  {
      //   id: '2fe6019c-872f-482a-989e-ecf4f786501b',
      //   role: 'user',
      //   created_at: '2019-04-24T13:09:19.664378Z',
      //   updated_at: '2019-04-24T13:09:23.784642Z',
      //   last_active: '2019-04-24T13:09:23.781641Z',
      //   online: true
      //  },
      //  last_read: '2019-04-24T13:09:21.623Z',
      // }
      //}
      // #endregion snippet

      expect(Object.keys(channel.state.read).sort()).toEqual([otherId, userId].sort());
      expect(channel.state.read[userId].user.id).toBe(userId);
      expect(channel.state.read[userId].last_read).toBeInstanceOf(Date);
      expect(logSpy).toHaveBeenCalledWith(channel.state.read);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('counts unread messages and mentions of a channel', async () => {
    const channel = client.channel('messaging', channelId);
    await sendAsOther(`hi @${userId}`, true);
    // the watched channel's local state is updated by the message.new WS event
    await retry(() => {
      expect(channel.state.unreadCount).toBe(1);
      return Promise.resolve();
    });
    const countSpy = vi.spyOn(channel, 'countUnread');
    const mentionsSpy = vi.spyOn(channel, 'countUnreadMentions');
    try {
      // #region snippet docs="_default/05-features/03-unread.md" heading="Unread Messages Per Channel" tab="JavaScript" index=1
      channel.countUnread();
      // #endregion snippet

      // #region snippet docs="_default/05-features/03-unread.md" heading="Unread Mentions Per Channel" tab="JavaScript" index=1
      channel.countUnreadMentions();
      // #endregion snippet

      expect(countSpy.mock.results[0].value).toBe(1);
      expect(mentionsSpy.mock.results[0].value).toBe(1);
    } finally {
      countSpy.mockRestore();
      mentionsSpy.mockRestore();
    }
  });
});
