import type { StreamClient } from '@stream-io/node-sdk';
import { retryOnRateLimit, waitForTask } from './wait';

/** `deleteUsers` accepts at most 100 ids per call. */
const DELETE_USERS_BATCH_SIZE = 100;

/**
 * Hard deletes users (with their messages and conversations) in as few `deleteUsers`
 * calls as possible, retrying on 429, and waits for each delete task to finish.
 */
export const hardDeleteUsers = async (client: StreamClient, userIds: string[]) => {
  for (let i = 0; i < userIds.length; i += DELETE_USERS_BATCH_SIZE) {
    const batch = userIds.slice(i, i + DELETE_USERS_BATCH_SIZE);
    const { task_id } = await retryOnRateLimit(() =>
      client.deleteUsers({
        user_ids: batch,
        user: 'hard',
        messages: 'hard',
        conversations: 'hard',
      }),
    );
    await waitForTask(client, task_id);
  }
};
