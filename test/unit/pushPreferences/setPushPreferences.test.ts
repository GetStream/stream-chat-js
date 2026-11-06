import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PushScheduleResponse,
  StreamChat,
  UpsertPushPreferencesResponse,
} from '../../../src';
import { QuietHoursDay } from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';

const userId = 'user1';

const nightSchedule: PushScheduleResponse = {
  quiet_hours: [
    { days: [QuietHoursDay.Monday, QuietHoursDay.Tuesday], end: '07:00', start: '22:00' },
  ],
  timezone: 'Europe/Amsterdam',
};

const setup = () => {
  const client = getClientWithUser({
    id: userId,
    push_preferences: { chat_level: 'all' },
  }) as StreamChat;
  const post = vi.spyOn(client, 'post');
  return { client, post };
};

const respondWith = (
  post: ReturnType<typeof setup>['post'],
  userPreferences: UpsertPushPreferencesResponse['user_preferences'],
) =>
  post.mockResolvedValue({
    duration: '',
    user_channel_preferences: {},
    user_preferences: userPreferences,
  });

describe('client.setPushPreferences', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the quiet hours schedule', async () => {
    const { client, post } = setup();
    respondWith(post, { [userId]: { chat_level: 'all', schedule: nightSchedule } });

    await client.setPushPreferences([{ schedule: nightSchedule }]);

    expect(post).toHaveBeenCalledWith(`${client.baseURL}/push_preferences`, {
      preferences: [{ schedule: nightSchedule }],
    });
  });

  it('keeps the schedule on the connected user', async () => {
    const { client, post } = setup();
    respondWith(post, { [userId]: { chat_level: 'all', schedule: nightSchedule } });

    await client.setPushPreferences([{ schedule: nightSchedule }]);

    expect(client.user).toHaveProperty('push_preferences', {
      chat_level: 'all',
      schedule: nightSchedule,
    });
  });

  it('removes the schedule from the connected user after remove_schedule', async () => {
    const { client, post } = setup();
    client.user = { id: userId, push_preferences: { schedule: nightSchedule } } as never;
    respondWith(post, { [userId]: {} });

    await client.setPushPreferences([{ remove_schedule: true }]);

    expect(client.user).toHaveProperty('push_preferences', {});
  });

  it('leaves the connected user unchanged for a channel preference', async () => {
    const { client, post } = setup();
    const user = client.user;
    respondWith(post, {});

    await client.setPushPreferences([
      { channel_cid: 'messaging:general', chat_level: 'none' },
    ]);

    expect(client.user).toBe(user);
  });
});
