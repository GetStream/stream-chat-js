import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/11-reminders.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('reminders');
  let client: StreamChat;
  let messageId: string;
  let otherMessageId: string;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    const channel = client.channel('messaging', channelId, {
      members: [{ user_id: userId }],
    });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.create();
    // Reminders are off for `messaging` in the test app: enable them for this channel only.
    await serverClient.chat.channel('messaging', channelId).updateChannelPartial({
      set: { config_overrides: { user_message_reminders: true } },
    });
    messageId = (await channel.sendMessage({ message: { text: 'remind me' } })).message
      .id;
    otherMessageId = (await channel.sendMessage({ message: { text: 'me too' } })).message
      .id;
    // Created before the manager listens: only the query can bring it in
    await client.createReminder({ message_id: messageId });
  });

  afterAll(async () => {
    client.reminders.unregisterSubscriptions();
    await disconnectClients(client);
    await cleanup.run();
  });

  it('loads reminders', async () => {
    expect(client.reminders.reminders.size).toBe(0);

    // #region snippet docs="chat/javascript/06-state/11-reminders.md" heading="Initialization" tab="JavaScript" index=1
    client.reminders.registerSubscriptions();

    await client.reminders.queryNextReminders();
    // #endregion snippet

    expect(client.reminders.paginator.lastQueryError).toBeUndefined();
    expect([...client.reminders.reminders.keys()]).toEqual([messageId]);
  });

  it('reads reminders', () => {
    // #region snippet docs="chat/javascript/06-state/11-reminders.md" heading="Reading" tab="JavaScript" index=1
    // Every known reminder, keyed by message id
    const { reminders } = client.reminders.state.getLatestValue();

    // The reminder list
    const { items, isLoading, hasMoreTail } =
      client.reminders.paginator.state.getLatestValue();
    // #endregion snippet

    expect(reminders.get(messageId)?.id).toBe(messageId);
    expect(items?.map((item) => item.message_id)).toEqual([messageId]);
    expect(isLoading).toBe(false);
    expect(hasMoreTail).toBe(false);
  });

  it('subscribes to reminders', async () => {
    const renderReminders = vi.fn();

    // #region snippet docs="chat/javascript/06-state/11-reminders.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = client.reminders.state.subscribeWithSelector(
      (state) => ({ reminders: state.reminders }),
      ({ reminders }) => renderReminders([...reminders.values()]),
    );
    // #endregion snippet

    try {
      expect(renderReminders).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: messageId }),
      ]);
      // A reminder created elsewhere arrives with its event
      await client.createReminder({ message_id: otherMessageId });
      await retry(() => {
        expect(renderReminders).toHaveBeenLastCalledWith([
          expect.objectContaining({ id: messageId }),
          expect.objectContaining({ id: otherMessageId }),
        ]);
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
    }
  });

  it('reads a single reminder', async () => {
    const oneHour = 60 * 60 * 1000;
    // Give the reminder a due date
    await client.reminders.updateReminder(
      { message_id: messageId },
      { remind_at: new Date(Date.now() + oneHour) },
    );
    const renderDueIn = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      // #region snippet docs="chat/javascript/06-state/11-reminders.md" heading="Reading" tab="JavaScript" index=3
      const reminder = client.reminders.getFromState(messageId);

      // Due date (nanoseconds) and time left (milliseconds), `null` without a due date
      const reminderState = reminder?.state.getLatestValue();
      console.log(reminderState?.remind_at, reminderState?.timeLeftMs);

      const unsubscribeReminder = reminder?.state.subscribeWithSelector(
        ({ timeLeftMs }) => ({ timeLeftMs }),
        ({ timeLeftMs }) => renderDueIn(timeLeftMs),
      );
      // #endregion snippet

      try {
        expect(reminder?.id).toBe(messageId);
        const [remindAt, timeLeft] = logSpy.mock.calls[0] ?? [];
        expect(typeof remindAt).toBe('number');
        expect(timeLeft).toBeGreaterThan(oneHour - 60000);
        expect(timeLeft).toBeLessThanOrEqual(oneHour);
        expect(renderDueIn).toHaveBeenLastCalledWith(timeLeft);

        // The countdown is reactive: each refresh publishes the new time left
        await new Promise((resolve) => setTimeout(resolve, 5));
        reminder?.refreshTimeLeft();
        const [latest] = renderDueIn.mock.lastCall ?? [];
        expect(latest).toBeLessThan(timeLeft);
      } finally {
        unsubscribeReminder?.();
      }
    } finally {
      logSpy.mockRestore();
    }
  });

  it('configures the query', async () => {
    const otherChannelId = uniqueId('reminders');
    const otherChannel = client.channel('messaging', otherChannelId, {
      members: [{ user_id: userId }],
    });
    cleanup.channels.push(`messaging:${otherChannelId}`);
    await otherChannel.create();
    await serverClient.chat.channel('messaging', otherChannelId).updateChannelPartial({
      set: { config_overrides: { user_message_reminders: true } },
    });
    const { message: otherChannelMessage } = await otherChannel.sendMessage({
      message: { text: 'elsewhere' },
    });
    await client.createReminder({ message_id: otherChannelMessage.id });
    const channel = client.channel('messaging', channelId);
    const querySpy = vi.spyOn(client, 'queryReminders');

    // #region snippet docs="chat/javascript/06-state/11-reminders.md" heading="Configure the query" tab="JavaScript" index=1
    client.reminders.paginator.filters = { channel_cid: { $eq: channel.cid } };
    client.reminders.paginator.sort = [{ field: 'remind_at', direction: 1 }];
    client.reminders.paginator.updateConfig({ pageSize: 25 });

    await client.reminders.queryNextReminders();
    // #endregion snippet

    expect(client.reminders.paginator.lastQueryError).toBeUndefined();
    expect(querySpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter: { channel_cid: { $eq: channel.cid } },
        limit: 25,
        sort: [{ field: 'remind_at', direction: 1 }],
      }),
    );
    // Only this channel's reminders, the other channel's is filtered out
    const listed = client.reminders.paginator.items?.map((r) => r.message_id) ?? [];
    expect(listed.length).toBeGreaterThan(0);
    expect(listed).not.toContain(otherChannelMessage.id);
  });
});
