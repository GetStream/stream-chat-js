import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../helpers/clients';
import { Cleanup } from '../helpers/cleanup';
import { uniqueId } from '../helpers/ids';

// Sanity check for the server-side setup: create a channel and send a message on behalf of a user.
describe('server-side setup (dummy)', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const channelId = uniqueId('general');

  beforeAll(async () => {
    cleanup.users.push(userId);
    await serverClient.upsertUser({ id: userId, name: 'John' });
  });

  afterAll(() => cleanup.run());

  it('sends a message on behalf of a user', async () => {
    cleanup.channels.push(`messaging:${channelId}`);

    const channel = serverClient.channel('messaging', channelId, {
      created_by_id: userId,
      members: [userId],
    });
    await channel.create();

    const message = await channel.sendMessage({
      text: 'Hello, world!',
      user_id: userId,
    });

    expect(message.message.text).toBe('Hello, world!');
    expect(message.message.user?.id).toBe(userId);
  });
});
