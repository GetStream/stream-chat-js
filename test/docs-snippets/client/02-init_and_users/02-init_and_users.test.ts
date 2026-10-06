import { afterAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

const apiKey = process.env.STREAM_API_KEY as string;

// `stream-chat` resolves to src (alias in vitest.config.ts and tsconfig.json).
// #region snippet docs="_default/02-init_and_users/02-init_and_users.md" heading="" tab="JavaScript" index=1
// COPY: apiKey="{{ api_key }}"
import { StreamChat } from 'stream-chat';

const chatClient = StreamChat.getInstance(apiKey, {
  timeout: 6000,
});
// #endregion snippet

describe('_default/02-init_and_users/02-init_and_users.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const privacyUserId = uniqueId('john');
  const fallbackUserId = uniqueId('john');
  // `connectUser` creates the users, so register them before the snippets run.
  cleanup.users.push(userId, privacyUserId, fallbackUserId);
  const clients = [chatClient];

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.disconnectUser()));
    await cleanup.run();
  });

  it('initializes the client as a singleton', () => {
    expect(chatClient.key).toBe(apiKey);
    expect(chatClient.options.timeout).toBe(6000);
    expect(StreamChat.getInstance(apiKey)).toBe(chatClient);
  });

  it('connects and disconnects a user', async () => {
    // The docs leave `tokenProvider` to the app: here it returns a token signed by the server.
    const tokenProvider = () => Promise.resolve(serverClient.createToken(userId));

    // #region snippet docs="_default/02-init_and_users/02-init_and_users.md" heading="Connecting Users" tab="JavaScript" index=1
    // COPY: userId="john"
    await chatClient.connectUser(
      {
        id: userId,
        name: 'John Doe',
        image: 'https://getstream.io/random_svg/?name=John',
      },
      tokenProvider,
    );
    // #endregion snippet

    expect(chatClient.userID).toBe(userId);
    expect(chatClient.wsConnection?.isHealthy).toBe(true);
    const { users } = await serverClient.queryUsers({ id: userId });
    expect(users[0]?.name).toBe('John Doe');
    expect(users[0]?.image).toBe('https://getstream.io/random_svg/?name=John');

    // #region snippet docs="_default/02-init_and_users/02-init_and_users.md" heading="Disconnecting Users" tab="JavaScript" index=1
    await chatClient.disconnectUser();
    // #endregion snippet

    expect(chatClient.userID).toBeUndefined();
    expect(chatClient.wsConnection?.isHealthy).toBe(false);
  });

  it('connects a user with privacy settings', async () => {
    const userToken = serverClient.createToken(privacyUserId);

    // #region snippet docs="_default/02-init_and_users/02-init_and_users.md" heading="Privacy Settings" tab="JavaScript" index=1
    // COPY: privacyUserId="john", userToken="{{ chat_user_token }}"
    await chatClient.connectUser(
      {
        id: privacyUserId,
        name: 'John Doe',
        image: 'https://getstream.io/random_svg/?name=John',
        privacy_settings: {
          typing_indicators: {
            enabled: false,
          },
          read_receipts: {
            enabled: false,
          },
        },
      },
      userToken,
    );
    // #endregion snippet

    expect(chatClient.userID).toBe(privacyUserId);
    expect(chatClient.user?.privacy_settings).toEqual({
      typing_indicators: { enabled: false },
      read_receipts: { enabled: false },
    });
    const { users } = await serverClient.queryUsers({ id: privacyUserId });
    expect(users[0]?.privacy_settings).toEqual({
      typing_indicators: { enabled: false },
      read_receipts: { enabled: false },
    });

    await chatClient.disconnectUser();
  });

  it('enables the XHR fallback', async () => {
    const previousClient = StreamChat.getInstance(apiKey);
    // `getInstance` returns the existing singleton: drop it so the snippet creates a new client.
    Reflect.set(StreamChat, '_instance', undefined);

    // #region snippet docs="_default/02-init_and_users/02-init_and_users.md" heading="XHR Fallback" tab="JavaScript" index=1
    // COPY: apiKey="apiKey"
    const chatClient = StreamChat.getInstance(apiKey, { enableWSFallback: true });
    // #endregion snippet

    clients.push(chatClient);
    expect(chatClient).not.toBe(previousClient);
    expect(chatClient.options.enableWSFallback).toBe(true);

    await chatClient.connectUser(
      { id: fallbackUserId },
      serverClient.createToken(fallbackUserId),
    );
    expect(chatClient.userID).toBe(fallbackUserId);
  });
});
