import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../src';
import type { Event } from '../../../../src';
import {
  createUserToken,
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { getServerUser } from '../../helpers/server';
import { retry } from '../../helpers/wait';

describe('_default/05-features/05-presence_format.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const johnId = uniqueId('john');
  const jackId = uniqueId('jack');
  const channelId = uniqueId('channel');
  let client: StreamChat;
  const extraClients: StreamChat[] = [];

  // Connects `userId` with a user token and disconnects it again, so watchers
  // with presence get `user.presence.changed` online true, then false.
  const connectAndDisconnect = async (userId: string) => {
    const other = await getClientSideClient({ id: userId });
    await other.disconnectUser();
  };

  // Records the presence events of `userId` the client receives.
  const recordPresence = (userId: string) => {
    const events: Event[] = [];
    const { unsubscribe } = client.on('user.presence.changed', (event) => {
      if (event.user?.id === userId) events.push(event);
    });
    return { events, unsubscribe };
  };

  beforeAll(async () => {
    cleanup.users.push(johnId, jackId);
    await serverClient.upsertUsers([{ id: jackId }]);
    client = await getClientSideClient({ id: johnId });
  });

  afterAll(async () => {
    await disconnectClients(client, ...extraClients);
    await cleanup.run();
  });

  it('watches and queries channels with presence', async () => {
    cleanup.channels.push(`messaging:${channelId}`);

    // #region snippet docs="_default/05-features/05-presence_format.md" heading="Listening to Presence Changes" tab="JavaScript" index=1
    // COPY: channelId="my-conversation-123", johnId="john", jackId="jack"
    // If you pass presence: true to channel.watch it will watch the list of user presence changes.
    // Note that you can listen to at most 10 users using this API call
    const channel = client.channel('messaging', channelId, {
      members: [johnId, jackId],
      color: 'green',
    });

    const state = await channel.watch({ presence: true });

    // queryChannels allows you to listen to the members of the channels that are returned
    // so this does the same thing as above and listens to online status changes for john and jack
    const channels = await client.queryChannels(
      { color: 'green' },
      { last_message_at: -1 },
      { presence: true },
    );
    // #endregion snippet

    expect(state.members.map((m) => m.user_id).sort()).toEqual([johnId, jackId].sort());
    expect(channels.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);

    const { events, unsubscribe } = recordPresence(jackId);
    try {
      await connectAndDisconnect(jackId);
      await retry(() => {
        expect(events.map((e) => e.user?.online)).toEqual([true, false]);
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
    }
  });

  it('becomes invisible and visible again', async () => {
    const userId = uniqueId('invisible');
    cleanup.users.push(userId);
    const userClient = await getClientSideClient({ id: userId });
    extraClients.push(userClient);
    // john watches a channel with the user, so he receives its presence events
    const id = uniqueId('channel');
    cleanup.channels.push(`messaging:${id}`);
    await client
      .channel('messaging', id, { members: [johnId, userId] })
      .watch({ presence: true });
    const { events, unsubscribe } = recordPresence(userId);

    try {
      const original = userClient.partialUpdateUser.bind(userClient);
      const responses: Awaited<ReturnType<typeof original>>[] = [];
      userClient.partialUpdateUser = async (update) => {
        const response = await original(update);
        responses.push(response);
        if (responses.length === 1) {
          // after "become invisible": the user is invisible and appears offline
          expect(await getServerUser(serverClient, userId)).toMatchObject({
            invisible: true,
          });
          await retry(() => {
            expect(events.map((e) => e.user?.online)).toContain(false);
            return Promise.resolve();
          });
        }
        return response;
      };
      const client = userClient;

      // #region snippet docs="_default/05-features/05-presence_format.md" heading="Invisible" tab="JavaScript" index=1
      // COPY: userId="unique_user_id"
      // become invisible
      await client.partialUpdateUser({
        id: userId,
        set: { invisible: true },
      });

      // become visible
      await client.partialUpdateUser({
        id: userId,
        set: { invisible: false },
      });
      // #endregion snippet

      expect(responses.map((r) => r.users[userId])).toMatchObject([
        { invisible: true },
        { invisible: false },
      ]);
      expect(await getServerUser(serverClient, userId)).toMatchObject({
        invisible: false,
      });
      await retry(() => {
        expect(events.at(-1)?.user?.online).toBe(true);
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
    }
  });

  it('connects as invisible', async () => {
    const userId = uniqueId('invisible');
    cleanup.users.push(userId);
    await serverClient.upsertUsers([{ id: userId }]);
    const token = createUserToken(userId);
    const client = new StreamChat(process.env.STREAM_API_KEY as string, {
      allowServerSideConnect: true,
    });
    extraClients.push(client);
    const connectSpy: { reply?: Awaited<ReturnType<typeof client.connectUser>> } = {};
    const original = client.connectUser;
    client.connectUser = async (user, tokenOrProvider) => {
      connectSpy.reply = await original(user, tokenOrProvider);
      return connectSpy.reply;
    };

    // #region snippet docs="_default/05-features/05-presence_format.md" heading="Invisible" tab="JavaScript" index=2
    // COPY: userId="unique_user_id"
    // mark a user as invisible
    await client.connectUser(
      {
        id: userId,
        invisible: true,
      },
      token,
    );
    // #endregion snippet

    expect(connectSpy.reply?.me?.invisible).toBe(true);
    expect(await getServerUser(serverClient, userId)).toMatchObject({
      invisible: true,
      online: false,
    });
  });

  it('reads the presence fields of a user', async () => {
    const presenceChannelId = uniqueId('channel');
    cleanup.channels.push(`messaging:${presenceChannelId}`);
    await serverClient.chat.channel('messaging', presenceChannelId).getOrCreate({
      data: {
        members: [{ user_id: johnId }, { user_id: jackId }],
        created_by_id: johnId,
      },
    });
    // jack is online while john reads the channel
    extraClients.push(await getClientSideClient({ id: jackId }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/05-presence_format.md" heading="Presence Data Format" tab="JavaScript" index=1
      // COPY: presenceChannelId="my-channel-id", jackId="jack"
      const channel = client.channel('messaging', presenceChannelId);
      await channel.watch();

      // Members are users belonging to this channel
      const member = channel.state.members[jackId];

      // Presence related fields on a user object
      console.log(member.user?.online);
      console.log(member.user?.last_active);
      // #endregion snippet

      expect(logSpy.mock.calls).toEqual([[true], [expect.any(String)]]);
    } finally {
      logSpy.mockRestore();
    }
  });
});
