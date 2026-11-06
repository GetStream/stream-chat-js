import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CORE_NOTIFICATION_TYPE,
  ScheduledMessageBlockReason,
  StreamChat,
} from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';
import { stubServerConfig } from '../test-utils/stubServerConfig';

const scheduledAt = new Date('2030-01-01T10:00:00.000Z');

const scheduledMessageLimits = {
  scheduled_messages_max_lead_time_seconds: 120 * 24 * 60 * 60,
  scheduled_messages_max_per_channel: 10,
  scheduled_messages_max_per_user: 100,
  scheduled_messages_min_lead_time_seconds: 60,
};

const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
  return { channel, client };
};

const setOwnCapabilities = (
  channel: ReturnType<typeof setup>['channel'],
  ownCapabilities: string[],
) => {
  channel.data = { ...channel.data, own_capabilities: ownCapabilities } as never;
};

describe('scheduled message configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('channel.scheduledMessagesEnabled', () => {
    it('is on while the channel server config is not known yet', () => {
      const { channel } = setup();

      expect(channel.scheduledMessagesEnabled).toBe(true);
    });

    it('is on when the server config has the scheduled message limits', () => {
      const { channel } = setup();
      stubServerConfig(channel, scheduledMessageLimits);
      setOwnCapabilities(channel, ['schedule-message']);

      expect(channel.scheduledMessagesEnabled).toBe(true);
    });

    it('is off when the server config has no scheduled message limits', () => {
      const { channel } = setup();
      stubServerConfig(channel, { replies: true });

      expect(channel.scheduledMessagesEnabled).toBe(false);
    });

    it('is off when the app turns it off', () => {
      const { channel, client } = setup();
      stubServerConfig(channel, scheduledMessageLimits);
      client.config.set({ channel: { scheduledMessages: { enabled: false } } });

      expect(channel.config.scheduledMessages.enabled).toBe(false);
      expect(channel.scheduledMessagesEnabled).toBe(false);
    });

    it('does not let the app turn it on when the server has no limits', () => {
      const { channel, client } = setup();
      stubServerConfig(channel, { replies: true });
      client.config.set({ channel: { scheduledMessages: { enabled: true } } });

      expect(channel.scheduledMessagesEnabled).toBe(false);
    });

    it('is off without the schedule-message capability', () => {
      const { channel } = setup();
      stubServerConfig(channel, scheduledMessageLimits);
      setOwnCapabilities(channel, ['send-message']);

      expect(channel.scheduledMessagesEnabled).toBe(false);
    });
  });

  describe('MessageComposer', () => {
    it('blocks scheduling when scheduled messages are off for the channel', async () => {
      const { channel, client } = setup();
      stubServerConfig(channel, { replies: true });
      const composer = channel.messageComposer;
      const sendSpy = vi.spyOn(client, 'sendMessage');
      const addWarningSpy = vi.spyOn(client.notifications, 'addWarning');
      composer.textComposer.setText('see you tomorrow');

      const result = await composer.schedule(scheduledAt);

      expect(composer.scheduleBlockReason).toBe(ScheduledMessageBlockReason.Unavailable);
      expect(result).toEqual({ status: 'blocked' });
      expect(sendSpy).not.toHaveBeenCalled();
      expect(addWarningSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            metadata: { reason: ScheduledMessageBlockReason.Unavailable },
            type: CORE_NOTIFICATION_TYPE.scheduledMessageBlocked,
          }),
        }),
      );
    });
  });

  describe('client.scheduledMessages.paginator', () => {
    it('loads 100 scheduled messages per page by default', () => {
      const { client } = setup();

      expect(client.scheduledMessages.paginator.pageSize).toBe(100);
      expect(
        client.scheduledMessages.getChannelPaginator('messaging:general').pageSize,
      ).toBe(100);
    });

    it('applies the paging settings to every scheduled message list', async () => {
      const { client } = setup();
      const channelPaginator =
        client.scheduledMessages.getChannelPaginator('messaging:a');
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValue({ scheduled_messages: [], duration: '' } as never);

      client.config.set({
        client: { scheduledMessages: { paginator: { pageSize: 25 } } },
      });

      expect(client.scheduledMessages.paginator.pageSize).toBe(25);
      expect(channelPaginator.pageSize).toBe(25);
      expect(client.scheduledMessages.getChannelPaginator('messaging:b').pageSize).toBe(
        25,
      );
      await client.scheduledMessages.paginator.toTail();
      expect(querySpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    });

    it('keeps the paging settings after the user disconnects', async () => {
      const { client } = setup();
      client.config.set({
        client: { scheduledMessages: { paginator: { pageSize: 25 } } },
      });
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      await client.disconnectUser();

      expect(client.scheduledMessages.paginator.pageSize).toBe(25);
    });
  });
});
