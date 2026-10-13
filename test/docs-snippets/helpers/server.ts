import type {
  MessageRequest,
  QueryChannelsRequest,
  SendMessageRequest,
  StreamClient,
} from '@stream-io/node-sdk';

/**
 * Server-side lookups and actions the tests repeat. Lookups throw unless exactly one
 * result matches, so a filter that matches nothing can't make a falsy-field check pass.
 */

const expectOne = <T>(items: T[], what: string): T => {
  if (items.length !== 1) {
    throw new Error(`expected exactly one ${what}, got ${items.length}`);
  }
  return items[0];
};

/** Sends a message as `message.user_id` and returns it. */
export const sendServerMessage = async (
  serverClient: StreamClient,
  cid: string,
  message: MessageRequest & { user_id: string },
  options: Omit<SendMessageRequest, 'message'> = {},
) => {
  const [type, id] = cid.split(':');
  const response = await serverClient.chat
    .channel(type, id)
    .sendMessage({ message, ...options });
  return response.message;
};

/** The user with id `userId`. */
export const getServerUser = async (serverClient: StreamClient, userId: string) => {
  const { users } = await serverClient.queryUsers({
    payload: { filter_conditions: { id: userId } },
  });
  return expectOne(users, `user ${userId}`);
};

/** `userId`'s member row in channel `cid`. */
export const getServerMember = async (
  serverClient: StreamClient,
  cid: string,
  userId: string,
) => {
  const [type, id] = cid.split(':');
  const { members } = await serverClient.chat
    .channel(type, id)
    .queryMembers({ payload: { filter_conditions: { user_id: userId } } });
  return expectOne(members, `member ${userId} of ${cid}`);
};

/**
 * Channel `cid` as returned by `queryChannels` (`{ channel, messages, members, ... }`).
 * Pass `user_id` (and `message_limit`) to get that user's view of it.
 */
export const getServerChannel = async (
  serverClient: StreamClient,
  cid: string,
  options: Omit<QueryChannelsRequest, 'filter_conditions'> = {},
) => {
  const { channels } = await serverClient.chat.queryChannels({
    filter_conditions: { cid },
    ...options,
  });
  return expectOne(channels, `channel ${cid}`);
};

/** Polls survive their creator's deletion: deletes every poll `userId` created. */
export const deletePollsCreatedBy = async (
  serverClient: StreamClient,
  userId: string,
) => {
  const { polls } = await serverClient.queryPolls({
    filter: { created_by_id: userId },
    limit: 100,
    user_id: userId,
  });
  for (const poll of polls) {
    await serverClient.deletePoll({ poll_id: poll.id, user_id: userId });
  }
};

type AppSettings = Awaited<ReturnType<StreamClient['getApp']>>['app'];

/**
 * App setting changes are eventually consistent across API nodes: polls `getApp()`
 * until `agreeing` consecutive reads return `expected` for `key`.
 */
export const waitForAppSetting = async <K extends keyof AppSettings>(
  serverClient: StreamClient,
  key: K,
  expected: AppSettings[K],
  { agreeing = 20, attempts = 120, interval = 500 } = {},
) => {
  let streak = 0;
  for (let attempt = 0; attempt < attempts && streak < agreeing; attempt++) {
    const { app } = await serverClient.getApp();
    streak = app[key] === expected ? streak + 1 : 0;
    if (streak === 0) await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (streak < agreeing) {
    throw new Error(`app setting ${String(key)} never settled on ${String(expected)}`);
  }
};
