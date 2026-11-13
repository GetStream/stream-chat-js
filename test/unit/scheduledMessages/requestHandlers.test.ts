import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduledMessageResponse, StreamChat } from '../../../src';
import { msToNs, nowNs } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';

const channelType = 'messaging';
const channelId = 'general';
const cid = `${channelType}:${channelId}`;
const scheduledAt = new Date('2030-01-01T10:00:00.000Z');

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse =>
  ({
    id: 'sm-1',
    cid,
    user: { id: 'user1' },
    message: { text: 'see you tomorrow' },
    scheduled_at: msToNs(scheduledAt.getTime()),
    status: 'scheduled',
    created_at: nowNs(),
    updated_at: nowNs(),
    ...data,
  }) as ScheduledMessageResponse;

const response = (scheduled_message: ScheduledMessageResponse) =>
  ({ duration: '', scheduled_message }) as never;

const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const channel = client.channelManager.ensure({ type: channelType, id: channelId });
  // A loaded, empty list, so what an action stores is visible in it.
  channel.scheduledMessagesPaginator.hydrate([]);
  const store = client.scheduledMessageStore;
  return { channel, client, store };
};

const listed = (channel: ReturnType<typeof setup>['channel']) =>
  channel.scheduledMessagesPaginator.items ?? [];

describe('scheduled message request handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('schedules through scheduleMessageRequest and lists the result', async () => {
    const { channel, client, store } = setup();
    const scheduledMessage = generateScheduledMessage();
    const scheduleMessageRequest = vi.fn().mockResolvedValue({
      duration: '',
      message: { id: 'm-1' },
      scheduled_message: scheduledMessage,
    });
    const sendSpy = vi.spyOn(client, 'sendMessage');
    client.config.set({ channel: { requestHandlers: { scheduleMessageRequest } } });
    channel.messageComposer.textComposer.setText('see you tomorrow');

    const result = await channel.messageComposer.schedule(scheduledAt);

    expect(result).toEqual({ scheduledMessage, status: 'scheduled' });
    expect(scheduleMessageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ text: 'see you tomorrow' }),
        scheduled_at: scheduledAt,
      }),
      expect.any(Function),
    );
    expect(sendSpy).not.toHaveBeenCalled();
    expect(store.get(scheduledMessage.id)).toBe(scheduledMessage);
    expect(listed(channel)).toEqual([scheduledMessage]);
  });

  it('lets scheduleMessageRequest send the default request', async () => {
    const { channel, client } = setup();
    const scheduledMessage = generateScheduledMessage();
    const sendSpy = vi.spyOn(client, 'sendMessage').mockResolvedValue({
      duration: '',
      message: { id: 'm-1' },
      scheduled_message: scheduledMessage,
    } as never);
    client.config.set({
      channel: {
        requestHandlers: {
          scheduleMessageRequest: (params, defaultRequest) =>
            defaultRequest({ ...params, skip_push: true }),
        },
      },
    });

    await channel.scheduleMessage({
      message: { text: 'see you tomorrow' },
      scheduled_at: scheduledAt,
    });

    expect(sendSpy).toHaveBeenCalledWith(
      { id: channelId, type: channelType },
      expect.objectContaining({ scheduled_at: scheduledAt, skip_push: true }),
      undefined,
    );
  });

  it('updates through updateScheduledMessageRequest', async () => {
    const { channel, client, store } = setup();
    const scheduledMessage = generateScheduledMessage();
    channel.scheduledMessagesPaginator.ingestItem(scheduledMessage);
    const updated = { ...scheduledMessage, message: { text: 'edited' } };
    const updateScheduledMessageRequest = vi.fn().mockResolvedValue(response(updated));
    const updateSpy = vi.spyOn(client, 'updateScheduledMessage');
    client.config.set({
      channel: { requestHandlers: { updateScheduledMessageRequest } },
    });

    await channel.updateScheduledMessage(scheduledMessage.id, {
      message: { text: 'edited' },
    });

    expect(updateScheduledMessageRequest).toHaveBeenCalledWith(
      { id: scheduledMessage.id, request: { message: { text: 'edited' } } },
      expect.any(Function),
    );
    expect(updateSpy).not.toHaveBeenCalled();
    expect(store.get(scheduledMessage.id)).toBe(updated);
    expect(listed(channel)).toEqual([updated]);
  });

  it('deletes through deleteScheduledMessageRequest', async () => {
    const { channel, client, store } = setup();
    const scheduledMessage = generateScheduledMessage();
    channel.scheduledMessagesPaginator.ingestItem(scheduledMessage);
    const deleteScheduledMessageRequest = vi
      .fn()
      .mockResolvedValue(response({ ...scheduledMessage, status: 'canceled' }));
    const deleteSpy = vi.spyOn(client, 'deleteScheduledMessage');
    client.config.set({
      channel: { requestHandlers: { deleteScheduledMessageRequest } },
    });

    await channel.deleteScheduledMessage(scheduledMessage.id);

    expect(deleteScheduledMessageRequest).toHaveBeenCalledWith(
      { id: scheduledMessage.id },
      expect.any(Function),
    );
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(store.get(scheduledMessage.id)).toBeUndefined();
    expect(listed(channel)).toEqual([]);
  });

  it('sends now through sendScheduledMessageNowRequest', async () => {
    const { channel, client } = setup();
    const scheduledMessage = generateScheduledMessage();
    channel.scheduledMessagesPaginator.ingestItem(scheduledMessage);
    const sendScheduledMessageNowRequest = vi
      .fn()
      .mockResolvedValue(response({ ...scheduledMessage, status: 'sending' }));
    const sendNowSpy = vi.spyOn(client, 'sendScheduledMessageNow');
    client.config.set({
      channel: { requestHandlers: { sendScheduledMessageNowRequest } },
    });

    await channel.sendScheduledMessageNow(scheduledMessage.id);

    expect(sendScheduledMessageNowRequest).toHaveBeenCalledWith(
      { id: scheduledMessage.id },
      expect.any(Function),
    );
    expect(sendNowSpy).not.toHaveBeenCalled();
  });

  it("uses the channel's own handler over the shared one", async () => {
    const { channel, client } = setup();
    const scheduledMessage = generateScheduledMessage();
    channel.scheduledMessagesPaginator.ingestItem(scheduledMessage);
    const sharedHandler = vi.fn();
    const channelHandler = vi
      .fn()
      .mockResolvedValue(response({ ...scheduledMessage, status: 'canceled' }));
    client.config.set({
      channel: { requestHandlers: { deleteScheduledMessageRequest: sharedHandler } },
    });
    channel.configState.partialNext({
      requestHandlers: { deleteScheduledMessageRequest: channelHandler },
    });

    await channel.deleteScheduledMessage(scheduledMessage.id);

    expect(channelHandler).toHaveBeenCalled();
    expect(sharedHandler).not.toHaveBeenCalled();
  });

  it('uses the shared handler from a channel instance made only to act on its message', async () => {
    const { client } = setup();
    const scheduledMessage = generateScheduledMessage({ cid: 'messaging:not-open' });
    const deleteScheduledMessageRequest = vi
      .fn()
      .mockResolvedValue(response({ ...scheduledMessage, status: 'canceled' }));
    client.config.set({
      channel: { requestHandlers: { deleteScheduledMessageRequest } },
    });

    await client
      .channel('messaging', 'not-open')
      .deleteScheduledMessage(scheduledMessage.id);

    expect(deleteScheduledMessageRequest).toHaveBeenCalled();
  });
});
