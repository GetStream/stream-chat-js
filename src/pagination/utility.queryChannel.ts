import type { ChannelGetOrCreateRequest, ChannelStateResponse } from '../types';
import type { StreamChat } from '../client';
import type { Channel } from '../channel';
import { generateChannelTempCid } from '../utils';

/**
 * prevent from duplicate invocation of channel.watch()
 * when events 'notification.message_new' and 'notification.added_to_channel' arrive at the same time
 */
const WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL: Record<
  string,
  Promise<ChannelStateResponse> | undefined
> = {};

type GetChannelParams = {
  client: StreamChat;
  channel?: Channel;
  id?: string;
  members?: string[];
  options?: ChannelGetOrCreateRequest;
  type?: string;
};
/**
 * Watches a channel, coalescing concurrent invocations for the same CID.
 * If a watch is already in flight, this call waits for it to settle instead of
 * issuing another network request.
 *
 * @param params - The channel query parameters.
 * @param params.client - The chat client instance.
 * @param params.members - Member user ids used to construct or identify the channel.
 * @param params.options - Options forwarded to the underlying channel watch request.
 * @param params.type - The channel type.
 * @param params.id - The channel id.
 * @param params.channel - An existing channel to watch (skips construction from type/id/members).
 */
export const getChannel = async ({
  channel,
  client,
  id,
  members,
  options,
  type,
}: GetChannelParams) => {
  if (!channel && !type) {
    throw new Error('Channel or channel type have to be provided to query a channel.');
  }

  // unfortunately typescript is not able to infer that if (!channel && !type) === false, then channel or type has to be truthy

  const theChannel =
    channel ||
    // `members` are member IDs; the OpenAPI `ChannelData.members` expects member objects.
    client.channel(type as string, id, {
      members: members?.map((user_id) => ({ user_id })),
    });

  // need to keep as with call to channel.watch the id can be changed from undefined to an actual ID generated server-side
  const originalCid = theChannel?.id
    ? theChannel.cid
    : members && members.length
      ? generateChannelTempCid(theChannel.type, members)
      : undefined;

  if (!originalCid) {
    throw new Error(
      'Channel ID or channel members array have to be provided to query a channel.',
    );
  }

  const queryPromise = WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid];

  if (queryPromise) {
    await queryPromise;
  } else {
    try {
      WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid] = theChannel.watch(options);
      await WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid];
    } finally {
      delete WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid];
    }
  }

  return theChannel;
};
