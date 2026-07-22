import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReminderResponse, StreamChat } from '../../../../src';
import { ReminderPaginator } from '../../../../src/pagination/paginators/ReminderPaginator';
import { getClientWithUser } from '../../test-utils/getClient';

const makeReminder = (messageId: string, createdAt: string): ReminderResponse =>
  ({
    channel_cid: 'messaging:x',
    created_at: createdAt,
    updated_at: createdAt,
    user_id: 'user',
    message_id: messageId,
  }) as unknown as ReminderResponse;

const response = (
  reminders: ReminderResponse[],
  cursors: { next?: string; prev?: string } = {},
) => ({ duration: '', reminders, ...cursors });

describe('ReminderPaginator', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
  });

  it('stores results in interval storage keyed by message_id', async () => {
    const paginator = new ReminderPaginator(client, { pageSize: 2 });
    vi.spyOn(client, 'queryReminders').mockResolvedValue(
      response(
        [
          makeReminder('m1', '2020-01-01T00:00:00.000Z'),
          makeReminder('m2', '2020-01-02T00:00:00.000Z'),
        ],
        { next: 'next-cursor' },
      ),
    );

    await paginator.executeQuery({});

    expect(paginator.items?.map((r) => r.message_id)).toEqual(['m1', 'm2']);
    // interval storage: addressable by message_id + mirrored into the head window
    expect(paginator.getItem('m1')?.message_id).toBe('m1');
    expect(paginator.latestItems.map((r) => r.message_id)).toEqual(['m1', 'm2']);
    expect(paginator.hasMoreTail).toBe(true);
    expect(paginator.cursor?.tailward).toBe('next-cursor');
  });

  it('appends forward pages and dedupes by message_id', async () => {
    const paginator = new ReminderPaginator(client, { pageSize: 2 });
    const spy = vi.spyOn(client, 'queryReminders');
    spy.mockResolvedValueOnce(
      response(
        [
          makeReminder('m1', '2020-01-01T00:00:00.000Z'),
          makeReminder('m2', '2020-01-02T00:00:00.000Z'),
        ],
        { next: 'c1' },
      ),
    );
    await paginator.executeQuery({});

    spy.mockResolvedValueOnce(
      response([
        makeReminder('m2', '2020-01-02T00:00:00.000Z'), // duplicate
        makeReminder('m3', '2020-01-03T00:00:00.000Z'),
      ]),
    );
    await paginator.toTail();

    expect(paginator.items?.map((r) => r.message_id)).toEqual(['m1', 'm2', 'm3']);
    expect(paginator.hasMoreTail).toBe(false);
    expect(paginator.cursor?.tailward).toBeNull();
  });

  it('orders by the requested sort; changing sort resets and re-orders', async () => {
    const paginator = new ReminderPaginator(client, { pageSize: 3 });
    const page = [
      makeReminder('m2', '2020-01-02T00:00:00.000Z'),
      makeReminder('m1', '2020-01-01T00:00:00.000Z'),
      makeReminder('m3', '2020-01-03T00:00:00.000Z'),
    ];
    const spy = vi.spyOn(client, 'queryReminders').mockResolvedValue(response(page));

    // default sort: created_at ascending
    await paginator.executeQuery({});
    expect(paginator.items?.map((r) => r.message_id)).toEqual(['m1', 'm2', 'm3']);

    // changing sort resets accumulated pages and re-orders the next load
    paginator.sort = { created_at: -1 };
    expect(paginator.items).toBeUndefined();
    spy.mockResolvedValue(response(page));
    await paginator.executeQuery({});
    expect(paginator.items?.map((r) => r.message_id)).toEqual(['m3', 'm2', 'm1']);
  });
});
