import type { StreamClient } from '@stream-io/node-sdk';
import { updateChannelType } from './channel-types';
import type { Cleanup } from './cleanup';
import { waitForChannelTypePropagation } from './wait';

/**
 * Adds permissions to the `channel_member` grants of the built-in `messaging` type and
 * registers a cleanup step that restores the original grants. Call
 * `waitForChannelTypePropagation()` after it, before using the new grants.
 */
export const grantMessagingMembers = async (
  serverClient: StreamClient,
  cleanup: Cleanup,
  permissions: string[],
) => {
  const { grants = {} } = await serverClient.chat.getChannelType({ name: 'messaging' });
  const original = grants.channel_member ?? [];
  cleanup.add(async () => {
    await updateChannelType(serverClient, 'messaging', {
      grants: { channel_member: original },
    });
    // Let the restore reach every API node before the DRIFT check reads it.
    await waitForChannelTypePropagation();
  });
  await updateChannelType(serverClient, 'messaging', {
    grants: { channel_member: [...new Set([...original, ...permissions])] },
  });
};
