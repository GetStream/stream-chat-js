import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nsToMs, StreamChat } from '../../../../../src';
import type { TimestampNS, UpsertPushPreferencesResponse } from '../../../../../src';
import {
  createUserToken,
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

// Push delivery isn't checked: reading the saved preferences back is enough. User-level
// preferences come back in the connect response (`me.push_preferences`), channel-member
// preferences on `channel.push_preferences` after `queryChannelsAndHydrate`.
describe('platform/03-events-and-notifications/05-push-preferences.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const general = `messaging:${uniqueId('general')}`;
  const announcements = `messaging:${uniqueId('announcements')}`;
  const urgentAlerts = `messaging:${uniqueId('urgent-alerts')}`;
  const socialChat = `messaging:${uniqueId('social-chat')}`;
  let client: StreamChat;

  /** The user's own push preferences, as a fresh connection of the same user sees them. */
  const getUserPreferences = async () => {
    const reader = new StreamChat(process.env.STREAM_API_KEY as string, {
      allowServerSideConnect: true,
    });
    try {
      const response = await reader.connectUser({ id: userId }, createUserToken(userId));
      return response?.me?.push_preferences;
    } finally {
      await reader.disconnectUser();
    }
  };

  /** Channel-member push preferences of the connected user, by cid. */
  const getChannelPreferences = async () => {
    const channels = await client.queryChannelsAndHydrate({
      filter_conditions: {
        cid: { $in: [general, announcements, urgentAlerts, socialChat] },
      },
    });
    return Object.fromEntries(
      channels.map((channel) => [channel.cid, channel.push_preferences]),
    );
  };

  /** `disabled_until` comes back as a unix-nanosecond timestamp. */
  const isAbout = (actual: TimestampNS | undefined, expected: Date) =>
    actual !== undefined && Math.abs(nsToMs(actual) - expected.getTime()) < 1000;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    // Channel preferences need an existing channel ("channel with CID ... does not exist").
    for (const cid of [general, announcements, urgentAlerts, socialChat]) {
      cleanup.channels.push(cid);
      const [type, id] = cid.split(':');
      await serverClient.chat.channel(type, id).getOrCreate({
        data: { created_by_id: userId, members: [{ user_id: userId }] },
      });
    }
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sets user-level preferences', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="User-Level Preferences" tab="JavaScript" index=1
    // Set user-level push preferences for the current user
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          chat_level: 'mentions',
        },
      ],
    });
    // #endregion snippet

    expect((await getUserPreferences())?.chat_level).toBe('mentions');
  });

  it('sets channel-member preferences', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="Channel-Member Preferences" tab="JavaScript" index=1
    // COPY: general="messaging:general", announcements="messaging:announcements"
    // Set per-channel preferences for the current user
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          channel_cid: general,
          chat_level: 'none',
        },
        {
          channel_cid: announcements,
          chat_level: 'all',
        },
      ],
    });
    // #endregion snippet

    const preferences = await getChannelPreferences();
    expect(preferences[general]?.chat_level).toBe('none');
    expect(preferences[announcements]?.chat_level).toBe('all');
  });

  it('sets preferences client-side', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="Client-Side Usage" tab="JavaScript" index=1
    // COPY: general="messaging:general"
    // Client-side - can only update current user's preferences
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          // user_id is optional and will be automatically set to current user
          chat_level: 'mentions',
        },
        {
          // Set preferences for a specific channel
          channel_cid: general,
          chat_level: 'all',
        },
      ],
    });
    // #endregion snippet

    expect((await getUserPreferences())?.chat_level).toBe('mentions');
    expect((await getChannelPreferences())[general]?.chat_level).toBe('all');
  });

  it('creates a "Do Not Disturb" mode', async () => {
    const spy = vi.spyOn(client, 'updatePushNotificationPreferences');
    let responses: UpsertPushPreferencesResponse[];
    try {
      // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="1: Creating a \"Do Not Disturb\" Mode" tab="JavaScript" index=1
      // Disable all push notifications
      await client.updatePushNotificationPreferences({
        preferences: [
          {
            chat_level: 'none',
          },
        ],
      });

      // Later, re-enable all push notifications
      await client.updatePushNotificationPreferences({
        preferences: [
          {
            chat_level: 'all',
          },
        ],
      });
      // #endregion snippet
      responses = await Promise.all(spy.mock.results.map((result) => result.value));
    } finally {
      spy.mockRestore();
    }

    expect(
      responses.map((response) => response.user_preferences[userId]?.chat_level),
    ).toEqual(['none', 'all']);
    expect((await getUserPreferences())?.chat_level).toBe('all');
  });

  it('sets channel-specific notification settings', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="2: Channel-Specific Notification Settings" tab="JavaScript" index=1
    // COPY: general="messaging:general", urgentAlerts="messaging:urgent-alerts", socialChat="messaging:social-chat"
    // Set different preferences for different channels
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          channel_cid: general,
          chat_level: 'mentions', // Default: mentions only
        },
        {
          channel_cid: urgentAlerts,
          chat_level: 'all', // Always notify for urgent alerts
        },
        {
          channel_cid: socialChat,
          chat_level: 'none', // Never notify for social chat
        },
      ],
    });
    // #endregion snippet

    const preferences = await getChannelPreferences();
    expect(preferences[general]?.chat_level).toBe('mentions');
    expect(preferences[urgentAlerts]?.chat_level).toBe('all');
    expect(preferences[socialChat]?.chat_level).toBe('none');
  });

  it('temporarily disables push notifications', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="3: Temporarily Disabling Push Notifications" tab="JavaScript" index=1
    // COPY: general="messaging:general"
    // Disable push notifications for 2 hours for the current user
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await client.updatePushNotificationPreferences({
      preferences: [
        {
          chat_level: 'all',
          disabled_until: twoHoursFromNow,
        },
      ],
    });

    // Disable push notifications for a specific channel until tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow

    await client.updatePushNotificationPreferences({
      preferences: [
        {
          channel_cid: general,
          chat_level: 'all',
          disabled_until: tomorrow,
        },
      ],
    });
    // #endregion snippet

    const userPreferences = await getUserPreferences();
    expect(userPreferences?.chat_level).toBe('all');
    expect(isAbout(userPreferences?.disabled_until, twoHoursFromNow)).toBe(true);
    const channelPreferences = (await getChannelPreferences())[general];
    expect(channelPreferences?.chat_level).toBe('all');
    expect(isAbout(channelPreferences?.disabled_until, tomorrow)).toBe(true);
  });

  it('sets granular preferences', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="Setting granular preferences" tab="JavaScript" index=1
    // COPY: general="messaging:general"
    // User-level: only receive pushes for direct mentions and thread replies
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          chat_preferences: {
            default_preference: 'none',
            direct_mentions: 'all',
            thread_replies: 'all',
          },
        },
      ],
    });

    // Channel-member level: mute @channel and @here in a noisy channel
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          channel_cid: general,
          chat_preferences: {
            default_preference: 'all',
            channel_mentions: 'none',
            here_mentions: 'none',
          },
        },
      ],
    });
    // #endregion snippet

    const userPreferences = await getUserPreferences();
    expect(userPreferences?.chat_preferences).toEqual({
      default_preference: 'none',
      direct_mentions: 'all',
      thread_replies: 'all',
    });
    // `chat_preferences` clears `chat_level`.
    expect(userPreferences?.chat_level).toBeUndefined();
    expect((await getChannelPreferences())[general]?.chat_preferences).toEqual({
      default_preference: 'all',
      channel_mentions: 'none',
      here_mentions: 'none',
    });
  });

  it('switches from chat_preferences back to chat_level', async () => {
    await client.updatePushNotificationPreferences({
      preferences: [{ chat_preferences: { default_preference: 'none' } }],
    });

    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="Switching between chat_level and chat_preferences" tab="JavaScript" index=1
    // Switch from granular preferences back to a simple level
    await client.updatePushNotificationPreferences({
      preferences: [
        {
          chat_level: 'all_mentions',
        },
      ],
    });
    // #endregion snippet

    const userPreferences = await getUserPreferences();
    expect(userPreferences?.chat_level).toBe('all_mentions');
    expect(userPreferences?.chat_preferences).toBeUndefined();
  });

  it('sets call push preferences', async () => {
    // #region snippet docs="platform/03-events-and-notifications/05-push-preferences.md" heading="Setting Call Push Preferences" tab="JavaScript" index=1
    // COPY: userId="user-1"
    // Set call-level preferences with temporary disabling
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

    await client.updatePushNotificationPreferences({
      preferences: [
        {
          user_id: userId,
          call_level: 'all',
          disabled_until: oneHourFromNow,
        },
      ],
    });
    // #endregion snippet

    const userPreferences = await getUserPreferences();
    expect(userPreferences?.call_level).toBe('all');
    expect(isAbout(userPreferences?.disabled_until, oneHourFromNow)).toBe(true);
  });
});
