import type { StreamClient, UpdateChannelTypeRequest } from '@stream-io/node-sdk';

/**
 * Updates a channel type with only the fields in `patch`. The node-sdk request requires
 * `automod`, `automod_behavior` and `max_message_length`, so their current values are
 * read and passed through unchanged. Call `waitForChannelTypePropagation()` after it.
 */
export const updateChannelType = async (
  serverClient: StreamClient,
  name: string,
  patch: Partial<UpdateChannelTypeRequest>,
) => {
  const current = await serverClient.chat.getChannelType({ name });
  return serverClient.chat.updateChannelType({
    name,
    automod: current.automod,
    automod_behavior: current.automod_behavior,
    max_message_length: current.max_message_length,
    ...patch,
  });
};
