import { afterAll, describe, expect, it } from 'vitest';
import { StreamChat } from '../../../../src';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

const apiKey = process.env.STREAM_API_KEY as string;

describe('_default/02-init_and_users/05-authless_users.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const clients: StreamChat[] = [];

  // A fresh client without a user, the way a front end creates it before anyone logs in.
  const newClient = () => {
    const client = new StreamChat(apiKey, { allowServerSideConnect: true });
    clients.push(client);
    return client;
  };

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.disconnectUser()));
    await cleanup.run();
  });

  it('connects a guest user', async () => {
    const client = newClient();
    const guestId = uniqueId('tommaso');

    try {
      // #region snippet docs="_default/02-init_and_users/05-authless_users.md" heading="Guest Users" tab="JavaScript" index=1
      // COPY: guestId="tommaso"
      await client.setGuestUser({ id: guestId });
      // #endregion snippet
    } finally {
      // The API rewrites the id to `guest-<uuid>-<requested id>`.
      if (client.userID) cleanup.users.push(client.userID);
    }

    expect(client.userID).toMatch(new RegExp(`^guest-.+-${guestId}$`));
    expect(client.user?.role).toBe('guest');
    expect(client.wsConnection?.isHealthy).toBe(true);
  });

  it('connects an anonymous user', async () => {
    const client = newClient();

    // #region snippet docs="_default/02-init_and_users/05-authless_users.md" heading="Anonymous Users" tab="JavaScript" index=1
    const connectResponse = await client.connectAnonymousUser();

    console.log(connectResponse?.me);
    // #endregion snippet

    expect(client.wsConnection?.isHealthy).toBe(true);
    expect(connectResponse?.me?.role).toBe('anonymous');
    expect(connectResponse?.me?.id).toBe('!anon');
  });
});
