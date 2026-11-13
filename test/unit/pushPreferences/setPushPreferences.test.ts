import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PushPreferencesResponse,
  PushScheduleResponse,
  StreamChat,
} from '../../../src';
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
  const post = vi.spyOn(client, 'post');
  return { client, post };
};

// `user_preferences` as the API returns it: the full stored preferences of every user
// in the request, or null for a user with only channel-level items.
const respondWith = (
  post: ReturnType<typeof setup>['post'],
  userPreferences: Record<string, PushPreferencesResponse | null>,
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

  it('sends the preferences and stores the returned ones on the connected user', async () => {
    const { client, post } = setup();
    const returned: PushPreferencesResponse = {
      call_level: 'none',
      chat_level: 'mentions',
      schedule: fridayNight,
    };
    respondWith(post, { [userId]: returned });

    await client.setPushPreferences([{ call_level: 'none' }]);

    expect(post).toHaveBeenCalledWith(`${client.baseURL}/push_preferences`, {
      preferences: [{ call_level: 'none' }],
    });
    expect(client.user).toHaveProperty('push_preferences', returned);
  });

  it('drops the preferences the response no longer has', async () => {
    const { client, post } = setup();
    respondWith(post, { [userId]: { chat_level: 'mentions' } });

    await client.setPushPreferences([{ remove_schedule: true }]);

    expect(client.user).toHaveProperty('push_preferences', { chat_level: 'mentions' });
  });

  it('leaves the connected user unchanged for a channel preference', async () => {
    const { client, post } = setup();
    const user = client.user;
    respondWith(post, { [userId]: null });

    await client.setPushPreferences([
      { channel_cid: 'messaging:general', chat_level: 'none' },
    ]);

    expect(client.user).toBe(user);
  });
});
