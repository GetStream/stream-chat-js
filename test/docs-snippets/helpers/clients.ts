import { StreamClient } from '@stream-io/node-sdk';
import type { UserRequest } from '@stream-io/node-sdk';
import { StreamChat } from '../../../src';

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

/** The user `connectUser` takes: only `id` is required, custom data under `custom`. */
export type TestUser = Parameters<StreamChat['connectUser']>[0];

/** node-sdk requires `enabled` on each privacy setting; unset means enabled. */
const toPrivacySettings = (
  settings: TestUser['privacy_settings'],
): UserRequest['privacy_settings'] =>
  settings &&
  Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      { enabled: value?.enabled ?? true },
    ]),
  );

/** Converts a stream-chat-js user to a node-sdk `UserRequest`. */
export const toUserRequest = ({
  custom,
  id,
  image,
  invisible,
  language,
  name,
  privacy_settings,
  role,
  teams,
  teams_role,
}: TestUser): UserRequest => ({
  id,
  image,
  invisible,
  language,
  name,
  privacy_settings: toPrivacySettings(privacy_settings),
  role,
  teams,
  teams_role,
  ...(custom && Object.keys(custom).length ? { custom } : {}),
});

/** Creates or replaces users (stream-chat-js shape). */
export const upsertUsers = (serverClient: StreamClient, users: TestUser[]) =>
  serverClient.upsertUsers(users.map(toUserRequest));

/**
 * Client-side client connected as `user` with a user token, the way an app would.
 * The user is upserted first server-side.
 * Remember to call `disconnectClients` in `afterAll`.
 */
export const getClientSideClient = async (user: TestUser): Promise<StreamChat> => {
  await upsertUsers(getServerClient(), [user]);
  // `new StreamChat` instead of `getInstance` so several users can be connected in one file.
  const client = new StreamChat(apiKey(), { client: { allowServerSideConnect: true } });
  await client.connectUser(user, createUserToken(user.id));
  return client;
};

export const disconnectClients = async (...clients: StreamChat[]) => {
  await Promise.all(clients.map((client) => client.disconnectUser()));
};
