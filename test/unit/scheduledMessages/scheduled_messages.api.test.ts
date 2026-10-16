import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledMessageResponse, StreamChat } from '../../../src';
import { APIErrorCodes } from '../../../src/errors';
import { getClientWithUser } from '../test-utils/getClient';
import { mockChannelQueryResponse } from '../test-utils/mockChannelQueryResponse';

const scheduledMessage: ScheduledMessageResponse = {
  id: 'sm-1',
  cid: 'messaging:general',
  user: { id: 'user1' },
  message: { text: 'see you tomorrow', mood: 'happy' },
  scheduled_at: '2030-01-01T00:00:00Z',
  status: 'scheduled',
  created_at: '2026-10-15T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
};

const setup = () => getClientWithUser({ id: 'user1' }) as StreamChat;

describe('scheduled messages API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('client', () => {
    it('updateScheduledMessage sends a PATCH to the scheduled message', async () => {
      const client = setup();
      const spy = vi
        .spyOn(client, 'patch')
        .mockResolvedValue({ scheduled_message: scheduledMessage });

      await client.updateScheduledMessage('sm/1', {
        message: { text: 'edited' },
        scheduled_at: '2030-01-01T00:00:00Z',
      });

      expect(spy).toHaveBeenCalledWith(`${client.baseURL}/scheduled_messages/sm%2F1`, {
        message: { text: 'edited' },
        scheduled_at: '2030-01-01T00:00:00Z',
      });
    });

    it('deleteScheduledMessage sends a DELETE to the scheduled message', async () => {
      const client = setup();
      const spy = vi
        .spyOn(client, 'delete')
        .mockResolvedValue({ scheduled_message: scheduledMessage });

      await client.deleteScheduledMessage('sm-1');

      expect(spy).toHaveBeenCalledWith(`${client.baseURL}/scheduled_messages/sm-1`);
    });

    it('sendScheduledMessageNow sends a POST to send_now', async () => {
      const client = setup();
      const spy = vi
        .spyOn(client, 'post')
        .mockResolvedValue({ scheduled_message: scheduledMessage });

      await client.sendScheduledMessageNow('sm-1');

      expect(spy).toHaveBeenCalledWith(
        `${client.baseURL}/scheduled_messages/sm-1/send_now`,
      );
    });

    it('queryScheduledMessages posts the filter, normalized sort and pagination', async () => {
      const client = setup();
      const spy = vi
        .spyOn(client, 'post')
        .mockResolvedValue({ scheduled_messages: [scheduledMessage], next: 'n2' });

      const response = await client.queryScheduledMessages({
        filter: { cid: 'messaging:general', status: ['scheduled', 'failed'] },
        sort: { scheduled_at: 1 },
        limit: 100,
        next: 'n1',
      });

      expect(spy).toHaveBeenCalledWith(`${client.baseURL}/scheduled_messages/query`, {
        filter: { cid: 'messaging:general', status: ['scheduled', 'failed'] },
        sort: [{ field: 'scheduled_at', direction: 1 }],
        limit: 100,
        next: 'n1',
      });
      expect(response.scheduled_messages).toEqual([scheduledMessage]);
    });

    it('queryScheduledMessages works without options', async () => {
      const client = setup();
      const spy = vi.spyOn(client, 'post').mockResolvedValue({ scheduled_messages: [] });

      await client.queryScheduledMessages();

      expect(spy).toHaveBeenCalledWith(`${client.baseURL}/scheduled_messages/query`, {
        sort: undefined,
      });
    });

    it('knows the scheduled message error codes', () => {
      expect(APIErrorCodes['115']).toEqual({
        name: 'ScheduledAtTooSoonError',
        retryable: false,
      });
      expect(APIErrorCodes['122']).toEqual({
        name: 'ScheduledMessageConflictError',
        retryable: true,
      });
    });
  });

  describe('channel', () => {
    it('sendMessage passes scheduled_at through and stores the scheduled message', async () => {
      const client = setup();
      const channel = client.channel('messaging', 'general');
      const spy = vi.spyOn(client, 'post').mockResolvedValue({
        message: { id: 'sm-1', text: 'see you tomorrow' },
        scheduled_message: scheduledMessage,
      });

      const response = await channel.sendMessage(
        { text: 'see you tomorrow' },
        { scheduled_at: '2030-01-01T00:00:00Z' },
      );

      expect(spy).toHaveBeenCalledWith(
        `${client.baseURL}/channels/messaging/general/message`,
        {
          message: { text: 'see you tomorrow' },
          scheduled_at: '2030-01-01T00:00:00Z',
        },
      );
      expect(response.scheduled_message).toEqual(scheduledMessage);
      expect(client.scheduledMessages.getFromState('sm-1')).toEqual(scheduledMessage);
      expect(channel.state.messages).toHaveLength(0);
    });

    it('sendMessage does not queue a scheduled send in the offline DB', async () => {
      const client = setup();
      const queueTask = vi.fn();
      // @ts-expect-error partial offline DB
      client.offlineDb = { queueTask };
      const channel = client.channel('messaging', 'general');
      vi.spyOn(client, 'post').mockResolvedValue({
        message: { id: 'sm-1' },
        scheduled_message: scheduledMessage,
      });

      await channel.sendMessage(
        { id: 'sm-1', text: 'see you tomorrow' },
        { scheduled_at: '2030-01-01T00:00:00Z' },
      );

      expect(queueTask).not.toHaveBeenCalled();
    });

    it('sendMessage without scheduled_at does not touch the scheduled messages store', async () => {
      const client = setup();
      const channel = client.channel('messaging', 'general');
      vi.spyOn(client, 'post').mockResolvedValue({ message: { id: 'm-1' } });

      await channel.sendMessage({ text: 'now' });

      expect(client.scheduledMessages.scheduledMessages.size).toBe(0);
    });

    it('sendMessage drops a scheduled response that arrives after the user disconnected', async () => {
      const client = setup();
      const channel = client.channel('messaging', 'general');
      let resolve!: (value: unknown) => void;
      vi.spyOn(client, 'post').mockReturnValue(
        new Promise((r) => (resolve = r)) as never,
      );
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      const sending = channel.sendMessage(
        { text: 'see you tomorrow' },
        { scheduled_at: '2030-01-01T00:00:00Z' },
      );
      await client.disconnectUser();
      resolve({
        message: { id: 'sm-1', text: 'see you tomorrow' },
        scheduled_message: scheduledMessage,
      });
      await sending;

      expect(client.scheduledMessages.scheduledMessages.size).toBe(0);
    });

    it('query passes include_scheduled_messages and hydrates the store', async () => {
      const client = setup();
      const { cid, id, type } = mockChannelQueryResponse.channel;
      const channel = client.channel(type, id);
      const inChannel = { ...scheduledMessage, cid };
      const spy = vi.spyOn(client, 'post').mockResolvedValue({
        ...mockChannelQueryResponse,
        scheduled_messages: [inChannel],
      });

      await channel.query({ include_scheduled_messages: true });

      expect(spy.mock.calls[0][1]).toEqual(
        expect.objectContaining({ include_scheduled_messages: true }),
      );
      expect(client.scheduledMessages.getForChannel(cid)).toEqual([inChannel]);
    });
  });
});
