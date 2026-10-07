import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StreamChat } from '../../../../src';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { getServerUser, waitForAppSetting } from '../../helpers/server';

describe('_default/02-init_and_users/01-client_tokens_and_authentication.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  cleanup.users.push(userId);
  // A client initialized with the API key alone, the way the docs set it up.
  const client = new StreamChat(process.env.STREAM_API_KEY as string, {
    allowServerSideConnect: true,
  });
  let originalDisableAuthChecks = false;

  // The WS edge picks up `disable_auth_checks` later than the REST API: probe with a
  // throwaway dev-token connection until it's accepted.
  const waitForDevTokensAccepted = async () => {
    const deadline = Date.now() + 75000;
    for (;;) {
      const probe = new StreamChat(process.env.STREAM_API_KEY as string, {
        allowServerSideConnect: true,
      });
      try {
        await probe.connectUser({ id: userId }, probe.devToken(userId));
        await probe.disconnectUser();
        return;
      } catch (error) {
        await probe.disconnectUser();
        if (Date.now() > deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  };

  beforeAll(async () => {
    const { app } = await serverClient.getApp();
    originalDisableAuthChecks = app.disable_auth_checks;
  });

  afterAll(async () => {
    await client.disconnectUser();
    await cleanup.run();
  });

  it('rejects a developer token while authentication checks are enabled', async ({
    skip,
  }) => {
    if (originalDisableAuthChecks) skip('auth checks are already disabled on the app');

    const devClient = new StreamChat(process.env.STREAM_API_KEY as string, {
      allowServerSideConnect: true,
    });
    await expect(
      devClient.connectUser({ id: userId }, devClient.devToken(userId)),
    ).rejects.toThrow(/"StatusCode":401/);
    await devClient.disconnectUser();
  });

  it('connects a user with a developer token', async () => {
    // Developer tokens need "Disable Authentication Checks" (development apps only).
    cleanup.add(async () => {
      await serverClient.updateApp({
        disable_auth_checks: originalDisableAuthChecks,
      });
      await waitForAppSetting(
        serverClient,
        'disable_auth_checks',
        originalDisableAuthChecks,
      );
    });
    await serverClient.updateApp({ disable_auth_checks: true });
    await waitForAppSetting(serverClient, 'disable_auth_checks', true);
    await waitForDevTokensAccepted();

    // #region snippet docs="_default/02-init_and_users/01-client_tokens_and_authentication.md" heading="Developer Tokens" tab="JavaScript" index=1
    // COPY: userId="john"
    await client.connectUser(
      {
        id: userId,
        name: 'John Doe',
        image: 'https://getstream.io/random_svg/?name=John',
      },
      client.devToken(userId),
    );
    // #endregion snippet

    expect(client.userID).toBe(userId);
    expect(client.wsConnection?.isHealthy).toBe(true);
    const user = await getServerUser(serverClient, userId);
    expect(user.name).toBe('John Doe');
  });
});
