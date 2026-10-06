import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, QueryReactionsAPIResponse, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

describe('_default/04-messages/04-send_reaction.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherId = uniqueId('other');
  const channelId = uniqueId('general');
  let client: StreamChat;
  let channel: Channel;

  const newMessageId = async (text: string) => {
    const { message } = await channel.sendMessage({ text });
    return message.id;
  };

  /** Sends reactions of the given types server-side, one at a time, as `user_id`. */
  const sendServerReactions = async (
    messageId: string,
    types: string[],
    user_id: string,
  ) => {
    const serverChannel = serverClient.channel('messaging', channelId);
    for (const type of types) {
      await serverChannel.sendReaction(messageId, { type, user_id });
    }
  };

  const getServerMessage = async (messageId: string) =>
    (await serverClient.getMessage(messageId)).message;

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: otherId }]);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId, { members: [userId, otherId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sends a reaction', async () => {
    const messageID = await newMessageId('React to me');
    // A reaction of another type, which `enforce_unique` should replace.
    await channel.sendReaction(messageID, { type: 'fire' });

    // #region snippet docs="_default/04-messages/04-send_reaction.md" heading="Sending a Reaction" tab="JavaScript" index=1
    // Add a reaction
    const reaction = await channel.sendReaction(messageID, {
      type: 'love',
    });

    // Add a reaction with custom data
    const customReaction = await channel.sendReaction(messageID, {
      type: 'love',
      customField: 'value',
    });

    // Replace all existing reactions from this user with the new one
    const uniqueReaction = await channel.sendReaction(
      messageID,
      { type: 'love' },
      { enforce_unique: true },
    );
    // #endregion snippet

    expect(reaction.reaction.type).toBe('love');
    expect(reaction.reaction.user_id).toBe(userId);
    expect(customReaction.reaction.customField).toBe('value');
    expect(uniqueReaction.reaction.type).toBe('love');

    const message = await getServerMessage(messageID);
    expect(message.reaction_counts).toEqual({ love: 1 });
  });

  it('removes a reaction', async () => {
    const messageID = await newMessageId('Remove my reaction');
    await channel.sendReaction(messageID, { type: 'love' });
    expect((await getServerMessage(messageID)).reaction_counts).toEqual({ love: 1 });

    // #region snippet docs="_default/04-messages/04-send_reaction.md" heading="Removing a Reaction" tab="JavaScript" index=1
    await channel.deleteReaction(messageID, 'love');
    // #endregion snippet

    const message = await getServerMessage(messageID);
    expect(message.reaction_counts?.love).toBeUndefined();
    expect(message.latest_reactions ?? []).toHaveLength(0);
  });

  it('paginates reactions', async () => {
    const messageID = await newMessageId('Many reactions');
    const types = Array.from({ length: 13 }, (_, i) => `r${i + 1}`);
    await sendServerReactions(messageID, types, otherId);

    // #region snippet docs="_default/04-messages/04-send_reaction.md" heading="Paginating Reactions" tab="JavaScript" index=1
    // Get the first 10 reactions
    const response = await channel.getReactions(messageID, { limit: 10 });

    // Get reactions 11-13
    const nextResponse = await channel.getReactions(messageID, {
      limit: 3,
      offset: 10,
    });
    // #endregion snippet

    expect(response.reactions).toHaveLength(10);
    expect(nextResponse.reactions).toHaveLength(3);
    const allTypes = [...response.reactions, ...nextResponse.reactions].map(
      (r) => r.type,
    );
    expect(new Set(allTypes)).toEqual(new Set(types));
  });

  it('queries reactions', async () => {
    const messageId = await newMessageId('Query my reactions');
    await channel.sendReaction(messageId, { type: 'like' });
    // Enough reactions from another user for `firstPage` to have a `next` cursor.
    const otherTypes = Array.from({ length: 30 }, (_, i) => `t${i + 1}`);
    await sendServerReactions(messageId, otherTypes, otherId);
    const message = await getServerMessage(messageId);
    const spy = vi.spyOn(client, 'queryReactions');

    // #region snippet docs="_default/04-messages/04-send_reaction.md" heading="Querying Reactions" tab="JavaScript" index=1
    // Query reactions by type
    await client.queryReactions(message.id, { type: 'like' });

    // Query reactions by user
    await client.queryReactions(message.id, { user_id: userId });

    // Paginate results
    const firstPage = await client.queryReactions(message.id, {});
    const secondPage = await client.queryReactions(
      message.id,
      {},
      {},
      { limit: 5, next: firstPage.next },
    );
    // #endregion snippet

    const [byType, byUser]: QueryReactionsAPIResponse[] = await Promise.all(
      spy.mock.results.slice(0, 2).map((r) => r.value),
    );
    spy.mockRestore();

    expect(byType.reactions.map((r) => r.type)).toEqual(['like']);
    expect(byUser.reactions.map((r) => r.user_id)).toEqual([userId]);
    expect(firstPage.next).toBeTruthy();
    expect(secondPage.reactions).toHaveLength(5);
    const firstPageTypes = firstPage.reactions.map((r) => r.type);
    expect(secondPage.reactions.some((r) => firstPageTypes.includes(r.type))).toBe(false);
  });

  it('sends cumulative reactions', async () => {
    const messageID = await newMessageId('Clap for me');

    // #region snippet docs="_default/04-messages/04-send_reaction.md" heading="Cumulative Reactions" tab="JavaScript" index=1
    // User claps 5 times
    await channel.sendReaction(messageID, {
      type: 'clap',
      score: 5,
    });

    // Same user claps 20 more times (total becomes 25)
    await channel.sendReaction(messageID, {
      type: 'clap',
      score: 25,
    });
    // #endregion snippet

    const message = await getServerMessage(messageID);
    expect(message.reaction_counts).toEqual({ clap: 1 });
    expect(message.reaction_scores).toEqual({ clap: 25 });
    expect(message.reaction_groups?.clap.sum_scores).toBe(25);
  });
});
