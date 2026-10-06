import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

describe('_default/03-channels/06-channel_members.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const owner = uniqueId('owner');
  const thierry = uniqueId('thierry');
  const josh = uniqueId('josh');
  const jamesBond = uniqueId('james_bond');
  const alecTrevelyan = uniqueId('alec_trevelyan');
  const tommaso = uniqueId('tommaso');
  const userid1 = uniqueId('userid1');
  const userid2 = uniqueId('userid2');
  const userid3 = uniqueId('userid3');
  let client: StreamChat;

  /** A channel created by the connected user (the owner), with the given extra members. */
  const createOwnedChannel = async (members: string[] = []) => {
    const channel = client.channel('messaging', uniqueId('channel'), {
      members: [owner, ...members],
    });
    await channel.create();
    if (channel.cid) cleanup.channels.push(channel.cid);
    return channel;
  };

  /** The channel's members, keyed by user id (read server-side). */
  const membersOf = async (channel: Channel) => {
    const { members } = await serverClient
      .channel(channel.type, channel.id)
      .queryMembers({});
    return Object.fromEntries(members.map((m) => [m.user_id, m]));
  };

  /** Texts of the messages `userId` can see in the channel (read server-side on their behalf). */
  const messagesSeenBy = async (channel: Channel, userId: string) => {
    const [result] = await serverClient.queryChannels(
      { cid: channel.cid },
      {},
      { user_id: userId, message_limit: 10 },
    );
    return result?.state.messages.map((m) => m.text) ?? [];
  };

  beforeAll(async () => {
    const others = [
      thierry,
      josh,
      jamesBond,
      alecTrevelyan,
      tommaso,
      userid1,
      userid2,
      userid3,
    ];
    cleanup.users.push(owner, ...others);
    await serverClient.upsertUsers(others.map((id) => ({ id })));
    client = await getClientSideClient({ id: owner });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('adds members', async () => {
    const channel = await createOwnedChannel();

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Adding Members" tab="JavaScript" index=1
    // COPY: thierry="thierry", josh="josh", jamesBond="james_bond", alecTrevelyan="alec_trevelyan"
    await channel.addMembers([thierry, josh]);

    // Add user to the channel with role set
    await channel.addMembers([{ user_id: jamesBond, channel_role: 'channel_moderator' }]);

    // Add new channel member with custom data
    await channel.addMembers([{ user_id: alecTrevelyan, code_name: '006' }]);
    // #endregion snippet

    const members = await membersOf(channel);
    expect(Object.keys(members).sort()).toEqual(
      [owner, thierry, josh, jamesBond, alecTrevelyan].sort(),
    );
    expect(members[jamesBond]?.channel_role).toBe('channel_moderator');
    expect(members[alecTrevelyan]?.code_name).toBe('006');
  });

  it('adds members when creating a channel', async () => {
    const randomID = uniqueId('channel');
    cleanup.channels.push(`messaging:${randomID}`);

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Adding Members" tab="JavaScript" index=2
    // COPY: jamesBond="james_bond", alecTrevelyan="alec_trevelyan"
    const channel = client.channel('messaging', randomID, {
      members: [
        { user_id: jamesBond, code_name: '007' },
        { user_id: alecTrevelyan, code_name: '006' },
      ],
    });
    await channel.create();
    // #endregion snippet

    const members = await membersOf(channel);
    expect(members[jamesBond]?.code_name).toBe('007');
    expect(members[alecTrevelyan]?.code_name).toBe('006');
  });

  it('removes members', async () => {
    const channel = await createOwnedChannel([tommaso]);

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Removing Members" tab="JavaScript" index=1
    // COPY: tommaso="tommaso"
    await channel.removeMembers([tommaso]);
    // #endregion snippet

    expect(Object.keys(await membersOf(channel))).toEqual([owner]);
  });

  it('leaves a channel', async () => {
    // A channel created by someone else, where the connected user is a plain member.
    const id = uniqueId('channel');
    await serverClient
      .channel('messaging', id, { created_by_id: thierry, members: [thierry, owner] })
      .create();
    cleanup.channels.push(`messaging:${id}`);
    const channel = client.channel('messaging', id);

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Leaving a Channel" tab="JavaScript" index=1
    // COPY: owner="my_user_id"
    // Remove own channel membership
    await channel.removeMembers([owner]);
    // #endregion snippet

    expect(Object.keys(await membersOf(channel))).toEqual([thierry]);
  });

  it('hides history', async () => {
    const channel = await createOwnedChannel();
    await channel.sendMessage({ text: 'Before thierry joined' });

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Hide History" tab="JavaScript" index=1
    // COPY: thierry="thierry"
    await channel.addMembers([thierry], undefined, { hide_history: true });
    // #endregion snippet

    // The message sent before thierry joined is hidden from him.
    expect(await messagesSeenBy(channel, thierry)).toEqual([]);
  });

  it('hides history before a date', async () => {
    const channel = await createOwnedChannel();
    await channel.sendMessage({ text: 'Sent today' });

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Hide History Before a Specific Date" tab="JavaScript" index=1
    // COPY: thierry="thierry"
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7); // Last 7 days
    await channel.addMembers([thierry], undefined, {
      hide_history_before: cutoff.toISOString(),
    });
    // #endregion snippet

    // Only history older than the cutoff is hidden: today's message is visible.
    expect(await messagesSeenBy(channel, thierry)).toEqual(['Sent today']);
  });

  it('adds members with a system message', async () => {
    const channel = await createOwnedChannel();

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="System Message Parameter" tab="JavaScript" index=1
    // COPY: tommaso="tommaso"
    await channel.addMembers([tommaso], { text: 'Tommaso joined the channel.' });
    // #endregion snippet

    const { messages } = await serverClient
      .channel(channel.type, channel.id)
      .query({ messages: { limit: 10 } });
    // The system message is sent by the connected user.
    expect(messages.map((m) => [m.text, m.type, m.user?.id])).toEqual([
      ['Tommaso joined the channel.', 'system', owner],
    ]);
  });

  it('adds member custom data', async () => {
    const randomID = uniqueId('channel');
    cleanup.channels.push(`messaging:${randomID}`);

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Adding Custom Data" tab="JavaScript" index=1
    // COPY: userid1="userid1", userid2="userid2", userid3="userid3"
    // Add custom data while creating the channel
    const channel = client.channel('messaging', randomID, {
      members: [
        { user_id: userid1, key1: 'value1' },
        { user_id: userid2, key1: 'value1' },
        { user_id: userid3, key2: 'value2' },
      ],
    });
    await channel.create();

    // Add custom data with addMembers method
    await channel.addMembers([{ user_id: userid1, key1: 'value1' }]);
    // #endregion snippet

    const members = await membersOf(channel);
    expect(members[userid1]?.key1).toBe('value1');
    expect(members[userid2]?.key1).toBe('value1');
    expect(members[userid3]?.key2).toBe('value2');
  });

  it('partially updates the connected member', async () => {
    const channel = await createOwnedChannel();
    await channel.updateMemberPartial({ set: { key3: 'value 3' } });

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Updating Member Data" tab="JavaScript" index=1
    // Set some fields
    await channel.updateMemberPartial({
      set: {
        key1: 'new value 1',
        key2: 'new value 2',
      },
    });

    // Unset some fields
    await channel.updateMemberPartial({
      unset: ['key1', 'key2'],
    });

    // Set and unset in the same call
    await channel.updateMemberPartial({
      set: {
        key1: 'new value 1',
        key2: 'new value 2',
      },
      unset: ['key3'],
    });
    // #endregion snippet

    const member = (await membersOf(channel))[owner];
    expect(member).toMatchObject({ key1: 'new value 1', key2: 'new value 2' });
    expect(member?.key3).toBeUndefined();
    // Channel roles can only be changed server-side.
    await expect(
      channel.updateMemberPartial({ set: { channel_role: 'channel_moderator' } }),
    ).rejects.toThrow(/this channel role can only be updated server side/);
  });
});
