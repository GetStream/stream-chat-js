import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PushScheduleResponse, StreamChat } from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';

const userId = 'user1';

const nightSchedule: PushScheduleResponse = {
  quiet_hours: [{ days: ['mon', 'tue'], end: '07:00', start: '22:00' }],
  timezone: 'Europe/Amsterdam',
};

const setup = () => {
  const client = getClientWithUser({
    id: userId,
    push_preferences: { chat_level: 'all' },
  }) as StreamChat;
  const sendRequest = vi.spyOn(client.api, 'sendRequest');
  return { client, sendRequest };
};

const respondWith = (
  sendRequest: ReturnType<typeof setup>['sendRequest'],
  userPreferences: Record<string, unknown>,
) =>
  sendRequest.mockResolvedValue({
    duration: '',
    user_channel_preferences: {},
    user_preferences: userPreferences,
  } as never);

describe('client.updatePushNotificationPreferences', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the quiet hours schedule', async () => {
    const { client, sendRequest } = setup();
    respondWith(sendRequest, {
      [userId]: { chat_level: 'all', schedule: nightSchedule },
    });

    await client.updatePushNotificationPreferences({
      preferences: [{ schedule: nightSchedule }],
    });

    expect(sendRequest).toHaveBeenCalledWith(
      'POST',
      '/api/v2/push_preferences',
      undefined,
      undefined,
      { preferences: [{ schedule: nightSchedule }] },
      'application/json',
      undefined,
    );
  });

  it('keeps the schedule on the connected user', async () => {
    const { client, sendRequest } = setup();
    respondWith(sendRequest, {
      [userId]: { chat_level: 'all', schedule: nightSchedule },
    });

    await client.updatePushNotificationPreferences({
      preferences: [{ schedule: nightSchedule }],
    });

    expect(client.user?.push_preferences).toEqual({
      chat_level: 'all',
      schedule: nightSchedule,
    });
  });

  it('removes the schedule from the connected user after remove_schedule', async () => {
    const { client, sendRequest } = setup();
    client.user = {
      ...client.user,
      id: userId,
      push_preferences: { schedule: nightSchedule },
    };
    respondWith(sendRequest, { [userId]: {} });

    await client.updatePushNotificationPreferences({
      preferences: [{ remove_schedule: true }],
    });

    expect(client.user?.push_preferences).toEqual({});
  });

  it('leaves the connected user unchanged for a channel preference', async () => {
    const { client, sendRequest } = setup();
    const user = client.user;
    respondWith(sendRequest, {});

    await client.updatePushNotificationPreferences({
      preferences: [{ channel_cid: 'messaging:general', chat_level: 'none' }],
    });

    expect(client.user).toBe(user);
  });
});
