import { formatMessage } from '../utils';
import { chatLoggerSystem } from '../logger';
import type { StreamChat } from '../client';
import type { LocalMessage, UserResponse } from '../types';

const logger = chatLoggerSystem.getLogger('message-composer');

export const resolveUsersByIds = async (
  client: StreamChat,
  userIds: string[] = [],
): Promise<UserResponse[]> => {
  const knownUsers = client.state.users;
  const missingUserIds = userIds.filter((userId) => !knownUsers[userId]);
  const fetchedUsers: Record<string, UserResponse> = {};

  if (missingUserIds.length) {
    try {
      const { users } = await client.queryUsers({
        payload: { filter_conditions: { id: { $in: missingUserIds } } },
      });
      users.forEach((user) => (fetchedUsers[user.id] = user));
    } catch (error) {
      logger.withExtraTags('resolveUsersByIds').error('Resolving the users failed.', {
        error,
      });
    }
  }

  return userIds.map(
    (userId) =>
      knownUsers[userId] ?? fetchedUsers[userId] ?? ({ id: userId } as UserResponse),
  );
};

export const resolveMessageById = async (
  client: StreamChat,
  id: string,
): Promise<LocalMessage | null> => {
  const storedMessage = client.messageStore.get(id);
  if (storedMessage) return storedMessage;

  try {
    const { message } = await client.getMessage({ id });
    return formatMessage(message);
  } catch (error) {
    logger.withExtraTags('resolveMessageById').error('Resolving the message failed.', {
      error,
    });
    return null;
  }
};
