import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Message, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { retry } from '../../../helpers/wait';

describe('_default/05-features/10-advanced/11-slow_mode_and_throttling.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const memberId = uniqueId('jack');
  let client: StreamChat;
  let memberClient: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, memberId);
    client = await getClientSideClient({ id: userId, name: 'John' });
    memberClient = await getClientSideClient({ id: memberId, name: 'Jack' });
  });

  afterAll(async () => {
    await disconnectClients(client, memberClient);
    await cleanup.run();
  });

  it('enables and disables slow mode', async () => {
    const channelId = uniqueId('channel');
    const channel = client.channel('messaging', channelId, { members: [userId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.create();
    // Only admins and moderators can change the cooldown (a channel creator gets 403 code 17).
    await serverClient.channel('messaging', channelId).addModerators([userId]);
    const enableSpy = vi.spyOn(channel, 'enableSlowMode');

    // #region snippet docs="_default/05-features/10-advanced/11-slow_mode_and_throttling.md" heading="Channel Slow Mode" tab="JavaScript" index=1
    // enable slow mode and set cooldown to 1s
    await channel.enableSlowMode(1);

    // increase cooldown to 30s
    await channel.enableSlowMode(30);

    // disable slow mode
    await channel.disableSlowMode();
    // #endregion snippet

    const results = await Promise.all(enableSpy.mock.results.map((r) => r.value));
    expect(results.map((r) => r.channel.cooldown)).toEqual([1, 30]);
    expect(channel.data?.cooldown ?? 0).toBe(0);
    const [queried] = await serverClient.queryChannels({ cid: channel.cid });
    expect(queried.data?.cooldown ?? 0).toBe(0);
  });

  it('locks the send message UI during the cooldown', async () => {
    const channelId = uniqueId('channel');
    const serverChannel = serverClient.channel('messaging', channelId, {
      members: [userId, memberId],
      created_by_id: userId,
    });
    cleanup.channels.push(`messaging:${channelId}`);
    await serverChannel.create();
    await serverChannel.enableSlowMode(2);

    // A regular member, so the cooldown applies.
    const channel = memberClient.channel('messaging', channelId);
    await channel.watch();
    const msg: Message = { text: 'Hello' };
    const calls: Array<[string, number]> = [];
    const disableSendMessageUI = () => calls.push(['disable', Date.now()]);
    const enableSendMessageUI = () => calls.push(['enable', Date.now()]);

    // #region snippet docs="_default/05-features/10-advanced/11-slow_mode_and_throttling.md" heading="Channel Slow Mode" tab="JavaScript" index=2
    const p = channel.sendMessage(msg);
    const cooldown = channel.data?.cooldown;

    if (cooldown != null && cooldown > 0) {
      p.then(() => {
        // first lock the UI so that the user is aware of the cooldown
        disableSendMessageUI();
        // restore the UI after the cooldown (in seconds) is finished
        setTimeout(enableSendMessageUI, cooldown * 1000);
      });
    }

    await p;
    // #endregion snippet

    // The API rejects a second message during the cooldown.
    await expect(channel.sendMessage({ text: 'Too soon' })).rejects.toThrow();

    await retry(() => {
      expect(calls.map(([name]) => name)).toEqual(['disable', 'enable']);
      return Promise.resolve();
    });
    // The UI stays locked for the whole cooldown (2s).
    expect(calls[1][1] - calls[0][1]).toBeGreaterThanOrEqual(1900);
  });
});
