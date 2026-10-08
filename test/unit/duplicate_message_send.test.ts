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

// What the server returns: no client-side `status`, server timestamps.
const serverCopyOf = (
  local: Pick<MessageResponse, 'id' | 'text' | 'user'>,
  createdAt: string,
) => {
  const message = generateMsg({
    id: local.id,
    text: local.text,
    user: local.user,
    date: createdAt,
  }) as Partial<MessageResponse>;
  delete message.status;
  return message as MessageResponse;
};

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
  const serverCreatedAt = '2026-10-08T10:00:02.000Z';

  let messageId: string;
  let serverMessage: MessageResponse;

  beforeEach(async () => {
    client = await getClientWithUser({ id: 'alice' });
    // getClientWithUser skips the token; requests need one to reach the mocked axios instance
    client.tokenManager.token = 'test-token';
    channel = client.channel('messaging', 'dup-test');
    channel.state.initMessages();

    messageId = `alice-${Math.random().toString(36).slice(2)}`;
    serverMessage = serverCopyOf(
      { id: messageId, text: 'hello', user: { id: 'alice' } },
      serverCreatedAt,
    );

    postSpy = vi.spyOn(client.axiosInstance, 'post');
    // getMessage(id) — the only way to get the stored copy, the 400 body carries no message
    getSpy = vi.spyOn(client.axiosInstance, 'get').mockResolvedValue({
      status: 200,
      data: { message: serverMessage, duration: '0.01ms' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Channel.sendMessage without offline support', () => {
    it.each(['sending', 'failed'] as const)(
      'resolves with the stored message when the local copy is %s',
      async (status) => {
        channel.state.addMessageSorted(localCopyOf(messageId, status, localCreatedAt));
        postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

        const response = await channel.sendMessage({ id: messageId, text: 'hello' });

        expect(response.message.id).toBe(messageId);
        expect(response.message.created_at).toBe(serverCreatedAt);
        expect(getSpy).toHaveBeenCalledWith(
          expect.stringContaining(`/messages/${encodeURIComponent(messageId)}`),
          expect.anything(),
        );
      },
    );

    it('resolves with the local copy, without a GET, when it is already received', async () => {
      channel.state.addMessageSorted(localCopyOf(messageId, 'received', localCreatedAt));
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      const response = await channel.sendMessage({ id: messageId, text: 'hello' });

      expect(response.message.id).toBe(messageId);
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('falls back to the local copy as received when getMessage fails', async () => {
      channel.state.addMessageSorted(localCopyOf(messageId, 'sending', localCreatedAt));
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));
      getSpy.mockRejectedValue(axiosTimeoutError());

      const response = await channel.sendMessage({ id: messageId, text: 'hello' });

      expect(response.message.id).toBe(messageId);
      expect(response.message.status).toBe('received');
    });

    it('still rejects when the message is not in local state', async () => {
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      await expect(channel.sendMessage({ id: messageId, text: 'hello' })).rejects.toThrow(
        /code 4/,
      );
      expect(getSpy).not.toHaveBeenCalled();
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

    it('still rejects when the stored message belongs to another user', async () => {
      channel.state.addMessageSorted(localCopyOf(messageId, 'sending', localCreatedAt));
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));
      getSpy.mockResolvedValue({
        status: 200,
        data: { message: { ...serverMessage, user: { id: 'mallory' } }, duration: '' },
      });

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

    it('replaying a queued send that gets the duplicate-id error leaves the message as received', async () => {
      // local copy shown as failed after the original attempt timed out
      channel.state.addMessageSorted(localCopyOf(messageId, 'failed', localCreatedAt));

      const task: PendingTask = {
        id: 1,
        type: 'send-message',
        channelType: channel.type,
        channelId: channel.id as string,
        messageId,
        payload: [{ id: messageId, text: 'hello' }, {}],
      };
      offlineDb.getPendingTasks.mockResolvedValue([task]);
      postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));

      await offlineDb.executePendingTasks();

      expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      const inState = channel.state.messages.filter((m) => m.id === messageId);
      expect(inState).toHaveLength(1);
      expect(inState[0].status).toBe('received');
    });

    describe('replay before the channel is loaded into state (cold start)', () => {
      const queueTask = (): PendingTask => ({
        id: 1,
        type: 'send-message',
        channelType: channel.type,
        channelId: channel.id as string,
        messageId,
        payload: [{ id: messageId, text: 'hello' }, {}],
      });

      beforeEach(() => {
        offlineDb.getPendingTasks.mockResolvedValue([queueTask()]);
        postSpy.mockRejectedValue(axiosHttpError(400, 4, DUPLICATE_ID_TEXT(messageId)));
      });

      it('fetches the stored message and writes it to the DB and state', async () => {
        await offlineDb.executePendingTasks();

        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(offlineDb.upsertMessages).toHaveBeenCalledWith({
          messages: [serverMessage],
        });
        expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
        const inState = channel.state.messages.filter((m) => m.id === messageId);
        expect(inState).toHaveLength(1);
        expect(inState[0].status).toBe('received');
      });

      it('does not adopt a stored message owned by another user', async () => {
        getSpy.mockResolvedValue({
          status: 200,
          data: { message: { ...serverMessage, user: { id: 'mallory' } }, duration: '' },
        });

        await offlineDb.executePendingTasks();

        expect(offlineDb.upsertMessages).not.toHaveBeenCalled();
        expect(channel.state.messages.some((m) => m.id === messageId)).toBe(false);
        // code 4 stays skippable, so the task is dropped as before
        expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      });

      it('drops the task as before when the stored message cannot be fetched', async () => {
        getSpy.mockRejectedValue(axiosTimeoutError());

        await offlineDb.executePendingTasks();

        expect(offlineDb.upsertMessages).not.toHaveBeenCalled();
        expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      });

      it('still deletes the task when writing the stored message to the DB fails', async () => {
        offlineDb.upsertMessages.mockRejectedValue(new Error('disk full'));

        await offlineDb.executePendingTasks();

        expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
        expect(channel.state.messages.find((m) => m.id === messageId)?.status).toBe(
          'received',
        );
      });
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
      expect(getSpy).not.toHaveBeenCalled();
      expect(offlineDb.deletePendingTask).toHaveBeenCalledWith({ id: 1 });
      const inState = channel.state.messages.filter((m) => m.id === messageId);
      expect(inState).toHaveLength(1);
      expect(inState[0].status).toBe('received');
    });
  });
});
