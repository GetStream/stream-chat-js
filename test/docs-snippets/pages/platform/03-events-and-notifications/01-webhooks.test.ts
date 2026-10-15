import { afterAll, describe, expect, it } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { StreamChat } from '../../../../../src';
import { createUserToken, getServerClient, upsertUsers } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('platform/03-events-and-notifications/01-webhooks.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const apiKey = process.env.STREAM_API_KEY as string;
  let client: StreamChat | undefined;

  afterAll(async () => {
    await client?.disconnectUser();
    await cleanup.run();
  });

  it('sends the x-stream-ext header with every request', async () => {
    cleanup.users.push(userId);
    await upsertUsers(serverClient, [{ id: userId }]);

    // #region snippet docs="platform/03-events-and-notifications/01-webhooks.md" heading="Request info" tab="JavaScript" index=1
    client = new StreamChat(apiKey, {
      axiosRequestConfig: {
        headers: {
          'x-stream-ext': 'device-id=123',
        },
      },
    });
    // #endregion snippet

    // Webhook delivery isn't checked: the header reaching the API is enough.
    const requests: InternalAxiosRequestConfig[] = [];
    client.axiosInstance.interceptors.request.use((config) => {
      requests.push(config);
      return config;
    });
    client.options.allowServerSideConnect = true;
    await client.connectUser({ id: userId }, createUserToken(userId));
    await client.queryChannels({ members: { $in: [userId] } });

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.headers['x-stream-ext']).toBe('device-id=123');
    }
  });
});
