import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Channel } from '../../../../src';
import { getServerClient } from '../../helpers/clients';
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
  const jane = uniqueId('jane');
  const userid1 = uniqueId('userid1');
  const userid2 = uniqueId('userid2');
  const userid3 = uniqueId('userid3');

  /** A channel created by `owner`, with the given extra members. */
  const createChannel = async (members: string[] = []) => {
    const channel = serverClient.channel('messaging', uniqueId('channel'), {
      created_by_id: owner,
      members: [owner, ...members],
    });
    await channel.create();
    if (channel.cid) cleanup.channels.push(channel.cid);
    return channel;
  };

  /** The channel's members, keyed by user id. */
  const membersOf = async (channel: Channel) => {
    const { members } = await serverClient
      .channel(channel.type, channel.id)
      .queryMembers({});
    return Object.fromEntries(members.map((m) => [m.user_id, m]));
  };

  /** Texts of the messages `userId` can see in the channel. */
  const messagesSeenBy = async (channel: Channel, userId: string) => {
    const [result] = await serverClient.queryChannels(
      { cid: channel.cid },
      {},
      { user_id: userId, message_limit: 10 },
    );
    return result?.state.messages.map((m) => m.text) ?? [];
  };

  beforeAll(async () => {
    const users = [
      owner,
      thierry,
      josh,
      jamesBond,
      alecTrevelyan,
      tommaso,
      jane,
      userid1,
      userid2,
      userid3,
    ];
    cleanup.users.push(...users);
    await serverClient.upsertUsers(users.map((id) => ({ id })));
  });

  afterAll(() => cleanup.run());

  it('adds members', async () => {
    const channel = await createChannel();

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Adding Members" tab="Node.js" index=1
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

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Adding Members" tab="Node.js" index=2
    // COPY: jamesBond="james_bond", alecTrevelyan="alec_trevelyan"
    const channel = serverClient.channel('messaging', randomID, {
      created_by_id: jamesBond,
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
    const channel = await createChannel([tommaso]);

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Removing Members" tab="Node.js" index=1
    // COPY: tommaso="tommaso"
    await channel.removeMembers([tommaso]);
    // #endregion snippet

    expect(Object.keys(await membersOf(channel))).toEqual([owner]);
  });

  it('hides history', async () => {
    const channel = await createChannel();
    await channel.sendMessage({ text: 'Before thierry joined', user_id: owner });

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Hide History" tab="Node.js" index=1
    // COPY: thierry="thierry"
    await channel.addMembers([thierry], undefined, { hide_history: true });
    // #endregion snippet

    // The message sent before thierry joined is hidden from him.
    expect(await messagesSeenBy(channel, thierry)).toEqual([]);
  });

  it('hides history before a date', async () => {
    const channel = await createChannel();
    await channel.sendMessage({ text: 'Sent today', user_id: owner });

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Hide History Before a Specific Date" tab="Node.js" index=1
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
    const channel = await createChannel();

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="System Message Parameter" tab="Node.js" index=1
    // COPY: tommaso="tommaso"
    await channel.addMembers([tommaso], {
      text: 'Tommaso joined the channel.',
      user_id: tommaso,
    });
    // #endregion snippet

    const { messages } = await channel.query({ messages: { limit: 10 } });
    expect(messages.map((m) => [m.text, m.type, m.user?.id])).toEqual([
      ['Tommaso joined the channel.', 'system', tommaso],
    ]);
  });

  describe('moderators', () => {
    let channel: Channel;

    const moderators = async () =>
      (await channel.queryMembers({})).members
        .filter((m) => m.channel_role === 'channel_moderator')
        .map((m) => m.user_id)
        .sort();

    beforeAll(async () => {
      channel = await createChannel([thierry, josh, tommaso]);
    });

    it('adds moderators', async () => {
      // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Add Moderators" tab="Node.js" index=1
      // COPY: thierry="thierry", josh="josh"
      await channel.addModerators([thierry, josh]);
      // #endregion snippet

      expect(await moderators()).toEqual([thierry, josh].sort());
    });

    it('removes moderators', async () => {
      await channel.addModerators([tommaso]);
      expect(await moderators()).toContain(tommaso);

      // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Remove Moderators" tab="Node.js" index=1
      // COPY: tommaso="tommaso"
      await channel.demoteModerators([tommaso]);
      // #endregion snippet

      expect(await moderators()).not.toContain(tommaso);
      expect((await membersOf(channel))[tommaso]?.channel_role).toBe('channel_member');
    });
  });

  it('adds member custom data', async () => {
    const randomID = uniqueId('channel');
    cleanup.channels.push(`messaging:${randomID}`);

    // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Adding Custom Data" tab="Node.js" index=1
    // COPY: userid1="userid1", userid2="userid2", userid3="userid3"
    // Add custom data while creating the channel
    const channel = serverClient.channel('messaging', randomID, {
      created_by_id: userid1,
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

  describe('updating member data', () => {
    let channel: Channel;

    beforeAll(async () => {
      channel = await createChannel([jane]);
    });

    beforeEach(() =>
      channel.updateMemberPartial(
        {
          set: { key3: 'value 3', channel_role: 'channel_member' },
          unset: ['key1', 'key2'],
        },
        { userId: jane },
      ),
    );

    const expectUpdated = async () => {
      const member = (await membersOf(channel))[jane];
      expect(member).toMatchObject({
        key1: 'new value 1',
        key2: 'new value 2',
        channel_role: 'channel_moderator',
      });
      expect(member?.key3).toBeUndefined();
    };

    it('partially updates a member', async () => {
      // #region snippet docs="_default/03-channels/06-channel_members.md" heading="Updating Member Data" tab="Node.js" index=1
      // COPY: jane="jane"
      // Set some fields
      await channel.updateMemberPartial(
        {
          set: {
            key1: 'new value 1',
            key2: 'new value 2',
            channel_role: 'channel_moderator',
          },
        },
        { userId: jane },
      );

      // Unset some fields
      await channel.updateMemberPartial(
        {
          unset: ['key1', 'key2'],
        },
        { userId: jane },
      );

      // Set and unset in the same call
      await channel.updateMemberPartial(
        {
          set: {
            key1: 'new value 1',
            key2: 'new value 2',
          },
          unset: ['key3'],
        },
        { userId: jane },
      );
      // #endregion snippet

      await expectUpdated();
    });
  });
});
