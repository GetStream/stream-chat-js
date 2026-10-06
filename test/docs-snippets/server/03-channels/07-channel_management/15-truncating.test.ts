import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel } from '../../../../../src';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/15-truncating.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const user = { id: uniqueId('user') };
  const janeId = uniqueId('jane');
  const johnId = uniqueId('john');

  const createChannel = async () => {
    const id = uniqueId('general');
    cleanup.channels.push(`messaging:${id}`);
    const channel = serverClient.channel('messaging', id, {
      created_by_id: user.id,
      members: [user.id, janeId, johnId],
    });
    await channel.create();
    return channel;
  };

  // The messages `userId` gets back when it queries `channel`.
  const messageTexts = async (channel: Channel, userId: string) => {
    const [result] = await serverClient.queryChannels(
      { cid: channel.cid },
      {},
      { user_id: userId, message_limit: 10, watch: false, state: true },
    );
    return result.state.messages.map((message) => message.text);
  };

  beforeAll(async () => {
    cleanup.users.push(user.id, janeId, johnId);
    await serverClient.upsertUsers([user, { id: janeId }, { id: johnId }]);
  });

  afterAll(() => cleanup.run());

  it('truncates a channel', async () => {
    const channel = await createChannel();
    await channel.sendMessage({ text: 'first', user_id: user.id });
    const spy = vi.spyOn(channel, 'truncate');

    // #region snippet docs="_default/03-channels/07-channel_management/15-truncating.md" heading="Truncate a Channel" tab="Node.js" index=1
    await channel.truncate();

    // Or with parameters:
    await channel.truncate({
      hard_delete: true,
      skip_push: false,
      message: {
        text: 'Dear Everyone. The channel has been truncated.',
        user_id: user['id'],
      },
    });

    // Setting user_id server side:
    await channel.truncate({
      user_id: user['id'],
    });
    // #endregion snippet

    const [, withMessage] = await Promise.all(spy.mock.results.map((r) => r.value));
    spy.mockRestore();
    expect(withMessage.message?.text).toBe(
      'Dear Everyone. The channel has been truncated.',
    );
    expect(withMessage.message?.user?.id).toBe(user.id);

    // the last call truncated the system message too, and recorded who truncated
    const [result] = await serverClient.queryChannels(
      { cid: channel.cid },
      {},
      { user_id: user.id, message_limit: 10, watch: false, state: true },
    );
    expect(result.data?.truncated_at).toBeDefined();
    expect(result.data?.truncated_by?.id).toBe(user.id);
    expect(result.state.messages).toEqual([]);
  });

  it('truncates a channel for specific members', async () => {
    const channel = await createChannel();
    await channel.sendMessage({ text: 'history', user_id: user.id });

    // #region snippet docs="_default/03-channels/07-channel_management/15-truncating.md" heading="Truncate for Specific Members" tab="Node.js" index=1
    // COPY: janeId="jane", johnId="john"
    // Hide the history for two members; everyone else keeps their full view
    await channel.truncate({
      member_ids: [janeId, johnId],
    });

    // Hide only the messages created before a given time
    await channel.truncate({
      member_ids: [janeId],
      truncated_at: new Date('2026-01-01T00:00:00Z'),
    });
    // #endregion snippet

    // john's history is hidden; jane's cutoff was moved back before the channel existed,
    // so she sees the history again; the owner (not listed) keeps the full view
    expect(await messageTexts(channel, johnId)).toEqual([]);
    expect(await messageTexts(channel, janeId)).toEqual(['history']);
    expect(await messageTexts(channel, user.id)).toEqual(['history']);
  });
});
