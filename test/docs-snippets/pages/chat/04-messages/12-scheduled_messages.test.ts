import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { retry } from '../../../helpers/wait';

// The test app has scheduled messages off, and only support can turn them on: every schedule or
// update fails with code 114. Unskip these once the app has them.
const BLOCKED =
  'BLOCKED: scheduled messages are not enabled for the docs test app ("scheduled messages are not enabled for this app", code 114)';

/** A whole-minute UTC time `days` from now at `hour`:00, as the API stores send times. */
const sendTimeIn = (days: number, hour: number) => {
  const time = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  time.setUTCHours(hour, 0, 0, 0);
  return time.toISOString().replace('.000Z', 'Z');
};

const nsToMs = (ns: number) => Math.floor(ns / 1e6);

describe('_default/04-messages/12-scheduled_messages.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('general');
  const otherChannelId = uniqueId('other');
  let client: StreamChat;
  let channel: Channel;
  let otherChannel: Channel;

  /** Schedules a message in `target` an hour from now and returns its id. */
  const schedule = async (target: Channel, text: string) => {
    const { scheduled_message } = await target.sendMessage({
      message: { text },
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000),
    });
    if (!scheduled_message) throw new Error(`"${text}" was not scheduled`);
    return scheduled_message.id;
  };

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId, {
      members: [{ user_id: userId }],
    });
    otherChannel = client.channel('messaging', otherChannelId, {
      members: [{ user_id: userId }],
    });
    cleanup.channels.push(channel.cid, otherChannel.cid);
    await channel.watch();
    await otherChannel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it.skip(`${BLOCKED}: schedules a message`, async () => {
    const sendAtIso = sendTimeIn(2, 9);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Scheduling a message" tab="JavaScript" index=1
      // COPY: sendAtIso="2026-12-24T09:00:00Z"
      const response = await channel.sendMessage({
        message: { text: 'Happy birthday!', custom: { priority: 'high' } },
        scheduled_at: new Date(sendAtIso),
      });

      // The message is not in the channel yet
      const scheduledMessage = response.scheduled_message;
      console.log(scheduledMessage?.id, scheduledMessage?.scheduled_at);
      // #endregion snippet

      expect(scheduledMessage?.status).toBe('scheduled');
      expect(scheduledMessage?.message.text).toBe('Happy birthday!');
      expect(scheduledMessage?.message.custom.priority).toBe('high');
      expect(nsToMs(scheduledMessage?.scheduled_at ?? 0)).toBe(Date.parse(sendAtIso));
      expect(logSpy).toHaveBeenCalledWith(
        scheduledMessage?.id,
        scheduledMessage?.scheduled_at,
      );
      const { messages } = await channel.query({ messages: { limit: 10 } });
      expect(messages.map((m) => m.text)).not.toContain('Happy birthday!');
    } finally {
      logSpy.mockRestore();
    }
  });

  it.skip(`${BLOCKED}: updates a scheduled message`, async () => {
    const scheduledMessageId = await schedule(channel, 'Happy birthday!');
    const updatedSendAtIso = sendTimeIn(2, 8);

    // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Updating a scheduled message" tab="JavaScript" index=1
    // COPY: updatedSendAtIso="2026-12-24T08:00:00Z"
    const { scheduled_message } = await client.updateScheduledMessage(
      { id: scheduledMessageId },
      {
        message: { text: 'Happy birthday, John!' },
        scheduled_at: new Date(updatedSendAtIso),
      },
    );
    // #endregion snippet

    expect(scheduled_message.id).toBe(scheduledMessageId);
    expect(scheduled_message.message.text).toBe('Happy birthday, John!');
    expect(nsToMs(scheduled_message.scheduled_at)).toBe(Date.parse(updatedSendAtIso));
  });

  it.skip(`${BLOCKED}: sends a scheduled message now`, async () => {
    const scheduledMessageId = await schedule(channel, 'Send me now');

    // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Sending a scheduled message now" tab="JavaScript" index=1
    const { scheduled_message } = await client.sendScheduledMessageNow({
      id: scheduledMessageId,
    });
    // #endregion snippet

    expect(scheduled_message.id).toBe(scheduledMessageId);
    // The send happens in the background.
    await retry(async () => {
      const { messages } = await channel.query({ messages: { limit: 10 } });
      expect(messages.map((m) => m.text)).toContain('Send me now');
    });
  });

  it.skip(`${BLOCKED}: deletes a scheduled message`, async () => {
    const scheduledMessageId = await schedule(channel, 'Cancel me');

    // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Deleting a scheduled message" tab="JavaScript" index=1
    const { scheduled_message } = await client.deleteScheduledMessage({
      id: scheduledMessageId,
    });
    // #endregion snippet

    expect(scheduled_message.id).toBe(scheduledMessageId);
    expect(scheduled_message.status).toBe('canceled');
    const { scheduled_messages } = await client.queryScheduledMessages({ limit: 100 });
    expect(scheduled_messages.map((m) => m.id)).not.toContain(scheduledMessageId);
  });

  it.skip(`${BLOCKED}: queries scheduled messages`, async () => {
    const inChannel = await schedule(channel, 'In this channel');
    const inOtherChannel = await schedule(otherChannel, 'In the other channel');

    // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Querying scheduled messages" tab="JavaScript" index=1
    // All the user's scheduled messages, across channels
    const { scheduled_messages, next } = await client.queryScheduledMessages({
      limit: 20,
    });

    // Next page
    const nextPage = await client.queryScheduledMessages({ limit: 20, next });

    // Only one channel
    const forChannel = await client.queryScheduledMessages({
      filter: { cid: channel.cid },
      limit: 20,
    });
    // #endregion snippet

    const ids = scheduled_messages.map((m) => m.id);
    expect(ids).toContain(inChannel);
    expect(ids).toContain(inOtherChannel);
    expect(nextPage.scheduled_messages).toBeDefined();
    const forChannelIds = forChannel.scheduled_messages.map((m) => m.id);
    expect(forChannelIds).toContain(inChannel);
    expect(forChannelIds).not.toContain(inOtherChannel);
    expect(forChannel.scheduled_messages.every((m) => m.cid === channel.cid)).toBe(true);
  });

  it.skip(`${BLOCKED}: includes scheduled messages in channel state`, async () => {
    const scheduledMessageId = await schedule(otherChannel, 'In channel state');

    // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Including scheduled messages in channel state" tab="JavaScript" index=1
    // COPY: otherChannelId="general"
    // One channel
    const channel = client.channel('messaging', otherChannelId);
    const state = await channel.query({ include_scheduled_messages: true });

    if (state.scheduled_messages) {
      // The user's scheduled messages in this channel
    } else {
      // Not available, use client.queryScheduledMessages instead
    }

    // A page of channels
    const { channels } = await client.queryChannels({
      filter_conditions: { members: { $in: [userId] } },
      sort: [{ field: 'last_message_at', direction: -1 }],
      include_scheduled_messages: true,
    });
    // #endregion snippet

    expect(state.scheduled_messages?.map((m) => m.id)).toContain(scheduledMessageId);
    const queried = channels.find((c) => c.channel?.cid === channel.cid);
    expect(queried?.scheduled_messages?.map((m) => m.id)).toContain(scheduledMessageId);
  });

  it.skip(`${BLOCKED}: listens to scheduled message events`, async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const onSpy = vi.spyOn(client, 'on');
    // A channel of its own: deleting it fails its scheduled messages with `channel_deleted`.
    const doomedChannelId = uniqueId('doomed');
    const doomedChannel = client.channel('messaging', doomedChannelId, {
      members: [{ user_id: userId }],
    });
    cleanup.channels.push(doomedChannel.cid);
    try {
      // #region snippet docs="chat/_default/04-messages/12-scheduled_messages.md" heading="Events" tab="JavaScript" index=1
      client.on('scheduled_message.sent', (event) => {
        console.log(`${event.scheduled_message?.id} was sent as ${event.message_id}`);
      });

      client.on('scheduled_message.failed', (event) => {
        console.log(event.scheduled_message?.failure_reason);
      });
      // #endregion snippet

      const sentId = await schedule(channel, 'Sent from the events test');
      await client.sendScheduledMessageNow({ id: sentId });
      await retry(() => {
        expect(
          logSpy.mock.calls.some(([line]) =>
            String(line).startsWith(`${sentId} was sent as `),
          ),
        ).toBe(true);
        return Promise.resolve();
      });

      await doomedChannel.create();
      await schedule(doomedChannel, 'Never sent');
      await serverClient.chat.channel('messaging', doomedChannelId).delete({});
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('channel_deleted');
        return Promise.resolve();
      });
    } finally {
      onSpy.mock.results.forEach((r) => r.value.unsubscribe());
      onSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
