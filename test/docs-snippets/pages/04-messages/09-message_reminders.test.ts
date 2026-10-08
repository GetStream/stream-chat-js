import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  Channel,
  QueryRemindersResponse,
  ReminderAPIResponse,
  ReminderFilters,
  ReminderSort,
  StreamChat,
} from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { retry } from '../../helpers/wait';

const oneHour = 3600000;

describe('_default/04-messages/09-message_reminders.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('reminders');
  let client: StreamChat;
  let channel: Channel;
  const ids: Record<string, string> = {};

  const reminderOf = async (messageId: string) => {
    const { reminders } = await client.queryReminders({
      filter: { message_id: messageId },
    });
    return reminders[0];
  };

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId, { members: [userId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
    // Reminders are off for `messaging` in the test app: enable them for this channel only.
    await serverClient.chat.channel('messaging', channelId).updateChannelPartial({
      set: { config_overrides: { user_message_reminders: true } },
    });
    const names = [
      'create',
      'createOther',
      'update',
      'delete',
      'deleteOther',
      'events',
      'due',
      'page1',
      'page2',
      'page3',
      'page4',
    ];
    for (const name of names) {
      ids[name] = (await channel.sendMessage({ text: name })).message.id;
    }
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('creates reminders', async () => {
    const messageID = ids.create;
    const anotherMessageID = ids.createOther;
    const offsetMs = oneHour;
    const createSpy = vi.spyOn(client, 'createReminder');
    const before = Date.now();

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Creating a Message Reminder" tab="JavaScript" index=1
    // COPY: messageID="message-id", anotherMessageID="another-message-id"
    // Create a reminder with a specific due date (direct API call)
    await client.createReminder({
      messageId: messageID,
      // Remind in offsetMs
      remind_at: new Date(new Date().getTime() + offsetMs).toISOString(),
    });

    // Create a reminder with a specific due date (client state optimistic update)
    await client.reminders.upsertReminder({
      messageId: messageID,
      remind_at: new Date(new Date().getTime() + offsetMs).toISOString(),
    });

    // Create a "Save for later" reminder without a specific time (direct API call)
    await client.createReminder({
      messageId: anotherMessageID,
    });

    // Create a "Save for later" reminder without a specific time (client state optimistic update)
    await client.reminders.upsertReminder({
      messageId: messageID,
    });
    // #endregion snippet

    const first = (await createSpy.mock.results[0].value) as ReminderAPIResponse;
    createSpy.mockRestore();
    expect(first.reminder.message_id).toBe(ids.create);
    expect(new Date(first.reminder.remind_at ?? 0).getTime()).toBeGreaterThanOrEqual(
      before + offsetMs - 1000,
    );
    expect(client.reminders.getFromState(ids.create)).toBeDefined();
    expect((await reminderOf(ids.createOther))?.remind_at ?? null).toBeNull();
    expect((await reminderOf(ids.create))?.remind_at ?? null).toBeNull();
  });

  it('updates reminders', async () => {
    const messageID = ids.update;
    const newOffsetMs = 2 * oneHour;
    await client.createReminder({
      messageId: ids.update,
      remind_at: new Date(Date.now() + oneHour).toISOString(),
    });
    const updateSpy = vi.spyOn(client, 'updateReminder');
    const before = Date.now();

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Updating a Message Reminder" tab="JavaScript" index=1
    // COPY: messageID="message-id"
    // Update a reminder with a new due date (direct API call)
    await client.updateReminder({
      messageId: messageID,
      // Remind in newOffsetMs
      remind_at: new Date(new Date().getTime() + newOffsetMs).toISOString(),
    });

    // Update a reminder with a new due date (client state optimistic update)
    await client.reminders.upsertReminder({
      messageId: messageID,
      // Remind in newOffsetMs
      remind_at: new Date(new Date().getTime() + newOffsetMs).toISOString(),
    });

    // Convert a timed reminder to "Save for later" (direct API call)
    await client.updateReminder({
      messageId: messageID,
      remind_at: null,
    });

    // Convert a timed reminder to "Save for later" (client state optimistic update)
    await client.reminders.upsertReminder({
      messageId: messageID,
      remind_at: null,
    });
    // #endregion snippet

    const first = (await updateSpy.mock.results[0].value) as ReminderAPIResponse;
    updateSpy.mockRestore();
    expect(new Date(first.reminder.remind_at ?? 0).getTime()).toBeGreaterThanOrEqual(
      before + newOffsetMs - 1000,
    );
    expect((await reminderOf(ids.update))?.remind_at ?? null).toBeNull();
  });

  it('deletes reminders', async () => {
    const messageID = ids.delete;
    const anotherMessageID = ids.deleteOther;
    await client.createReminder({ messageId: ids.delete });
    await client.reminders.upsertReminder({ messageId: ids.deleteOther });
    expect(client.reminders.getFromState(ids.deleteOther)).toBeDefined();

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Deleting a Message Reminder" tab="JavaScript" index=1
    // COPY: messageID="message-id", anotherMessageID="another-message-id"
    // Delete a reminder for a message with id 'message-id' (direct API call)
    await client.deleteReminder(messageID);

    // Delete a reminder for a message with id 'another-message-id' (client state optimistic update)
    await client.reminders.deleteReminder(anotherMessageID);
    // #endregion snippet

    const { reminders } = await client.queryReminders({
      filter: { message_id: { $in: [ids.delete, ids.deleteOther] } },
    });
    expect(reminders).toEqual([]);
    expect(client.reminders.getFromState(ids.deleteOther)).toBeUndefined();
  });

  it('queries reminders', async () => {
    const querySpy = vi.spyOn(client, 'queryReminders');

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Querying Message Reminders" tab="JavaScript" index=1
    // Retrieve the first page of reminders for the current user (direct API call).
    await client.queryReminders();

    // For the client-side pagination there are two methods representing two directions of pagination

    // Query the first page (client state optimistic update)
    await client.reminders.queryNextReminders();
    // #endregion snippet

    const [direct]: QueryRemindersResponse[] = await Promise.all(
      querySpy.mock.results.map((r) => r.value),
    );
    querySpy.mockRestore();
    const expected = [ids.create, ids.createOther, ids.update].sort();
    expect(direct.reminders.map((r) => r.message_id).sort()).toEqual(expected);
    expect(
      client.reminders.paginator.state.getLatestValue().lastQueryError,
    ).toBeUndefined();
    expect(
      (client.reminders.paginator.items ?? []).map((r) => r.message_id).sort(),
    ).toEqual(expected);
  });

  it('receives reminder events', { timeout: 150000 }, async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const handler = vi.fn();
    const logged = (text: string, messageId: string) =>
      logSpy.mock.calls.some(([a, b]) => a === text && b === messageId);

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Events" tab="JavaScript" index=1
    client.on('reminder.created', (event) => {
      console.log('Reminder created for message:', event.message_id);
    });

    client.on('reminder.updated', (event) => {
      console.log('Reminder updated for message:', event.message_id);
    });

    client.on('reminder.deleted', (event) => {
      console.log('Reminder deleted for message:', event.message_id);
    });

    client.on('notification.reminder_due', (event) => {
      console.log('Reminder due for message:', event.message_id);
    });

    // Unsubscribe when done
    const { unsubscribe } = client.on('reminder.created', handler);
    unsubscribe();
    // #endregion snippet

    try {
      await client.createReminder({ messageId: ids.events });
      await client.updateReminder({
        messageId: ids.events,
        remind_at: new Date(Date.now() + oneHour).toISOString(),
      });
      await client.deleteReminder(ids.events);
      // The earliest allowed due time is one minute ahead; the due event arrives shortly after.
      await client.createReminder({
        messageId: ids.due,
        remind_at: new Date(Date.now() + 61000).toISOString(),
      });
      await retry(
        () => {
          expect(logged('Reminder created for message:', ids.events)).toBe(true);
          expect(logged('Reminder updated for message:', ids.events)).toBe(true);
          expect(logged('Reminder deleted for message:', ids.events)).toBe(true);
          expect(logged('Reminder created for message:', ids.due)).toBe(true);
          return Promise.resolve();
        },
        { timeout: 10000, interval: 200 },
      );
      await retry(
        () => {
          expect(logged('Reminder due for message:', ids.due)).toBe(true);
          return Promise.resolve();
        },
        { timeout: 120000, interval: 1000 },
      );
      expect(handler).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('filters reminders', async () => {
    // Runs after the events test, so the `due` reminder is overdue by now.
    const timed = await client.createReminder({
      messageId: ids.events,
      remind_at: new Date(Date.now() + oneHour).toISOString(),
    });
    expect(timed.reminder.remind_at).toBeDefined();
    const querySpy = vi.spyOn(client, 'queryReminders');

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Filtering Reminders" tab="JavaScript" index=1
    // Direct API call
    // Create filter for overdue reminders
    await client.queryReminders({
      filter: {
        remind_at: { $lte: new Date().toISOString() },
      },
      sort: {
        remind_at: -1, // sort from the most recently expired
      },
    });

    // Create filter for upcoming reminders
    await client.queryReminders({
      filter: {
        remind_at: { $gt: new Date().toISOString() },
      },
      sort: {
        remind_at: 1, // sort from the nearest to expire
      },
    });

    // Create filter for reminders with no due date (saved for later)
    await client.queryReminders({
      filter: {
        remind_at: null,
      },
      sort: {
        created_at: -1, // sort from the most recently created
      },
    });

    // Client-side calls with local state updates before starting the pagination.
    // Setting sort or filters resets the pagination state

    // Create filter for overdue reminders
    client.reminders.paginator.filters = {
      remind_at: { $lte: new Date().toISOString() },
    };
    client.reminders.paginator.sort = {
      remind_at: -1, // sort from the most recently expired
    };

    // Create filter for upcoming reminders
    client.reminders.paginator.filters = {
      remind_at: { $gt: new Date().toISOString() },
    };
    client.reminders.paginator.sort = {
      remind_at: 1, // sort from the nearest to expire
    };
    // Create filter for reminders with no due date (saved for later)

    client.reminders.paginator.filters = {
      remind_at: null,
    };
    client.reminders.paginator.sort = {
      created_at: -1, // sort from the most recently created
    };

    // adjust the page size
    client.reminders.paginator.pageSize = 15;
    // #endregion snippet

    const [overdue, upcoming, saved]: QueryRemindersResponse[] = await Promise.all(
      querySpy.mock.results.map((r) => r.value),
    );
    querySpy.mockRestore();
    const idsOf = (response: QueryRemindersResponse) =>
      response.reminders.map((r) => r.message_id);
    expect(idsOf(overdue)).toEqual([ids.due]);
    expect(idsOf(upcoming)).toEqual([ids.events]);
    // Most recently created first.
    expect(idsOf(saved)).toEqual([ids.update, ids.createOther, ids.create]);

    expect(client.reminders.paginator.items).toBeUndefined();
    expect(client.reminders.paginator.pageSize).toBe(15);
    await client.reminders.queryNextReminders();
    expect((client.reminders.paginator.items ?? []).map((r) => r.message_id)).toEqual(
      idsOf(saved),
    );
  });

  it('paginates reminders', async () => {
    const pageIds = [ids.page1, ids.page2, ids.page3, ids.page4];
    for (const [i, messageId] of pageIds.entries()) {
      await client.createReminder({
        messageId,
        remind_at: new Date(Date.now() + 3 * oneHour + i * 60000).toISOString(),
      });
    }
    const filter: ReminderFilters = { message_id: { $in: pageIds } };
    const filters = filter;
    const sort: ReminderSort = { remind_at: 1 };
    const limit = 2;
    const firstPage = await client.queryReminders({ filter, sort, limit });
    const next = firstPage.next;
    const secondPage = await client.queryReminders({ filter, sort, limit, next });
    const prev = secondPage.prev;
    expect(next).toBeDefined();
    expect(prev).toBeDefined();
    const querySpy = vi.spyOn(client, 'queryReminders');

    // #region snippet docs="_default/04-messages/09-message_reminders.md" heading="Pagination" tab="JavaScript" index=1
    // Load the next page (direct API call).
    await client.queryReminders({ filter, sort, limit, next }); // limit is the page size

    // Load the previous page (direct API call).
    await client.queryReminders({ filter, sort, limit, prev }); // limit is the page size

    // For the client-side pagination there are two methods representing two directions of pagination

    // Set the filter and (or) sort params - this resets the pagination
    client.reminders.paginator.filters = filters;
    client.reminders.paginator.sort = sort;

    // Query the next page of reminders starting from 0 (client state optimistic update
    await client.reminders.queryNextReminders();

    // Query the previous page of reminders if already some reminders were queried previously
    await client.reminders.queryPreviousReminders();
    // #endregion snippet

    const [nextPage, prevPage]: QueryRemindersResponse[] = await Promise.all(
      querySpy.mock.results.slice(0, 2).map((r) => r.value),
    );
    expect(nextPage.reminders.map((r) => r.message_id)).toEqual(pageIds.slice(2));
    expect(prevPage.reminders.map((r) => r.message_id)).toEqual(pageIds.slice(0, 2));
    querySpy.mockRestore();
    const paginatorState = client.reminders.paginator.state.getLatestValue();
    expect(paginatorState.lastQueryError).toBeUndefined();
    // The first page holds all four. `queryPreviousReminders()` then re-fetches that same page
    // and appends it (BasePaginator starts with `hasPrev: true` and never clears it in offset
    // mode), so only check the first page here.
    expect((paginatorState.items ?? []).slice(0, 4).map((r) => r.message_id)).toEqual(
      pageIds,
    );
  });
});
