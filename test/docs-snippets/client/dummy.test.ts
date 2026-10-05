import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../helpers/clients';
import { Cleanup } from '../helpers/cleanup';
import { uniqueId } from '../helpers/ids';

// Sanity check for the client-side setup: connect a user with a user token and send a message.
describe('client-side setup (dummy)', () => {
  const cleanup = new Cleanup(getServerClient());
  const userId = uniqueId('john');
  const channelId = uniqueId('general');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId, name: 'John' });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sends a message', async () => {
    const channel = client.channel('messaging', channelId, { members: [userId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();

    const message = await channel.sendMessage({
      text: 'Hello, world!',
    });

    expect(message.message.text).toBe('Hello, world!');
    expect(message.message.user?.id).toBe(userId);
  });
});
