import { StreamChat } from '../../../src';
import type { UserResponse } from '../../../src';

const apiKey = () => process.env.STREAM_API_KEY as string;
const apiSecret = () => process.env.STREAM_API_SECRET as string;

/**
 * Server-side client (API key + secret). Use it for server-side snippets
 * (`serverClient` in the docs) and for setup / cleanup in client-side tests.
 */
export const getServerClient = () =>
  new StreamChat(apiKey(), apiSecret(), { allowServerSideConnect: true });

/**
 * Client-side client connected as `user` with a user token, the way an app would.
 * The user is upserted first with the server client.
 * Remember to call `disconnectClients` in `afterAll`.
 */
export const getClientSideClient = async (
  user: UserResponse & { id: string },
): Promise<StreamChat> => {
  const serverClient = getServerClient();
  await serverClient.upsertUser(user);
  // `new StreamChat` instead of `getInstance` so several users can be connected in one file.
  const client = new StreamChat(apiKey(), { allowServerSideConnect: true });
  await client.connectUser(user, serverClient.createToken(user.id));
  return client;
};

export const disconnectClients = async (...clients: StreamChat[]) => {
  await Promise.all(clients.map((client) => client.disconnectUser()));
};
