import { StreamClient } from '@stream-io/node-sdk';
import type { UserRequest } from '@stream-io/node-sdk';
import { StreamChat } from '../../../src';
import type { UserResponse } from '../../../src';

const apiKey = () => process.env.STREAM_API_KEY as string;
const apiSecret = () => process.env.STREAM_API_SECRET as string;

/**
 * Server-side client (`@stream-io/node-sdk`, API key + secret) for setup, cleanup and
 * assertions a client can't do. The docs snippets themselves run on stream-chat-js.
 */
export const getServerClient = () => new StreamClient(apiKey(), apiSecret());

/** User token for `userId`, signed with the API secret. */
export const createUserToken = (userId: string) =>
  getServerClient().generateUserToken({ user_id: userId });

/** node-sdk requires `enabled` on each privacy setting; unset means enabled. */
const toPrivacySettings = (
  settings: UserResponse['privacy_settings'],
): UserRequest['privacy_settings'] =>
  settings &&
  Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      { enabled: value?.enabled ?? true },
    ]),
  );

/**
 * Converts a stream-chat-js user (custom fields at the top level) to a node-sdk
 * `UserRequest` (custom fields under `custom`).
 */
export const toUserRequest = (user: UserResponse & { id: string }): UserRequest => {
  const {
    id,
    image,
    invisible,
    language,
    name,
    privacy_settings,
    role,
    teams,
    teams_role,
    ...rest
  } = user;
  const custom = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  return {
    id,
    image,
    invisible,
    language,
    name,
    privacy_settings: toPrivacySettings(privacy_settings),
    role,
    teams,
    teams_role: teams_role ?? undefined,
    ...(Object.keys(custom).length ? { custom } : {}),
  };
};

/** Creates or replaces users (stream-chat-js shape, custom fields at the top level). */
export const upsertUsers = (
  serverClient: StreamClient,
  users: Array<UserResponse & { id: string }>,
) => serverClient.upsertUsers(users.map(toUserRequest));

/**
 * Client-side client connected as `user` with a user token, the way an app would.
 * The user is upserted first server-side.
 * Remember to call `disconnectClients` in `afterAll`.
 */
export const getClientSideClient = async (
  user: UserResponse & { id: string },
): Promise<StreamChat> => {
  await upsertUsers(getServerClient(), [user]);
  // `new StreamChat` instead of `getInstance` so several users can be connected in one file.
  const client = new StreamChat(apiKey(), { allowServerSideConnect: true });
  await client.connectUser(user, createUserToken(user.id));
  return client;
};

export const disconnectClients = async (...clients: StreamChat[]) => {
  await Promise.all(clients.map((client) => client.disconnectUser()));
};
