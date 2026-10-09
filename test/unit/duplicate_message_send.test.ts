import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type {
  Channel,
  MessageResponse,
  PendingTask,
  StableWSConnection,
  StreamChat,
} from '../../src';

import { generateMsg } from './test-utils/generateMessage';
import { getClientWithUser } from './test-utils/getClient';
import { MockOfflineDB } from './offline-support/MockOfflineDB';

/**
 * CHA-5603: a re-send of a message id the backend already stored is answered with
 * HTTP 400 / code 4 / "a message with ID … already exists" (the insert is ON CONFLICT DO NOTHING).
 * The SDK should treat that as delivered, not as a failed send.
 */

const DUPLICATE_ID_TEXT = (id: string) =>
  `SendMessage failed with error: "a message with ID ${id} already exists"`;

// Shape axios rejects with for a non-2xx response; doAxiosRequest turns it into ErrorFromResponse.
const axiosHttpError = (status: number, code: number, message: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: {
      status,
      data: { code, message, StatusCode: status, duration: '0.01ms', more_info: '' },
      headers: {},
      config: {},
    },
  });

const axiosTimeoutError = () =>
  Object.assign(new Error('timeout of 3000ms exceeded'), {
    isAxiosError: true,
    code: 'ECONNABORTED',
  });

// The optimistic copy the UI SDK puts into state before sending
const localCopyOf = (
  id: string,
  status: 'sending' | 'failed' | 'received',
  createdAt: string,
) =>
  ({
    ...generateMsg({ id, text: 'hello', user: { id: 'alice' } }),
    created_at: createdAt,
    status,
  }) as MessageResponse;

describe('CHA-5603: re-sending an already stored message id', () => {
  let client: StreamChat;
  let channel: Channel;
  let postSpy: MockInstance;
  let getSpy: MockInstance;

  const localCreatedAt = '2026-10-08T10:00:00.000Z';

  let messageId: string;

  beforeEach(async () => {
    client = await getClientWithUser({ id: 'alice' });
    // getClientWithUser skips the token; requests need one to reach the mocked axios instance
    client.tokenManager.token = 'test-token';
    channel = client.channel('messaging', 'dup-test');
    channel.state.initMessages();

    messageId = `alice-${Math.random().toString(36).slice(2)}`;

    postSpy = vi.spyOn(client.axiosInstance, 'post');
    // recovery must not fetch the stored message
    getSpy = vi.spyOn(client.axiosInstance, 'get');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Channel.sendMessage without offline support', () => {
    it.each(['sending', 'failed', 'received'] as const)(
      'resolves with the local copy when it is %s, without fetching',
      async (status) => {
        channel.state.addMessageSorted(localCopyOf(messageId, status, localCreatedAt));
        postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

        const response = await channel.sendMessage({ id: messageId, text: 'hello' });

        expect(response.message.id).toBe(messageId);
        expect(response.message.created_at).toBe(localCreatedAt);
        expect(getSpy).not.toHaveBeenCalled();
        // shaped like a backend response: no client-only fields
        expect(response.message).not.toHaveProperty('status');
        expect(response.message).not.toHaveProperty('error');
      },
    );

    it('drops the error of the earlier failed attempt and is received once added to state', async () => {
      const quoted = localCopyOf('quoted-id', 'received', '2026-10-08T09:00:00.000Z');
      channel.state.addMessageSorted({
        ...localCopyOf(messageId, 'failed', localCreatedAt),
        // the earlier attempt left its error on the local copy
        error: axiosTimeoutError(),
        quoted_message: quoted,
      } as MessageResponse);
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      const response = await channel.sendMessage({ id: messageId, text: 'hello' });

      expect(response.message).not.toHaveProperty('error');
      expect(response.message).not.toHaveProperty('status');
      expect(response.message.quoted_message?.id).toBe('quoted-id');
      expect(response.message.quoted_message).not.toHaveProperty('status');

      // what the UI SDKs do with the response: formatMessage defaults status to received
      channel.state.addMessageSorted(response.message, true);
      const inState = channel.state.findMessage(messageId);
      expect(inState?.status).toBe('received');
      expect(inState?.error).toBeNull();
    });

    it('still rejects when the message is not in local state', async () => {
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      await expect(channel.sendMessage({ id: messageId, text: 'hello' })).rejects.toThrow(
        /code 4/,
      );
    });

    it('still rejects for other code 4 "already exists" errors (e.g. poll option)', async () => {
      channel.state.addMessageSorted(localCopyOf(messageId, 'sending', localCreatedAt));
      postSpy.mockRejectedValue(
        axiosHttpError(400, 4, 'poll option with text `a` already exists'),
      );

      await expect(channel.sendMessage({ id: messageId, text: 'hello' })).rejects.toThrow(
        /code 4/,
      );
    });
  });

  describe('Channel.sendMessage with offline support', () => {
    let offlineDb: MockOfflineDB;

    beforeEach(() => {
      offlineDb = new MockOfflineDB({ client });
      client.setOfflineDBApi(offlineDb);
      client.wsConnection = { isHealthy: true } as StableWSConnection;
    });

    it('timeout through queueTask falls back to a second POST of the same id, which must not surface as a failure', async () => {
      channel.state.addMessageSorted(localCopyOf(messageId, 'sending', localCreatedAt));
      postSpy
        // 1st attempt (queueTask): the server stored it, but the client gave up at 3s
        .mockRejectedValueOnce(axiosTimeoutError())
        // 2nd attempt (sendMessage catch -> _sendMessage): duplicate id
        .mockRejectedValueOnce(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      const response = await channel.sendMessage({ id: messageId, text: 'hello' });

      expect(postSpy).toHaveBeenCalledTimes(2);
      expect(response.message.id).toBe(messageId);
    });

    describe('cleanup of the send task queued by the timed out attempt', () => {
      const pendingTask = (id: number, type: 'send-message' | 'send-reaction') =>
        ({
          id,
          type,
          channelType: channel.type,
          channelId: channel.id as string,
          messageId,
          payload:
            type === 'send-message'
              ? [{ id: messageId, text: 'hello' }, {}]
              : [messageId, { type: 'like' }],
        }) as PendingTask;

      beforeEach(() => {
        channel.state.addMessageSorted(localCopyOf(messageId, 'sending', localCreatedAt));
        postSpy
          .mockRejectedValueOnce(axiosTimeoutError())
          .mockRejectedValueOnce(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));
      });

      it('deletes the queued send-message task but keeps other tasks of the message', async () => {
        offlineDb.getPendingTasks.mockResolvedValue([
          pendingTask(1, 'send-message'),
          pendingTask(2, 'send-reaction'),
        ]);

        await channel.sendMessage({ id: messageId, text: 'hello' });

        // the timed out attempt queued the task
        expect(offlineDb.addPendingTask).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'send-message', messageId }),
        );
        expect(offlineDb.getPendingTasks).toHaveBeenCalledWith({ messageId });
        expect(offlineDb.deletePendingTask).toHaveBeenCalledTimes(1);
        expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      });

      it('still resolves when the cleanup fails', async () => {
        offlineDb.getPendingTasks.mockRejectedValue(new Error('db closed'));

        const response = await channel.sendMessage({ id: messageId, text: 'hello' });

        expect(response.message.id).toBe(messageId);
        expect(offlineDb.deletePendingTask).not.toHaveBeenCalled();
      });

      it('does not touch the queue when the send cannot be recovered', async () => {
        channel.state.clearMessages();

        await expect(
          channel.sendMessage({ id: messageId, text: 'hello' }),
        ).rejects.toThrow(/code 4/);
        expect(offlineDb.getPendingTasks).not.toHaveBeenCalled();
      });
    });

    it('offline-queue replay is unchanged: the task is dropped and the local copy is left as is', async () => {
      channel.state.addMessageSorted(localCopyOf(messageId, 'failed', localCreatedAt));
      offlineDb.getPendingTasks.mockResolvedValue([
        {
          id: 1,
          type: 'send-message',
          channelType: channel.type,
          channelId: channel.id as string,
          messageId,
          payload: [{ id: messageId, text: 'hello' }, {}],
        },
      ]);
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      await offlineDb.executePendingTasks();

      // code 4 is skippable, so the task is deleted; recovery is left to a user retry
      expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      expect(getSpy).not.toHaveBeenCalled();
      expect(offlineDb.upsertMessages).not.toHaveBeenCalled();
      expect(channel.state.messages.find((m) => m.id === messageId)?.status).toBe(
        'failed',
      );
    });

    it('a leftover queued send for an already received message replays harmlessly', async () => {
      // the timeout -> fallback path resolved the send, but its queued task was left behind
      channel.state.addMessageSorted(localCopyOf(messageId, 'received', localCreatedAt));
      offlineDb.getPendingTasks.mockResolvedValue([
        {
          id: 1,
          type: 'send-message',
          channelType: channel.type,
          channelId: channel.id as string,
          messageId,
          payload: [{ id: messageId, text: 'hello' }, {}],
        },
      ]);
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      await offlineDb.executePendingTasks();

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      const inState = channel.state.messages.filter((m) => m.id === messageId);
      expect(inState).toHaveLength(1);
      expect(inState[0].status).toBe('received');
    });
  });
});
