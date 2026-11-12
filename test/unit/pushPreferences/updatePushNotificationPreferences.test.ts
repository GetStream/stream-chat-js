import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PushScheduleResponse, StreamChat } from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';

const userId = 'user1';

const fridayNight: PushScheduleResponse = {
  quiet_hours: [{ days: ['fri'], end: '07:00', start: '22:00' }],
  timezone: 'Europe/Amsterdam',
};

const setup = () => {
  const client = getClientWithUser({
    id: userId,
    push_preferences: { chat_level: 'mentions', schedule: fridayNight },
  }) as StreamChat;
  const sendRequest = vi.spyOn(client.api, 'sendRequest');
  return { client, sendRequest };
};

// `user_preferences` as the API returns it: the full stored preferences of every user
// in the request, or null for a user with only channel-level items.
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

  it('sends the preferences and stores the returned ones on the connected user', async () => {
    const { client, sendRequest } = setup();
    const returned = {
      call_level: 'none',
      chat_level: 'mentions',
      schedule: fridayNight,
    };
    respondWith(sendRequest, { [userId]: returned });

    await client.updatePushNotificationPreferences({
      preferences: [{ call_level: 'none' }],
    });

    expect(sendRequest).toHaveBeenCalledWith(
      'POST',
      '/api/v2/push_preferences',
      undefined,
      undefined,
      { preferences: [{ call_level: 'none' }] },
      'application/json',
      undefined,
    );
    expect(client.user?.push_preferences).toEqual(returned);
  });

  it('drops the preferences the response no longer has', async () => {
    const { client, sendRequest } = setup();
    respondWith(sendRequest, { [userId]: { chat_level: 'mentions' } });

    await client.updatePushNotificationPreferences({
      preferences: [{ remove_schedule: true }],
    });

    expect(client.user?.push_preferences).toEqual({ chat_level: 'mentions' });
  });

  it('leaves the connected user unchanged for a channel preference', async () => {
    const { client, sendRequest } = setup();
    const user = client.user;
    respondWith(sendRequest, { [userId]: null });

    await client.updatePushNotificationPreferences({
      preferences: [{ channel_cid: 'messaging:general', chat_level: 'none' }],
    });

    expect(client.user).toBe(user);
  });
});
