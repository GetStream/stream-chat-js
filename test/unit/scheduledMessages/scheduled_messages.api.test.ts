import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SCHEDULED_MESSAGE_LIMITS,
  getScheduledMessageErrorReason,
  getScheduledMessageLimits,
  ScheduledMessageErrorReason,
  ScheduledMessageResponse,
  StreamChat,
} from '../../../src';
import { APIErrorCodes } from '../../../src/errors';
import { generateAPIError } from '../test-utils/generateAPIError';
import { getClientWithUser } from '../test-utils/getClient';
import { MockOfflineDB } from '../offline-support/MockOfflineDB';
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
        retryable: false,
      });
      expect(APIErrorCodes['123']).toEqual({
        name: 'ScheduledMessageAlreadySentError',
        retryable: false,
      });
      expect(APIErrorCodes['124']).toEqual({
        name: 'ScheduledMessageCanceledError',
        retryable: false,
      });
    });
  });

  describe('queryChannels', () => {
    it('passes include_scheduled_messages', async () => {
      const client = setup();
      const channelState = {
        ...mockChannelQueryResponse,
        scheduled_messages: [scheduledMessage],
      };
      const spy = vi
        .spyOn(client, 'post')
        .mockResolvedValue({ channels: [channelState] });

      await client.queryChannels({}, [], { include_scheduled_messages: true });

      expect(spy.mock.calls[0][0]).toBe(`${client.baseURL}/channels`);
      expect(spy.mock.calls[0][1]).toEqual(
        expect.objectContaining({ include_scheduled_messages: true }),
      );
    });

    it('does not send include_scheduled_messages unless asked', async () => {
      const client = setup();
      const spy = vi.spyOn(client, 'post').mockResolvedValue({ channels: [] });

      await client.queryChannels({}, [], {});

      expect(spy.mock.calls[0][1]).not.toHaveProperty('include_scheduled_messages');
    });
  });

  describe('channel', () => {
    it('query passes include_scheduled_messages', async () => {
      const client = setup();
      const { id, type } = mockChannelQueryResponse.channel;
      const channel = client.channel(type, id);
      const spy = vi.spyOn(client, 'post').mockResolvedValue({
        ...mockChannelQueryResponse,
        scheduled_messages: [scheduledMessage],
      });

      await channel.query({ include_scheduled_messages: true });

      expect(spy.mock.calls[0][1]).toEqual(
        expect.objectContaining({ include_scheduled_messages: true }),
      );
    });

    it('sendMessage passes scheduled_at through and returns the scheduled message', async () => {
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
      expect(channel.state.messages).toHaveLength(0);
    });

    it('sendMessage does not queue a scheduled send in the offline DB', async () => {
      const client = setup();
      const offlineDb = new MockOfflineDB({ client });
      client.setOfflineDBApi(offlineDb);
      const queueTask = vi.spyOn(offlineDb, 'queueTask').mockResolvedValue({});
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

    it('sendMessage without scheduled_at still goes through the offline DB', async () => {
      const client = setup();
      const offlineDb = new MockOfflineDB({ client });
      client.setOfflineDBApi(offlineDb);
      const queueTask = vi
        .spyOn(offlineDb, 'queueTask')
        .mockResolvedValue({ message: { id: 'm-1' } });
      const channel = client.channel('messaging', 'general');

      await channel.sendMessage({ id: 'm-1', text: 'now' });

      expect(queueTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('getScheduledMessageErrorReason', () => {
    it('reads the reason from exception_fields', () => {
      expect(
        getScheduledMessageErrorReason(
          generateAPIError(124, 'scheduled_message_canceled'),
        ),
      ).toBe(ScheduledMessageErrorReason.Canceled);
    });

    it('falls back to the error code', () => {
      expect(getScheduledMessageErrorReason(generateAPIError(114))).toBe(
        ScheduledMessageErrorReason.Disabled,
      );
      expect(getScheduledMessageErrorReason(generateAPIError(123))).toBe(
        ScheduledMessageErrorReason.AlreadySent,
      );
    });

    it('maps every scheduled message error code to its reason', () => {
      const reasons = Array.from({ length: 11 }, (_, index) =>
        getScheduledMessageErrorReason(generateAPIError(114 + index)),
      );

      expect(reasons).toEqual([
        ScheduledMessageErrorReason.Disabled,
        ScheduledMessageErrorReason.TooSoon,
        ScheduledMessageErrorReason.TooFar,
        ScheduledMessageErrorReason.ChannelLimit,
        ScheduledMessageErrorReason.UserLimit,
        ScheduledMessageErrorReason.IdTaken,
        ScheduledMessageErrorReason.NotEditable,
        ScheduledMessageErrorReason.Sending,
        ScheduledMessageErrorReason.Conflict,
        ScheduledMessageErrorReason.AlreadySent,
        ScheduledMessageErrorReason.Canceled,
      ]);
    });

    it('ignores an unknown reason and uses the code', () => {
      expect(
        getScheduledMessageErrorReason(generateAPIError(117, 'something_else')),
      ).toBe(ScheduledMessageErrorReason.ChannelLimit);
    });

    it('returns undefined for errors that are not scheduled message errors', () => {
      const reasonOnPlainError = Object.assign(new Error('failed'), {
        code: 114,
        response: {
          data: { exception_fields: { reason: 'scheduled_messages_disabled' } },
        },
      });

      expect(getScheduledMessageErrorReason(generateAPIError(4))).toBeUndefined();
      expect(getScheduledMessageErrorReason(new Error('network'))).toBeUndefined();
      expect(getScheduledMessageErrorReason(reasonOnPlainError)).toBeUndefined();
    });
  });

  describe('getScheduledMessageLimits', () => {
    it('returns the defaults when the channel config has no limits', () => {
      const client = setup();
      const channel = client.channel('messaging', 'general');

      expect(getScheduledMessageLimits(channel)).toEqual(
        DEFAULT_SCHEDULED_MESSAGE_LIMITS,
      );
      expect(DEFAULT_SCHEDULED_MESSAGE_LIMITS).toEqual({
        maxLeadTimeSeconds: 10368000,
        maxPerChannel: 10,
        maxPerUser: 100,
        minLeadTimeSeconds: 60,
      });
    });

    it('reads the limits from the channel config', () => {
      const client = setup();
      const channel = client.channel('messaging', 'general');
      client.configs[channel.cid] = {
        reminders: false,
        created_at: '',
        updated_at: '',
        scheduled_messages_max_lead_time_seconds: 3600,
        scheduled_messages_max_per_channel: 5,
        scheduled_messages_max_per_user: 50,
        scheduled_messages_min_lead_time_seconds: 120,
      };

      expect(getScheduledMessageLimits(channel)).toEqual({
        maxLeadTimeSeconds: 3600,
        maxPerChannel: 5,
        maxPerUser: 50,
        minLeadTimeSeconds: 120,
      });
    });

    it('falls back per field when the config is partial', () => {
      const client = setup();
      const channel = client.channel('messaging', 'general');
      client.configs[channel.cid] = {
        reminders: false,
        created_at: '',
        updated_at: '',
        scheduled_messages_max_per_channel: 3,
      };

      expect(getScheduledMessageLimits(channel)).toEqual({
        ...DEFAULT_SCHEDULED_MESSAGE_LIMITS,
        maxPerChannel: 3,
      });
    });
  });
});
