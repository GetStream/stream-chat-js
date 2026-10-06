import type { StreamChat } from '../../../src';
import type { Cleanup } from './cleanup';
import { waitForChannelTypePropagation } from './wait';

/**
 * Adds permissions to the `channel_member` grants of the built-in `messaging` type and
 * registers a cleanup step that restores the original grants. Call
 * `waitForChannelTypePropagation()` after it, before using the new grants.
 */
export const grantMessagingMembers = async (
  serverClient: StreamChat,
  cleanup: Cleanup,
  permissions: string[],
) => {
  const { grants = {} } = await serverClient.getChannelType('messaging');
  const original = grants.channel_member ?? [];
  cleanup.add(async () => {
    await serverClient.updateChannelType('messaging', {
      grants: { channel_member: original },
    });
    // Let the restore reach every API node before the DRIFT check reads it.
    await waitForChannelTypePropagation();
  });
  await serverClient.updateChannelType('messaging', {
    grants: { channel_member: [...new Set([...original, ...permissions])] },
  });
};
